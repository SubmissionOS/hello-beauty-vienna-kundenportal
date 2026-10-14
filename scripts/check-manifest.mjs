/**
 * Prüft Manifest, Icons und iOS-Meta-Tags eines laufenden Servers.
 * Aufruf: npm run check:manifest -- http://localhost:3000
 */
import { checkManifest } from './manifest-rules.mjs';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const errors = [];

const res = await fetch(`${base}/manifest.webmanifest`);
if (!res.ok) {
  console.error(`Manifest nicht erreichbar (${res.status})`);
  process.exit(1);
}
const manifest = await res.json();
errors.push(...checkManifest(manifest));

for (const icon of manifest.icons ?? []) {
  const r = await fetch(new URL(icon.src, base));
  if (!r.ok || r.headers.get('content-type') !== 'image/png') errors.push(`Icon ${icon.src} nicht ladbar (${r.status})`);
}

const html = await (await fetch(`${base}/installieren`)).text();
const need = [
  ['apple-touch-icon', /rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"|href="\/icons\/apple-touch-icon\.png"[^>]*rel="apple-touch-icon"/],
  ['apple-mobile-web-app-capable', /name="apple-mobile-web-app-capable" content="yes"/],
  ['apple-mobile-web-app-title', /name="apple-mobile-web-app-title" content="Hello Beauty"/],
  ['apple-touch-startup-image', /rel="apple-touch-startup-image"/],
  ['manifest-Link', /rel="manifest" href="\/manifest\.webmanifest"/],
  ['viewport-fit=cover', /viewport-fit=cover/],
];
for (const [label, re] of need) if (!re.test(html)) errors.push(`${label} fehlt im HTML`);

if (errors.length) {
  console.error(`Manifest-Prüfung: ${errors.length} Fehler`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`Manifest-Prüfung OK (${manifest.icons.length} Icons, start_url ${manifest.start_url})`);
