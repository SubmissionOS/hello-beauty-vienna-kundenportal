/**
 * Erzeugt die Datenbank-Typen für das CRM aus dem gemeinsamen Supabase-Projekt.
 * Migrationen gibt es NUR hier im Kundenportal (supabase/migrations); das CRM bekommt nur die Typen.
 *   npm run crm:types   →   ../Hello-beauty-salon-CRM/src/lib/db/database.types.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const target = '../Hello-beauty-salon-CRM/src/lib/db/database.types.ts';
if (!existsSync('../Hello-beauty-salon-CRM/src/lib/db')) {
  console.error('CRM-Repo nicht gefunden (../Hello-beauty-salon-CRM).');
  process.exit(1);
}
const out = execFileSync(
  'node',
  ['scripts/supabase-cli.mjs', 'gen', 'types', 'typescript', '--project-id', 'cayqrguxnjlnofmkkokt', '--schema', 'public'],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
if (!out.includes('export type Database')) {
  console.error('Typen konnten nicht erzeugt werden.');
  process.exit(1);
}
writeFileSync(target, out);
console.log(`Typen geschrieben: ${target} (${out.split('\n').length} Zeilen)`);
