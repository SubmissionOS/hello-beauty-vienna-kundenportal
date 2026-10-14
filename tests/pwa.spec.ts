import { expect, test } from '@playwright/test';
// @ts-expect-error – reines JS-Modul ohne Typen
import { checkManifest } from '../scripts/manifest-rules.mjs';
import { phone, UA } from './devices';

test('Manifest-Felder und Icons', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(checkManifest(manifest)).toEqual([]);
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});

test('iOS-Meta-Tags, Startbilder und apple-touch-icon', async ({ request }) => {
  const html = await (await request.get('/installieren')).text();
  expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
  expect(html).toContain('name="apple-mobile-web-app-title" content="Hello Beauty"');
  expect(html).toMatch(/rel="apple-touch-icon"/);
  expect(html.match(/rel="apple-touch-startup-image"/g)?.length).toBeGreaterThanOrEqual(10);
  expect(html).toContain('viewport-fit=cover');
  const icon = await request.get('/icons/apple-touch-icon.png');
  expect(icon.ok()).toBeTruthy();
});

test('noindex, Sicherheits-Header und robots.txt', async ({ request }) => {
  const res = await request.get('/installieren');
  const h = res.headers();
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow: \//);
});

test.describe('Service Worker', () => {
  test.use(phone(UA.android));

  test('registriert, cacht nur statische Dateien, Offline-Seite ohne Daten', async ({ page, context }) => {
    await page.goto('/installieren');
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Einmal durch die App, damit es etwas zu cachen gäbe
    await page.goto('/app');
    await page.waitForURL('**/app/willkommen');
    await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const key of await caches.keys()) {
        const c = await caches.open(key);
        for (const r of await c.keys()) urls.push(new URL(r.url).pathname);
      }
      return urls;
    });
    expect(cached).toContain('/offline');
    const allowed = /^\/(offline$|_next\/static\/|fonts\/|icons\/|brand\/|photos\/|splash\/)/;
    expect(cached.filter((u) => !allowed.test(u))).toEqual([]);

    await context.setOffline(true);
    await page.goto('/app/termine').catch(() => {});
    await expect(page.getByRole('heading', { name: 'Keine Verbindung' })).toBeVisible();
    await expect(page.getByText('Lena')).toHaveCount(0);
    await context.setOffline(false);
  });
});

test('keine externen Requests (keine Tracker, keine CDNs)', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL!) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  for (const path of ['/installieren', '/app/willkommen', '/qr']) {
    await page.goto(path, { waitUntil: 'networkidle' });
  }
  expect(external).toEqual([]);
});
