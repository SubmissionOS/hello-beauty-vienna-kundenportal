/**
 * Überträgt die gemeinsamen Supabase-Werte und die Team-Demo-Passwörter aus .env.local (Kundenportal)
 * in die .env.local des CRM-Repos. Werte werden nie ausgegeben, nur die Namen der gesetzten Variablen.
 * Vorhandene CRM-eigene Werte (z. B. ANTHROPIC_API_KEY, BOOKING_IP_SALT) bleiben unverändert.
 * Aufruf: npm run crm:env [-- <Pfad zum CRM-Repo>]   (Standard: ../Hello-beauty-salon-CRM)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const crmDir = resolve(process.argv[2] ?? '../Hello-beauty-salon-CRM');
const target = join(crmDir, '.env.local');
const SHARED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TEAM_DEMO_PASSWORD_OWNER',
  'TEAM_DEMO_PASSWORD_STAFF1',
  'TEAM_DEMO_PASSWORD_STAFF2',
];

const parse = (text) => {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return out;
};

if (!existsSync(join(crmDir, 'package.json'))) {
  console.error(`CRM-Repo nicht gefunden: ${crmDir}`);
  process.exit(1);
}
const portal = parse(readFileSync('.env.local', 'utf8'));
let text = existsSync(target)
  ? readFileSync(target, 'utf8')
  : '# Hello Beauty CRM – lokale Umgebung. NIE committen. Gemeinsame Supabase-Werte kommen aus dem Kundenportal (npm run crm:env).\n';
const set = [];
for (const name of SHARED) {
  const value = portal.get(name);
  if (!value) continue;
  const re = new RegExp(`^\\s*${name}\\s*=.*$`, 'm');
  text = re.test(text) ? text.replace(re, `${name}=${value}`) : `${text.replace(/\n?$/, '\n')}${name}=${value}\n`;
  set.push(name);
}
writeFileSync(target, text);
console.log(`CRM .env.local aktualisiert: ${set.join(', ')}`);
