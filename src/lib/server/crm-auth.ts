import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import { safeEqual, serverEnv } from './env';
import { supabaseAdmin } from './supabase';

/**
 * Absicherung der CRM-Schnittstelle /api/crm/v1 (Server-zu-Server, nie aus dem Browser).
 *
 * Jede Anfrage trägt:
 *   X-HB-Key        Schlüssel-ID (z. B. hello-beauty-crm) – in crm_bridge_keys fest an EINEN Tenant gebunden
 *   X-HB-Timestamp  Unix-Sekunden; höchstens 5 Minuten Abweichung
 *   X-HB-Nonce      16–100 zufällige Zeichen, je Schlüssel nur einmal verwendbar (Wiederholungsschutz)
 *   X-HB-Signature  hex(HMAC-SHA256(CRM_BRIDGE_SECRET, Kanon))
 * Kanon = `${timestamp}\n${nonce}\n${METHOD}\n${Pfad inkl. Query}\n${hex(SHA-256(Body))}`
 *
 * Reihenfolge: Format → Zeitfenster → Signatur (konstante Zeit) → DB (Nonce, Rate-Limit, Tenant).
 * Der Tenant kommt ausschließlich aus dem Schlüssel, nie aus der Anfrage.
 */

export const CRM_KEY_ID = 'hello-beauty-crm';
const MAX_SKEW_S = 300;
const RATE_PER_MIN = 120;

export type CrmAuthError = 'unauthorized' | 'stale' | 'bad_signature' | 'replay' | 'rate_limited' | 'not_configured';

/** Schlüssel-ID → Geheimnis. Weitere Salons bekommen eigene IDs und eigene Geheimnisse. */
function secretFor(keyId: string): string | null {
  return keyId === CRM_KEY_ID ? serverEnv.crmBridgeSecret() : null;
}

export function canonical(ts: string, nonce: string, method: string, pathWithQuery: string, body: string): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return `${ts}\n${nonce}\n${method.toUpperCase()}\n${pathWithQuery}\n${bodyHash}`;
}

export function signRequest(secret: string, ts: string, nonce: string, method: string, pathWithQuery: string, body: string): string {
  return createHmac('sha256', secret).update(canonical(ts, nonce, method, pathWithQuery, body)).digest('hex');
}

export async function verifyCrmRequest(
  req: Request,
  body: string,
  now = Date.now(),
): Promise<{ ok: true; tenantId: string; keyId: string } | { ok: false; error: CrmAuthError }> {
  const keyId = req.headers.get('x-hb-key') ?? '';
  const ts = req.headers.get('x-hb-timestamp') ?? '';
  const nonce = req.headers.get('x-hb-nonce') ?? '';
  const signature = (req.headers.get('x-hb-signature') ?? '').toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(keyId) || !/^\d{9,11}$/.test(ts) || !/^[A-Za-z0-9_-]{16,100}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, error: 'unauthorized' };
  }
  const secret = secretFor(keyId);
  if (!secret) return { ok: false, error: serverEnv.crmBridgeSecret() ? 'unauthorized' : 'not_configured' };
  if (Math.abs(now / 1000 - Number(ts)) > MAX_SKEW_S) return { ok: false, error: 'stale' };
  const url = new URL(req.url);
  const expected = signRequest(secret, ts, nonce, req.method, url.pathname + url.search, body);
  if (!safeEqual(signature, expected)) return { ok: false, error: 'bad_signature' };

  // erst nach gültiger Signatur in die DB: Nonce verbrauchen, Rate-Limit, Tenant aus dem Schlüssel
  const { data, error } = await supabaseAdmin().rpc('svc_crm_admit', { p_key_id: keyId, p_nonce: nonce, p_limit_per_min: RATE_PER_MIN });
  if (error) {
    const code = error.message;
    return { ok: false, error: code === 'replay' ? 'replay' : code === 'rate_limited' ? 'rate_limited' : 'unauthorized' };
  }
  return { ok: true, tenantId: data as string, keyId };
}
