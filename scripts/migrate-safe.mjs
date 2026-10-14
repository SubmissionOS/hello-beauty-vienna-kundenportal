/**
 * Sicheres Einspielen additiver Migrationen (Nachtschicht-Regel):
 *   1. Schema-Backup nach backups/
 *   2. supabase db push (nur neue Migrationen)
 *   3. main-Gegenprobe (scripts/main-e2e.mjs)
 *   4. schlägt sie fehl: jede eben eingespielte Migration mit supabase/rollback/<version>.down.sql zurückrollen,
 *      Eintrag aus der Migrationshistorie löschen, mit Exit 1 abbrechen.
 * Aufruf: node scripts/migrate-safe.mjs <bezeichnung>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { sql } from './db-sql.mjs';

const label = process.argv[2] ?? 'migration';
const before = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version));

execFileSync('node', ['scripts/db-backup.mjs', `vor-${label}`], { stdio: 'inherit' });
const push = spawnSync('node', ['scripts/supabase-cli.mjs', 'db', 'push', '--yes'], { stdio: 'inherit' });
const after = (await sql('select version from supabase_migrations.schema_migrations order by version')).map((r) => r.version);
const added = after.filter((v) => !before.has(v));

async function rollback(reason) {
  console.error(`\nZURÜCKROLLEN (${reason}): ${added.join(', ') || 'nichts eingespielt'}`);
  for (const v of [...added].reverse()) {
    const file = `supabase/rollback/${v}.down.sql`;
    if (!existsSync(file)) {
      console.error(`  ${file} fehlt – manuell prüfen!`);
      continue;
    }
    await sql(readFileSync(file, 'utf8'));
    await sql(`delete from supabase_migrations.schema_migrations where version = '${v.replace(/\D/g, '')}'`);
    console.error(`  ${v} zurückgerollt.`);
  }
  process.exit(1);
}

if (push.status !== 0) await rollback('db push fehlgeschlagen');
console.log(`Eingespielt: ${added.join(', ') || '(keine neuen Migrationen)'}`);
if (!added.length) process.exit(0);

const e2e = spawnSync('node', ['scripts/main-e2e.mjs'], { stdio: 'inherit' });
if (e2e.status !== 0) await rollback('main-Gegenprobe rot');
console.log('main-Gegenprobe grün – Migration bleibt.');
