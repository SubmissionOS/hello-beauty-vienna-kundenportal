/**
 * Prüft, dass Farben und Schriftgrößen nur in src/styles/tokens.css stehen.
 *  1. Farb-Literale (#hex, rgb(), hsl()) und feste Schriftgrößen (font-size/fontSize mit Zahl) außerhalb tokens.css
 *  2. var(--name) ohne Definition (Tippfehler, alte Namen)
 *  3. die wenigen technisch nötigen Literale (Manifest, theme-color) stimmen mit tokens.css überein
 * Aufruf: npm run check:tokens  (läuft auch in npm run lint)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const TOKENS = 'src/styles/tokens.css';
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?|mjs)$/.test(n)) out.push(p);
  }
  return out;
};
const rel = (p) => relative(root, p).split(sep).join('/');
const files = walk(join(root, 'src')).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }));
const tokens = readFileSync(join(root, TOKENS), 'utf8');

// Technisch nötige Ausnahmen: Browser liest diese Farben vor jedem CSS (Manifest, <meta name="theme-color">)
const literalAllowed = new Set(['src/app/manifest.ts', 'src/app/layout.tsx']);

const problems = [];
const colorRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
const sizeRe = /font-size:\s*(?!var\(|inherit|100%)[0-9.]|fontSize:\s*['"]?[0-9]/g;

for (const f of files) {
  if (f.path === TOKENS) continue;
  const lines = f.text.split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\*.*?\*\/|\/\/.*$/g, ''); // Kommentare ignorieren
    if (!literalAllowed.has(f.path) && colorRe.test(code)) problems.push(`${f.path}:${i + 1}  Farbe außerhalb tokens.css`);
    colorRe.lastIndex = 0;
    if (sizeRe.test(code)) problems.push(`${f.path}:${i + 1}  feste Schriftgröße`);
    sizeRe.lastIndex = 0;
  });
}

// Definierte Variablen: tokens.css + lokal in Dateien gesetzte (z. B. --pw, --btn-bg)
const defined = new Set();
for (const t of [tokens, ...files.map((f) => f.text)]) {
  for (const m of t.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  for (const m of t.matchAll(/'(--[a-zA-Z0-9-]+)'\s*:/g)) defined.add(m[1]); // style={{ '--pw': … }}
}
for (const f of files) {
  for (const m of f.text.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) {
    const name = m[1];
    if (name === '--m-tone-' || defined.has(name)) continue;
    problems.push(`${f.path}  var(${name}) ist nirgends definiert`);
  }
}

// Literale in Manifest/Layout müssen Token-Werten entsprechen
const tokenHex = new Set([...tokens.matchAll(/--c-[a-z-]+:\s*(#[0-9a-f]{6})/g)].map((m) => m[1].toLowerCase()));
for (const path of literalAllowed) {
  const f = files.find((x) => x.path === path);
  for (const m of f?.text.matchAll(/#[0-9a-fA-F]{6}\b/g) ?? []) {
    if (!tokenHex.has(m[0].toLowerCase())) problems.push(`${path}  ${m[0]} ist kein Website-Token`);
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`Token-Prüfung: ${unique.length} Problem(e)`);
  for (const p of unique) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Token-Prüfung OK: ${files.length} Dateien, keine Farben/Schriftgrößen außerhalb ${TOKENS}.`);
