import { test, type Browser, type Page } from '@playwright/test';
import { emulateStandalone, phone, shotDir, UA } from './devices';

/**
 * Design-Abgleich: Website-Startseite neben /installieren, /app und /app/buchen (390 px, hell + dunkel).
 * Braucht die laufende Website (Stand main), z. B. WEBSITE_URL=http://localhost:4321 – sonst übersprungen.
 * Ergebnis: Bildpaare in docs/screenshots/design-abgleich/.
 */
const website = process.env.WEBSITE_URL;
test.skip(!website, 'WEBSITE_URL nicht gesetzt');
test.skip(process.env.E2E_BACKEND === 'supabase', 'Abgleich läuft mit Mock-Daten');

const dir = `${shotDir}/design-abgleich`;

async function shoot(browser: Browser, scheme: 'light' | 'dark', url: string, prepare?: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ ...phone(UA.iphone), colorScheme: scheme, locale: 'de-AT' });
  const page = await ctx.newPage();
  // App-Bildschirme wie in der installierten App; /installieren und Website wie im Browser
  if (prepare) {
    await emulateStandalone(page);
    await prepare(page);
  }
  else await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const png = await page.screenshot();
  await ctx.close();
  return png;
}

async function pair(browser: Browser, name: string, left: Buffer, right: Buffer, labels: [string, string]) {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const img = (b: Buffer, label: string) =>
    `<figure style="margin:0"><img src="data:image/png;base64,${b.toString('base64')}" style="width:390px;display:block;border:1px solid #d9cfb9"><figcaption style="font:13px Arial;padding:6px 0">${label}</figcaption></figure>`;
  await page.setContent(
    `<body style="margin:0;padding:12px;display:flex;gap:16px;background:#f5f2eb">${img(left, labels[0])}${img(right, labels[1])}</body>`,
  );
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  await ctx.close();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`Website ↔ Portal (${scheme === 'light' ? 'hell' : 'dunkel'})`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    // Die Website hat keinen Dunkelmodus – sie erscheint in beiden Durchläufen hell
    const web = await shoot(browser, scheme, `${website}/`);
    const webLabel = scheme === 'light' ? 'Website (Startseite)' : 'Website (Startseite, kein Dunkelmodus)';
    const portal = (label: string) => `Portal ${label} – ${scheme === 'light' ? 'hell' : 'dunkel'}`;

    await pair(browser, `${scheme}-1-installieren`, web, await shoot(browser, scheme, `${baseURL}/installieren`), [webLabel, portal('/installieren')]);

    const demo = (path: string, wait: string) => async (p: Page) => {
      await p.goto(`${baseURL}/app/willkommen`, { waitUntil: 'networkidle' });
      await p.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
      await p.waitForURL(/\/app$/);
      if (path !== '/app') await p.getByRole('link', { name: 'Buchen', exact: true }).click();
      await p.getByText(wait).waitFor();
    };
    await pair(browser, `${scheme}-2-app`, web, await shoot(browser, scheme, '', demo('/app', 'Ihr nächster Termin')), [webLabel, portal('/app')]);
    const buchen = await shoot(browser, scheme, '', demo('/app/buchen', 'Was dürfen wir für Sie tun?'));
    await pair(browser, `${scheme}-3-buchen`, web, buchen, [webLabel, portal('/app/buchen')]);
    // zusätzlich: Buchungsstrecke neben Buchungsstrecke
    await pair(
      browser,
      `${scheme}-4-buchen-vs-website-buchung`,
      await shoot(browser, scheme, `${website}/termin-buchen/`),
      buchen,
      [scheme === 'light' ? 'Website (Termin buchen)' : 'Website (Termin buchen, kein Dunkelmodus)', portal('/app/buchen')],
    );
  });
}
