import 'server-only';

import { encryptPayload, vapidAuthorization, type PushTarget } from '../webpush-crypto';

export type { PushTarget } from '../webpush-crypto';

export interface PushMessage {
  title: string;
  body: string;
  /** relativer Pfad in der App, z. B. /app/angebot/<id> */
  url: string;
  tag?: string;
}

export interface PushResult {
  ok: boolean;
  /** Abo existiert nicht mehr (404/410) → löschen */
  gone: boolean;
  status: number;
}

/** Nur Push-Dienste über HTTPS – verhindert, dass ein manipuliertes Abo interne Adressen ansteuert */
function safeEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function sendPush(
  target: PushTarget,
  message: PushMessage,
  keys: { publicKey: string; privateKey: string; subject: string },
  opts: { ttlSeconds?: number; urgency?: 'normal' | 'high' } = {},
): Promise<PushResult> {
  if (!safeEndpoint(target.endpoint)) return { ok: false, gone: true, status: 0 };
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), target);
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(target.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttlSeconds ?? 3600),
      Urgency: opts.urgency ?? 'normal',
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status };
}
