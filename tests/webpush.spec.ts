import { expect, test } from '@playwright/test';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from 'node:crypto';
import { encryptPayload, vapidAuthorization } from '../src/lib/webpush-crypto';

/**
 * Eigene Web-Push-Implementierung gegen RFC 8291, Anhang A (Testvektor) und RFC 8292 (VAPID-Signatur).
 * Läuft ohne Browser und ohne Netz.
 */
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};
const b = (s: string) => Buffer.from(s, 'base64url');

/** Unabhängige Entschlüsselung aus Sicht des Browsers (RFC 8291 Abschnitt 3) */
function decrypt(message: Buffer, uaPrivate: Buffer, auth: Buffer): string {
  const salt = message.subarray(0, 16);
  const idlen = message[20]!;
  const asPublic = message.subarray(21, 21 + idlen);
  const ciphertext = message.subarray(21 + idlen);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, -16)), d.final()]);
  expect(plain.at(-1)).toBe(2); // Trennbyte des letzten Datensatzes
  return plain.subarray(0, -1).toString('utf8');
}

test('RFC 8291 Anhang A: Testvektor wird exakt erzeugt', () => {
  const out = encryptPayload(Buffer.from(V.plaintext), { p256dh: V.uaPublic, auth: V.auth }, { salt: b(V.salt), asPrivate: b(V.asPrivate) });
  expect(out.toString('base64url')).toBe(V.message);
});

test('Zufällige Verschlüsselung lässt sich mit dem Browser-Schlüssel entschlüsseln', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  const text = JSON.stringify({ title: 'Termin frei', body: 'Ja oder Nein?', url: '/app/angebot/x' });
  const out = encryptPayload(Buffer.from(text), { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') });
  expect(decrypt(out, ua.getPrivateKey(), auth)).toBe(text);
  // jede Nachricht mit neuem Salz und neuem Schlüssel
  const again = encryptPayload(Buffer.from(text), { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') });
  expect(again.subarray(0, 16).equals(out.subarray(0, 16))).toBe(false);
});

test('Ungültige Abo-Schlüssel werden abgelehnt', () => {
  expect(() => encryptPayload(Buffer.from('x'), { p256dh: 'AAAA', auth: V.auth })).toThrow('invalid_subscription_keys');
});

test('RFC 8292: VAPID-JWT ist mit dem öffentlichen Schlüssel prüfbar (ES256)', () => {
  const kp = createECDH('prime256v1');
  kp.generateKeys();
  const publicKey = kp.getPublicKey().toString('base64url');
  const privateKey = kp.getPrivateKey().toString('base64url');
  const now = Date.UTC(2026, 9, 14, 20, 0, 0);
  const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { publicKey, privateKey, subject: 'mailto:info@example.com' }, now);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
  expect(m[4]).toBe(publicKey);
  const claims = JSON.parse(b(m[2]!).toString('utf8'));
  expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:info@example.com' });
  expect(JSON.parse(b(m[1]!).toString('utf8'))).toEqual({ typ: 'JWT', alg: 'ES256' });
  const pub = kp.getPublicKey();
  const key = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  const ok = verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, b(m[3]!));
  expect(ok).toBe(true);
});
