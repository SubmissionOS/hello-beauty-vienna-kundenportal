/**
 * .env.local verwalten, ohne Werte anzuzeigen.
 *   node scripts/env-local.mjs init    legt .env.local an (nur wenn sie fehlt – überschreibt nie)
 *   node scripts/env-local.mjs check   zeigt je Variable nur „gesetzt“ oder „fehlt“
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
  ['RESEND_API_KEY', '', 'PRIVAT, vorbereitet. resend.com → API Keys (re_…). Wird im Supabase-Dashboard als SMTP-Passwort eingetragen. Vercel: nein.', false],
  ['SMS_PROVIDER', '', 'Später (SMS-Erinnerungen, Anbieter offen). Vercel: später.', false],
  ['SMS_API_KEY', '', 'PRIVAT, später. Vercel: später, als Sensitive.', false],
  ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '', 'Öffentlich, später (Zahlung erst nach Freigabe).', false],
  ['STRIPE_SECRET_KEY', '', 'PRIVAT, später. Vercel: später, als Sensitive.', false],
  ['STRIPE_WEBHOOK_SECRET', '', 'PRIVAT, später. Vercel: später, als Sensitive.', false],
];

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
  console.log('.env.local angelegt (öffentliche Werte gesetzt, private leer).');
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
} else if (cmd === 'example') {
  const lines = ['# Hello Beauty Kundenportal – alle Variablen ohne Werte. Kopie als .env.local: npm run env:init', ''];
  for (const [name, , comment] of vars) lines.push(`# ${comment}`, `${name}=`, '');
  writeFileSync('.env.example', lines.join('\n'));
  console.log('.env.example geschrieben.');
} else {
  console.error('Aufruf: env-local.mjs init | check | example');
  process.exit(2);
}
