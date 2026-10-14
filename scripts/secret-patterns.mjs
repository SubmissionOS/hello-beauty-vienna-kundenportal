/**
 * Muster für Geheimnisse – gemeinsam genutzt vom Pre-Commit-Hook und vom Build-Scan.
 * Gefundene Werte werden NIE ausgegeben, nur Datei, Zeile und Art des Treffers.
 *
 * Quellen der Präfixe (recherchiert 2026-10-14):
 * - Supabase Secret Key: sb_secret_…  (Publishable Key sb_publishable_… ist öffentlich und erlaubt)
 *   https://supabase.com/docs/guides/api/api-keys
 * - Supabase Personal Access Token (CLI/Management API): sbp_… (scoped: sbp_fc…)
 *   https://supabase.com/docs/guides/platform/personal-access-tokens
 * - Resend API Key: re_<id>_<secret>
 *   https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/detectors/specifics/resend_apikey
 * - Legacy service_role-Key: JWT, dessen Payload "role":"service_role" enthält (wird dekodiert geprüft)
 */

export const patterns = [
  { name: 'Supabase Secret Key (sb_secret_)', re: /sb_secret_[A-Za-z0-9_-]{8,}/g },
  { name: 'Supabase Access Token (sbp_)', re: /\bsbp_[A-Za-z0-9_]{20,}/g },
  { name: 'Resend API Key (re_)', re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{12,}/g },
  { name: 'Postgres-URL mit Passwort', re: /postgres(?:ql)?:\/\/[^:\s/'"]+:[^@\s'"]{6,}@/g },
];

const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function isServiceRoleJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload?.role === 'service_role' || payload?.role === 'supabase_admin';
  } catch {
    return false;
  }
}

/**
 * Durchsucht Text. `literals` = konkrete geheime Werte (z. B. aus .env.local), die nirgends auftauchen dürfen.
 * Rückgabe: [{ line, kind }] – ohne den gefundenen Wert.
 */
export function scanText(text, literals = []) {
  const hits = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) hits.push({ line: lineOf(m.index), kind: name });
  }
  for (const m of text.matchAll(jwtRe)) {
    if (isServiceRoleJwt(m[0])) hits.push({ line: lineOf(m.index), kind: 'service_role-JWT' });
  }
  for (const { name, value } of literals) {
    if (!value || value.length < 8) continue;
    let i = text.indexOf(value);
    while (i !== -1) {
      hits.push({ line: lineOf(i), kind: `Wert von ${name}` });
      i = text.indexOf(value, i + value.length);
    }
  }
  return hits;
}

/** Private Variablen (nie mit NEXT_PUBLIC_, nie im Client). */
export const privateVars = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'DEMO_CUSTOMER_PASSWORD',
  'RESEND_API_KEY',
];

/** Erlaubt sind nur .env.example (Vorlage ohne Werte). */
export const isForbiddenEnvFile = (path) => {
  const base = path.split(/[\\/]/).pop() ?? '';
  return base.startsWith('.env') && base !== '.env.example';
};
