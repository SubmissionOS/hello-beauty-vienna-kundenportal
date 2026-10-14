/**
 * Secret-Scan.
 *   node scripts/scan-secrets.mjs --staged   Pre-Commit: blockiert .env*-Dateien (außer .env.example) und Secret-Muster
 *   node scripts/scan-secrets.mjs --build    nach `next build`: Client-Output (.next/static, vorgerenderte Seiten)
 *                                            und Quelltext-Regeln prüfen; bei Treffer Exit 1
 * Ausgabe nennt nur Datei, Zeile und Art – nie den Wert.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { isForbiddenEnvFile, privateVars, scanText } from './secret-patterns.mjs';

const root = process.cwd();
const mode = process.argv[2];
const problems = [];

/** Geheime Werte aus Umgebung und .env.local – nur im Speicher, für den Literal-Vergleich. */
function secretLiterals() {
  const values = new Map();
  for (const name of privateVars) if (process.env[name]) values.set(name, process.env[name]);
  for (const file of ['.env.local', '.env']) {
    const p = join(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || !privateVars.includes(m[1])) continue;
      const v = m[2].replace(/^["']|["']$/g, '');
      if (v) values.set(m[1], v);
    }
  }
  return [...values].map(([name, value]) => ({ name, value }));
}

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.gif', '.pdf', '.zip', '.exe']);
const isBinary = (path, buf) => BINARY.has(extname(path).toLowerCase()) || buf.includes(0);

function report(file, hits) {
  for (const h of hits) problems.push(`${file}:${h.line}  ${h.kind}`);
}

function staged() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { encoding: 'utf8' });
  const files = out.split('\0').filter(Boolean);
  const literals = secretLiterals();
  for (const file of files) {
    if (isForbiddenEnvFile(file)) {
      problems.push(`${file}  .env-Datei darf nicht committet werden (nur .env.example)`);
      continue;
    }
    const buf = execFileSync('git', ['show', `:${file}`], { maxBuffer: 64 * 1024 * 1024 });
    if (isBinary(file, buf)) continue;
    report(file, scanText(buf.toString('utf8'), literals));
  }
  return files.length;
}

function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, accept, out);
    else if (accept(p)) out.push(p);
  }
  return out;
}

function build() {
  if (!existsSync(join(root, '.next'))) {
    problems.push('.next fehlt – zuerst next build');
    return 0;
  }
  const literals = secretLiterals();
  // Alles, was an Browser geht: statische Chunks + vorgerenderte HTML/RSC-Antworten
  const client = [
    ...walk(join(root, '.next', 'static'), () => true),
    ...walk(join(root, '.next', 'server', 'app'), (p) => /\.(html|rsc|body|meta|json)$/.test(p)),
  ];
  for (const file of client) {
    const buf = readFileSync(file);
    if (isBinary(file, buf)) continue;
    const text = buf.toString('utf8');
    report(relative(root, file), scanText(text, literals));
    for (const name of privateVars) {
      if (text.includes(name)) problems.push(`${relative(root, file)}  Variablenname ${name} im Client-Output`);
    }
  }
  // Quelltext-Regel: private Variablen nur in serverseitigen Dateien (src/lib/server, src/app/api) lesen
  const sources = walk(join(root, 'src'), (p) => /\.(ts|tsx)$/.test(p));
  for (const file of sources) {
    const rel = relative(root, file).split(sep).join('/');
    const text = readFileSync(file, 'utf8');
    const allowed = rel.startsWith('src/lib/server/');
    for (const name of privateVars) {
      if (!allowed && text.includes(`process.env.${name}`)) problems.push(`${rel}  liest ${name} außerhalb von src/lib/server`);
    }
    if (allowed && !/^import 'server-only';/m.test(text)) problems.push(`${rel}  fehlt import 'server-only'`);
    if (/process\.env\.NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|SERVICE_ROLE)/.test(text)) {
      problems.push(`${rel}  privater Wert mit NEXT_PUBLIC_-Präfix`);
    }
  }
  return client.length;
}

let count = 0;
if (mode === '--staged') count = staged();
else if (mode === '--build') count = build();
else {
  console.error('Aufruf: scan-secrets.mjs --staged | --build');
  process.exit(2);
}

if (problems.length) {
  console.error(`Secret-Scan: ${problems.length} Problem(e) – abgebrochen.`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Secret-Scan OK (${count} Dateien geprüft).`);
