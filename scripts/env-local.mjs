/**
 * .env.local verwalten, ohne Werte anzuzeigen.
 *   node scripts/env-local.mjs init    legt .env.local an (nur wenn sie fehlt – überschreibt nie)
 *   node scripts/env-local.mjs check   zeigt je Variable nur „gesetzt“ oder „fehlt“
 *   node scripts/env-local.mjs ensure  ergänzt fehlende Variablen; Schlüssel (CRM, VAPID, Worker) werden lokal
 *                                      erzeugt – vorhandene Werte bleiben unverändert, nichts wird ausgegeben
 *   node scripts/env-local.mjs example schreibt .env.example (nur Namen und Kommentare)
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = '.env.local';

/** [Name, Wert in .env.local, Kommentar, Pflicht für Teil 2] – Wert nur bei öffentlichen Variablen */
export const vars = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'https://cayqrguxnjlnofmkkokt.supabase.co', 'Öffentlich. Projekt-URL. Vercel: ja (Production + Preview).', true],
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_RbJJcx07hzw57hhGjBcd5A_TeRBrSX4', 'Öffentlich (darf ins Frontend, RLS schützt die Daten). Vercel: ja.', true],
  ['NEXT_PUBLIC_DATA_ADAPTER', 'supabase', 'Öffentlich. mock | supabase. Vercel: ja (supabase).', true],
  ['NEXT_PUBLIC_AUTH_ADAPTER', 'supabase', 'Öffentlich. mock | supabase. Vercel: ja (supabase).', true],
  ['NEXT_PUBLIC_DEMO_MODE', 'true', 'Öffentlich. true zeigt „Als Demo-Kundin ansehen“. Vercel: nur wo die Demo gewünscht ist.', false],
  ['NEXT_PUBLIC_APP_URL', '', 'Öffentlich. Feste App-Adresse für den QR-Code, leer = aktuelle Adresse. Vercel: ja, sobald die Subdomain steht.', false],
  ['NEXT_PUBLIC_SALON_WEBSITE_URL', '', 'Öffentlich. Basis für Impressum/Datenschutz-Links, leer = https://hellobeautysalon.at. Vercel: optional.', false],
  ['SUPABASE_SECRET_KEY', '', 'PRIVAT, nur Server (umgeht RLS!). Dashboard → Project Settings → API Keys → Secret keys → sb_secret_… Vercel: ja, als Sensitive.', true],
  ['SUPABASE_ACCESS_TOKEN', '', 'PRIVAT, nur lokal für die Supabase-CLI. Dashboard → Account (oben rechts) → Access Tokens → Generate new token (sbp_…). Vercel: NIE.', true],
  ['SUPABASE_DB_PASSWORD', '', 'PRIVAT, nur lokal für die CLI (Migrationen). Dashboard → Project Settings → Database → Database password (ggf. „Reset“). Vercel: NIE.', true],
  ['DEMO_CUSTOMER_PASSWORD', '', 'PRIVAT, nur Server. Selbst wählen, mind. 24 zufällige Zeichen (Passwort der Demo-Kundin, wird nie angezeigt). Vercel: ja, als Sensitive, nur mit Demo-Modus.', true],
  ['RESEND_API_KEY', '', 'PRIVAT, vorbereitet. resend.com → API Keys (re_…). SMTP-Passwort in Supabase und Versand der Benachrichtigungs-Mails. Vercel: ja, als Sensitive, sobald vorhanden.', false],
  ['NOTIFY_FROM_EMAIL', '', 'Absender der Benachrichtigungs-Mails, z. B. Hello Beauty <termine@hellobeautysalon.at> (Domain muss bei Resend bestätigt sein). Vercel: ja.', false],
  ['SMS_PROVIDER', '', 'Später (SMS-Erinnerungen, Anbieter offen). Vercel: später.', false],
  ['SMS_API_KEY', '', 'PRIVAT, später. Vercel: später, als Sensitive.', false],
  ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '', 'Öffentlich, später (Zahlung erst nach Freigabe). Stripe → Developers → API keys (pk_…). Vercel: ja, sobald gewünscht.', false],
  ['STRIPE_SECRET_KEY', '', 'PRIVAT, später. Schlüssel der Plattform (Stripe Connect), sk_… bzw. rk_…. Vercel: später, als Sensitive.', false],
  ['STRIPE_WEBHOOK_SECRET', '', 'PRIVAT, später. Stripe → Webhooks → Endpoint /api/payments/webhook → Signing secret (whsec_…). Vercel: später, als Sensitive.', false],
  ['STRIPE_CONNECT_ACCOUNT_ID', '', 'Später. Verbundenes Konto des Salons bei Stripe Connect (acct_…). Vercel: später.', false],
  ['CRM_BRIDGE_SECRET', '', 'PRIVAT, nur Server. HMAC-Schlüssel der CRM-Schnittstelle /api/crm/v1 (Schlüssel-ID hello-beauty-crm). Wird mit env:ensure erzeugt; derselbe Wert kommt ins CRM. Vercel: ja, als Sensitive.', false],
  ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', '', 'Öffentlich. Web-Push (VAPID, P-256), wird mit env:ensure erzeugt. Vercel: ja.', false],
  ['VAPID_PRIVATE_KEY', '', 'PRIVAT, nur Server. Gehört zum öffentlichen VAPID-Schlüssel – nie einzeln tauschen. Vercel: ja, als Sensitive.', false],
  ['VAPID_SUBJECT', 'mailto:info@hellobeautysalon.at', 'Kontakt für die Push-Dienste (RFC 8292). Vercel: ja.', false],
  ['NOTIFY_WORKER_SECRET', '', 'PRIVAT, nur Server. Schützt /api/notifications/process (Versand der Warteschlange, Aufruf per Cron). Wird mit env:ensure erzeugt. Vercel: ja, als Sensitive.', false],
];

const secret = () => randomBytes(32).toString('base64url');
let vapid = null;
const vapidPair = () => {
  if (!vapid) {
    const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
    const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
    vapid = { pub: pub.toString('base64url'), priv: jwk.d };
  }
  return vapid;
};
/** Werte, die lokal erzeugt werden dürfen (env:ensure) */
const generators = {
  CRM_BRIDGE_SECRET: secret,
  NOTIFY_WORKER_SECRET: secret,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: () => vapidPair().pub,
  VAPID_PRIVATE_KEY: () => vapidPair().priv,
};

function parse(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return out;
}

const cmd = process.argv[2];
if (cmd === 'init') {
  if (existsSync(FILE)) {
    console.log('.env.local existiert bereits – nichts geändert.');
    process.exit(0);
  }
  const lines = ['# Hello Beauty Kundenportal – lokale Umgebung. NIE committen (siehe .gitignore + Pre-Commit-Hook).', ''];
  for (const [name, value, comment] of vars) lines.push(`# ${comment}`, `${name}=${value}`, '');
  writeFileSync(FILE, lines.join('\n'));
  console.log('.env.local angelegt (öffentliche Werte gesetzt, private leer). Danach: npm run env:ensure');
} else if (cmd === 'check') {
  const env = existsSync(FILE) ? parse(readFileSync(FILE, 'utf8')) : new Map();
  let missing = 0;
  for (const [name, , , required] of vars) {
    const set = !!env.get(name);
    if (required && !set) missing++;
    console.log(`${set ? 'gesetzt' : 'fehlt  '}  ${name}${required ? '' : '  (optional)'}`);
  }
  if (missing) {
    console.log(`\n${missing} Pflichtwert(e) fehlen.`);
    process.exit(1);
  }
  console.log('\nAlle Pflichtwerte gesetzt.');
} else if (cmd === 'ensure') {
  if (!existsSync(FILE)) {
    console.error('.env.local fehlt – zuerst: npm run env:init');
    process.exit(1);
  }
  const env = parse(readFileSync(FILE, 'utf8'));
  // VAPID nur als Paar erzeugen – nie einen Teil eines bestehenden Paares ersetzen
  const vapidSet = !!env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY') || !!env.get('VAPID_PRIVATE_KEY');
  let text = readFileSync(FILE, 'utf8');
  const append = [];
  const added = [];
  for (const [name, value, comment] of vars) {
    if (env.get(name)) continue;
    const gen = generators[name];
    if (gen && name.includes('VAPID') && vapidSet) continue;
    if (env.has(name) && !gen) continue; // bewusst leer gelassen
    const v = gen ? gen() : value;
    if (env.has(name)) text = text.replace(new RegExp(`^\\s*${name}\\s*=.*$`, 'm'), `${name}=${v}`);
    else append.push(`# ${comment}`, `${name}=${v}`, '');
    added.push(`${name}${gen ? ' (erzeugt)' : ''}`);
  }
  writeFileSync(FILE, text);
  if (append.length) appendFileSync(FILE, `\n${append.join('\n')}`);
  console.log(added.length ? `Ergänzt: ${added.join(', ')}` : 'Nichts zu ergänzen.');
} else if (cmd === 'example') {
  const lines = ['# Hello Beauty Kundenportal – alle Variablen ohne Werte. Kopie als .env.local: npm run env:init', ''];
  for (const [name, , comment] of vars) lines.push(`# ${comment}`, `${name}=`, '');
  writeFileSync('.env.example', lines.join('\n'));
  console.log('.env.example geschrieben.');
} else {
  console.error('Aufruf: env-local.mjs init | check | ensure | example');
  process.exit(2);
}
