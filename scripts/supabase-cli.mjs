/**
 * Startet die lokal geprüfte Supabase-CLI (tools/supabase, v2.118.0, SHA-256 gegen checksums.txt geprüft)
 * mit SUPABASE_ACCESS_TOKEN und SUPABASE_DB_PASSWORD aus .env.local – ohne die Werte anzuzeigen.
 * Aufruf: node scripts/supabase-cli.mjs <CLI-Argumente>   z. B. db push
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const exe = join(process.cwd(), 'tools', 'supabase', process.platform === 'win32' ? 'supabase.exe' : 'supabase');
if (!existsSync(exe)) {
  console.error('Supabase-CLI fehlt in tools/supabase (siehe docs/teil2-bericht.md).');
  process.exit(2);
}

const env = { ...process.env, DO_NOT_TRACK: '1' };
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^\s*(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
// Projekt-Ref aus der öffentlichen URL ableiten, damit er nirgends doppelt gepflegt wird
if (args[0] === 'link' && !args.includes('--project-ref')) {
  const url = readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (url) args.push('--project-ref', url[1]);
}

const r = spawnSync(exe, args, { env, stdio: 'inherit' });
process.exit(r.status ?? 1);
