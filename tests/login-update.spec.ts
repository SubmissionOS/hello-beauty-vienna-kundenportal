import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import { emulateStandalone, phone, shotDir, UA } from './devices';

/**
 * Anmeldung wie in nativen Apps (Mock-Betrieb): sofort drin nach Registrierung, doppelte E-Mail,
 * „Angemeldet bleiben“ über einen echten Browser-Neustart (persistentes Profil) und der Update-Hinweis.
 */
test.skip(process.env.E2E_BACKEND === 'supabase', 'nur Mock-Adapter');
test.use(phone(UA.iphone));

const BASE = 'http://localhost:3200';
const PASSWORD = 'Sommer-Wiese-2026';

async function register(page: Page, email: string) {
  await page.goto(`${BASE}/app/registrieren`);
  await page.getByLabel('Vorname', { exact: true }).fill('Nora');
  await page.getByLabel('Nachname', { exact: true }).fill('Neustart');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
}

async function logout(page: Page) {
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/app/willkommen');
}

test('Registrierung → sofort drin; gleiche E-Mail → freundlicher Hinweis mit Link zum Login', async ({ page }) => {
  await register(page, 'nora@example.com');
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Nora/ })).toBeVisible();
  await logout(page);
  await register(page, 'NORA@example.com');
  const alert = page.locator('p.alert[role="alert"]');
  await expect(alert).toContainText('Für diese E-Mail gibt es schon ein Konto –');
  await alert.getByRole('link', { name: 'jetzt anmelden?' }).click();
  await page.waitForURL('**/app/anmelden');
  await expect(page.getByRole('checkbox', { name: 'Angemeldet bleiben' })).toBeChecked();
  await page.screenshot({ path: `${shotDir}/login-angemeldet-bleiben.png`, fullPage: true });
});

test('„Angemeldet bleiben“: AN übersteht einen Browser-Neustart, AUS nicht', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hb-profil-'));
  const open = () => chromium.launchPersistentContext(dir, { ...phone(UA.iphone), locale: 'de-AT', timezoneId: 'Europe/Vienna' });
  try {
    // Konto anlegen und abmelden
    let ctx = await open();
    let page = ctx.pages()[0] ?? (await ctx.newPage());
    await register(page, 'mila@example.com');
    await page.waitForURL(/\/app$/);
    await logout(page);

    // Anmelden mit „Angemeldet bleiben“ AN → Neustart → weiter angemeldet
    await page.goto(`${BASE}/app/anmelden`);
    await page.getByLabel('E-Mail').fill('mila@example.com');
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.waitForURL(/\/app$/);
    await ctx.close();
    ctx = await open();
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`${BASE}/app`);
    await expect(page.getByRole('heading', { name: /Nora/ })).toBeVisible();

    // abmelden, Anmelden mit AUS → Neustart → abgemeldet
    await logout(page);
    await page.goto(`${BASE}/app/anmelden`);
    await page.getByLabel('E-Mail').fill('mila@example.com');
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('checkbox', { name: 'Angemeldet bleiben' }).uncheck();
    await expect(page.getByText('Aus: Sie werden beim Schließen der App abgemeldet.')).toBeVisible();
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /Nora/ })).toBeVisible();
    await ctx.close();
    ctx = await open();
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`${BASE}/app`);
    await page.waitForURL('**/app/willkommen');
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Update-Hinweis: neue Version → Leiste, Warnung bei Eingaben, Aktualisieren lädt genau einmal neu', async ({ page }) => {
  await emulateStandalone(page);
  await page.goto(`${BASE}/app/anmelden`);
  // Service Worker übernimmt die Seite (erste Installation still, ohne Hinweis)
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByTestId('update-bar')).toHaveCount(0);

  // neue Auslieferung simulieren: andere Build-Version der SW-URL
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js?v=e2e-neue-version', { scope: '/' }));
  const bar = page.getByTestId('update-bar');
  await expect(bar).toContainText('Neue Version verfügbar');
  await page.screenshot({ path: `${shotDir}/update-hinweis.png`, fullPage: false });

  // ungespeicherte Eingabe → erst nachfragen; Abbrechen lässt alles, wie es ist
  await page.getByLabel('E-Mail').fill('halb@ausgefuellt.at');
  page.once('dialog', (d) => {
    expect(d.message()).toContain('ungespeicherte Eingaben');
    void d.dismiss();
  });
  await bar.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
  await expect(page.getByLabel('E-Mail')).toHaveValue('halb@ausgefuellt.at');

  // bestätigen → neue Version übernimmt, Seite lädt einmal neu
  let loads = 0;
  page.on('load', () => loads++);
  page.once('dialog', (d) => void d.accept());
  await bar.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
  await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('e2e-neue-version'));
  // (die Seite selbst ist noch der alte Build – in echt passen App und SW nach dem Neuladen zusammen)
  await page.waitForTimeout(1500);
  expect(loads).toBe(1);
});
