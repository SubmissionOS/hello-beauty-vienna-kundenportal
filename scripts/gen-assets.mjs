/**
 * Erzeugt abgeleitete Bilddateien (einmalig, Ergebnis ist committet):
 * iOS-Startbilder, maskable 192, kleine Logos, Kategoriefotos (WebP).
 * Rendert über Playwright-Chromium – kein Bildpaket nötig.
 *
 * Aufruf: node scripts/gen-assets.mjs <Pfad zum Website-Repo>
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.argv[2] ?? '../hellobeautyvienna-website');
const out = resolve('public');
const dataUrl = (p, mime = 'image/png') => `data:${mime};base64,${readFileSync(p).toString('base64')}`;

const monogram = dataUrl(join(src, 'src/assets/salon/logo-hb-monogramm-gold.png'));
const maskable = dataUrl(join(src, 'public/icons/icon-maskable-512.png'));

/** iPhone-Displays (Punkte × Faktor), Hochformat. Quelle: Apple Human Interface Guidelines, Gerätemaße. */
const devices = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [420, 912, 3], // Air
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16, 16e
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [375, 667, 2], // SE 2./3. Gen, 8
];

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(html, w, h, file, scale = 1) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const shot = await page.screenshot({ type: 'png', scale: scale === 1 ? 'css' : 'device' });
  writeFileSync(file, shot);
}

mkdirSync(join(out, 'splash'), { recursive: true });
for (const [w, h, f] of devices) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: f });
  const p = await ctx.newPage();
  await p.setContent(
    `<!doctype html><html><body style="margin:0;background:#f5f2eb;width:${w}px;height:${h}px;display:grid;place-items:center">
     <img src="${monogram}" style="width:${Math.round(w * 0.3)}px;height:auto"></body></html>`,
  );
  await p.waitForFunction(() => [...document.images].every((i) => i.complete));
  writeFileSync(join(out, 'splash', `splash-${w * f}x${h * f}.png`), await p.screenshot({ type: 'png' }));
  await ctx.close();
}

await render(`<img src="${maskable}" style="width:192px;height:192px;display:block">`, 192, 192, join(out, 'icons/icon-maskable-192.png'));
await render(
  `<img src="${monogram}" style="width:256px;height:256px;display:block">`,
  256,
  256,
  join(out, 'brand/monogramm-gold.png'),
);
writeFileSync(join(out, 'brand/logo-quer-gold.png'), readFileSync(join(src, 'src/assets/salon/logo-hb-hello-beauty-quer-gold.png')));
writeFileSync(join(out, 'brand/logo-quer-weiss.png'), readFileSync(join(src, 'src/assets/salon/logo-hb-hello-beauty-quer-weiss.png')));

/** Kategoriefotos: 640×480, WebP über Canvas. */
const photos = {
  nails: 'naegel-nude-goldornament.jpg',
  pedicure: 'pedikuere-behandlung-salon.jpg',
  cosmetics: 'kosmetik-gesichtsmaske.jpg',
  laser: 'haarentfernung-laser-behandlung.jpg',
};
for (const [id, file] of Object.entries(photos)) {
  const url = dataUrl(join(src, 'src/assets/salon', file), 'image/jpeg');
  await page.setContent(`<img id="i" src="${url}">`);
  const b64 = await page.evaluate(async () => {
    const img = document.getElementById('i');
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const s = Math.max(640 / img.naturalWidth, 480 / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    c.getContext('2d').drawImage(img, (640 - w) / 2, (480 - h) / 2, w, h);
    return c.toDataURL('image/webp', 0.72).split(',')[1];
  });
  writeFileSync(join(out, 'photos', `${id}.webp`), Buffer.from(b64, 'base64'));
}

await browser.close();
console.log('ok');
