import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

/**
 * Kryptografie für Web-Push (ohne server-only, damit der RFC-Testvektor auch im Test läuft – nur von Server-Code importieren).
 * Web-Push ohne Fremdpaket – nur node:crypto.
 * - Verschlüsselung: RFC 8291 (Message Encryption for Web Push) mit RFC 8188 „aes128gcm“, ein Datensatz.
 * - Absender-Nachweis: RFC 8292 (VAPID), JWT mit ES256, Header „Authorization: vapid t=…, k=…“.
 * Geprüft gegen den Testvektor aus RFC 8291 Anhang A (tests/webpush.spec.ts).
 */

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

export interface PushTarget {
  endpoint: string;
  /** öffentlicher Schlüssel des Browsers (65 Byte, unkomprimiert), base64url */
  p256dh: string;
  /** Authentifizierungs-Geheimnis des Browsers (16 Byte), base64url */
  auth: string;
}

/** RFC 8291 Abschnitt 3.4 + RFC 8188: verschlüsselter Body (Header + Ciphertext). `fixed` nur für den Testvektor. */
export function encryptPayload(
  plaintext: Buffer,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  fixed?: { salt: Buffer; asPrivate: Buffer },
): Buffer {
  const uaPublic = fromB64u(target.p256dh);
  const authSecret = fromB64u(target.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16) throw new Error('invalid_subscription_keys');

  const ecdh = createECDH('prime256v1');
  if (fixed) ecdh.setPrivateKey(fixed.asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = fixed?.salt ?? randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // ein einziger (letzter) Datensatz: Klartext + Trennbyte 0x02, keine Auffüllung
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** RFC 8292: VAPID-JWT (ES256) für die Origin des Push-Dienstes, 12 Stunden gültig */
export function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }, now = Date.now()) {
  const pub = fromB64u(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('invalid_vapid_public_key');
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(
    Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject })),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

