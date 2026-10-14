/**
 * Gegenprobe für den Kundentermin: Code von `main` (git worktree in .worktrees/main) läuft mit allen
 * Supabase-E2E-Tests gegen die echte Datenbank. Nach JEDER Migration ausführen.
 * Aufruf: node scripts/main-e2e.mjs   (Exit 0 = main ist mit der aktuellen DB grün)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const wt = resolve(root, '.worktrees', 'main');

if (!existsSync(wt)) {
  execFileSync('git', ['worktree', 'add', '--detach', wt, 'main'], { stdio: 'inherit' });
} else {
  execFileSync('git', ['-C', wt, 'checkout', '--force', '--detach', 'main'], { stdio: 'inherit' }); // Testartefakte (Screenshots) im Worktree verwerfen
}
// Eigene Installation aus der Lock-Datei von main (Turbopack erlaubt keine verlinkten node_modules).
// Neu installieren nur, wenn sich die Lock-Datei geändert hat.
const lock = readFileSync(join(wt, 'package-lock.json'), 'utf8');
const stamp = join(wt, 'node_modules', '.lock-stamp');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== lock) {
  execFileSync('npm', ['ci', '--no-audit'], { cwd: wt, stdio: 'inherit', shell: true });
  copyFileSync(join(wt, 'package-lock.json'), stamp);
}
// Umgebung kopieren (Werte werden nicht ausgegeben)
copyFileSync(join(root, '.env.local'), join(wt, '.env.local'));

const head = execFileSync('git', ['-C', wt, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(`main-Gegenprobe mit ${head} gegen die Datenbank …`);
const r = spawnSync('npm', ['run', 'test:supabase'], { cwd: wt, stdio: 'inherit', shell: true });
console.log(r.status === 0 ? `main ${head}: alle Supabase-E2E-Tests grün.` : `main ${head}: FEHLGESCHLAGEN (Exit ${r.status}).`);
process.exit(r.status ?? 1);
