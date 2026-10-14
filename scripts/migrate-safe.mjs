/**
 * Sicheres Einspielen additiver Migrationen (Nachtschicht-Regel):
 *   1. Schema-Backup nach backups/
 *   2. jede noch nicht eingespielte Datei aus supabase/migrations ATOMAR einspielen: Datei + Eintrag in
 *      supabase_migrations.schema_migrations in EINER Anfrage (= eine Transaktion; ein Fehler übernimmt nichts).
 *      (supabase db push übernimmt Anweisungen einzeln – bei einem Fehler bliebe ein Teilstand zurück.)
 *   3. main-Gegenprobe (scripts/main-e2e.mjs)
 *   4. schlägt sie fehl: mit supabase/rollback/<version>.down.sql (+ optional .down.mjs für Storage) zurückrollen,
 *      Historie bereinigen, Stand gegen das Backup prüfen, mit Exit 1 abbrechen.
 * Aufruf: node scripts/migrate-safe.mjs <bezeichnung>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { sql } from './db-sql.mjs';

const label = process.argv[2] ?? 'migration';
const applied = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version));
const pending = readdirSync('supabase/migrations')
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort()
  .filter((f) => !applied.has(f.slice(0, 14)));
if (!pending.length) {
  console.log('Keine neuen Migrationen.');
  process.exit(0);
}

const backupOut = execFileSync('node', ['scripts/db-backup.mjs', `vor-${label}`], { encoding: 'utf8' });
process.stdout.write(backupOut);
const backupFile = /backups\/\S+\.json/.exec(backupOut)?.[0];

const done = [];
async function rollback(reason) {
  console.error(`\nZURÜCKROLLEN (${reason}): ${done.join(', ') || 'nichts übernommen'}`);
  for (const v of [...done].reverse()) {
    const down = `supabase/rollback/${v}.down.sql`;
    if (!existsSync(down)) {
      console.error(`  ${down} fehlt – bitte manuell prüfen!`);
      continue;
    }
    if (existsSync(`supabase/rollback/${v}.down.mjs`)) execFileSync('node', [`supabase/rollback/${v}.down.mjs`], { stdio: 'inherit' });
    await sql(readFileSync(down, 'utf8'));
    await sql(`delete from supabase_migrations.schema_migrations where version = '${v}'`);
    console.error(`  ${v} zurückgerollt.`);
  }
  if (backupFile) spawnSync('node', ['scripts/db-compare.mjs', backupFile], { stdio: 'inherit' });
  process.exit(1);
}

for (const file of pending) {
  const version = file.slice(0, 14);
  const name = file.slice(15, -4).replace(/'/g, '');
  const body = readFileSync(`supabase/migrations/${file}`, 'utf8');
  try {
    await sql(`${body}\n;insert into supabase_migrations.schema_migrations (version, name, statements) values ('${version}', '${name}', '{}');`);
    done.push(version);
    console.log(`Eingespielt (atomar): ${file}`);
  } catch (err) {
    console.error(`Fehler in ${file} – nichts davon übernommen:\n${err.message}`);
    await rollback('Migration fehlgeschlagen');
  }
}

const e2e = spawnSync('node', ['scripts/main-e2e.mjs'], { stdio: 'inherit' });
if (e2e.status !== 0) await rollback('main-Gegenprobe rot');
console.log('main-Gegenprobe grün – Migration bleibt.');
