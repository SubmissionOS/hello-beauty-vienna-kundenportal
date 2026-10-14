/**
 * Schema-Backup vor jeder Migration (ohne Docker, über die Management-API).
 * Aufruf: node scripts/db-backup.mjs <bezeichnung>   → backups/<UTC-Zeit>_<bezeichnung>.json
 * Enthält nur Struktur und Rechte, keine Kundendaten.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { sql } from './db-sql.mjs';

const label = (process.argv[2] ?? 'manuell').replace(/[^a-z0-9-]/gi, '-');
const schemas = `('public','app','storage','cron')`;
const q = {
  migrations: `select version, name from supabase_migrations.schema_migrations order by version`,
  extensions: `select extname, extversion from pg_extension order by 1`,
  enums: `select n.nspname as schema, t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
          from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
          where n.nspname in ('public','app') group by 1,2 order by 1,2`,
  columns: `select table_schema, table_name, column_name, data_type, udt_name, is_nullable, column_default, is_generated, generation_expression
            from information_schema.columns where table_schema in ('public','app') order by 1,2,ordinal_position`,
  constraints: `select n.nspname as schema, c.relname as table, con.conname as name, pg_get_constraintdef(con.oid) as def
                from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
                where n.nspname in ('public','app') order by 1,2,3`,
  indexes: `select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public','app') order by 1,2,3`,
  policies: `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
             where schemaname in ${schemas} order by 1,2,3`,
  rls: `select n.nspname as schema, c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as force
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','app') and c.relkind = 'r' order by 1,2`,
  functions: `select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def,
                     p.prosecdef as security_definer, array(select a.grantee::regrole::text from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE') as execute_roles
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app') and p.prokind in ('f','p') order by 1,2,3`,
  views: `select schemaname, viewname, definition from pg_views where schemaname in ('public','app') order by 1,2`,
  triggers: `select n.nspname as schema, c.relname as table, t.tgname as name, pg_get_triggerdef(t.oid) as def
             from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal and n.nspname in ('public','app') order by 1,2,3`,
  grants: `select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants
           where table_schema in ('public','app') and grantee in ('anon','authenticated') order by 1,2,3,4`,
  columnGrants: `select table_schema, table_name, column_name, grantee, privilege_type from information_schema.column_privileges
                 where table_schema in ('public','app') and grantee in ('anon','authenticated') order by 1,2,3,4,5`,
  buckets: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`,
};

const snapshot = { createdAt: new Date().toISOString(), label };
for (const [key, query] of Object.entries(q)) snapshot[key] = await sql(query);
try {
  snapshot.cronJobs = await sql(`select jobid, jobname, schedule, command, active from cron.job order by jobid`);
} catch {
  snapshot.cronJobs = 'pg_cron nicht installiert';
}

mkdirSync('backups', { recursive: true });
const file = `backups/${snapshot.createdAt.replace(/[:.]/g, '-')}_${label}.json`;
writeFileSync(file, JSON.stringify(snapshot, null, 2));
console.log(`Schema-Backup: ${file} (${snapshot.functions.length} Funktionen, ${snapshot.policies.length} Policies, ${snapshot.migrations.length} Migrationen)`);
