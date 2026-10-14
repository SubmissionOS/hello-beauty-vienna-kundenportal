/**
 * Vergleicht den aktuellen DB-Stand mit einem Backup (Funktionen, Policies, Tabellen, Trigger).
 * Aufruf: node scripts/db-compare.mjs backups/<datei>.json
 */
import { readFileSync } from 'node:fs';
import { sql } from './db-sql.mjs';

const b = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const now = {
  functions: (await sql(`select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app') and p.prokind in ('f','p')`)).map((r) => r.k),
  policies: (await sql(`select schemaname || '.' || tablename || '.' || policyname as k from pg_policies where schemaname in ('public','app','storage','cron')`)).map((r) => r.k),
  tables: (await sql(`select distinct table_schema || '.' || table_name as k from information_schema.columns where table_schema in ('public','app')`)).map((r) => r.k),
  triggers: (await sql(`select n.nspname || '.' || c.relname || '.' || t.tgname as k from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public','app')`)).map((r) => r.k),
};
const then = {
  functions: b.functions.map((f) => `${f.schema}.${f.name}(${f.args})`),
  policies: b.policies.map((p) => `${p.schemaname}.${p.tablename}.${p.policyname}`),
  tables: [...new Set(b.columns.map((c) => `${c.table_schema}.${c.table_name}`))],
  triggers: b.triggers.map((t) => `${t.schema}.${t.table}.${t.name}`),
};
let same = true;
for (const k of Object.keys(now)) {
  const a = new Set(then[k]);
  const c = new Set(now[k]);
  const extra = [...c].filter((x) => !a.has(x));
  const missing = [...a].filter((x) => !c.has(x));
  if (extra.length || missing.length) same = false;
  console.log(`${k}: ${extra.length} zusätzlich, ${missing.length} fehlend${extra.length ? ' + ' + extra.join(', ') : ''}${missing.length ? ' − ' + missing.join(', ') : ''}`);
}
console.log(same ? 'Stand identisch zum Backup.' : 'Stand weicht vom Backup ab.');
