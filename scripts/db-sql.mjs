/**
 * SQL gegen das verknüpfte Supabase-Projekt über die Management-API (kein Docker nötig).
 * Zugang: SUPABASE_ACCESS_TOKEN aus .env.local – wird nie ausgegeben.
 *   node scripts/db-sql.mjs "select 1"          Abfrage, Ergebnis als JSON
 *   node scripts/db-sql.mjs --file pfad.sql     SQL-Datei ausführen (z. B. Rückrollung)
 * Als Modul: import { sql } from './db-sql.mjs'
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function env() {
  const out = {};
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...out, ...process.env };
}

export async function sql(query) {
  const e = env();
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(e.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1];
  if (!ref || !e.SUPABASE_ACCESS_TOKEN) throw new Error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_ACCESS_TOKEN fehlt');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL fehlgeschlagen (${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const query = args[0] === '--file' ? readFileSync(args[1], 'utf8') : args.join(' ');
  sql(query)
    .then((rows) => console.log(JSON.stringify(rows, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
