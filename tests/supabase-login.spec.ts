import { expect, test } from '@playwright/test';
import { emulateStandalone, phone, UA } from './devices';
import { admin } from './helpers';

/** „Angemeldet bleiben“ mit echter Supabase-Sitzung: AUS → nach Neustart abgemeldet, AN → angemeldet. */
test.skip(process.env.E2E_BACKEND !== 'supabase', 'nur mit E2E_BACKEND=supabase');
test.use(phone(UA.iphone));

const email = `e2e-merken-${Date.now()}@example.com`;
const password = 'Merken-Test-2026!';

test.afterAll(async () => {
  const db = admin();
  const { data } = await db.from('customers').select('id, user_id').eq('email', email);
  for (const c of data ?? []) {
    await db.from('customers').delete().eq('id', c.id);
    if (c.user_id) await db.auth.admin.deleteUser(c.user_id);
  }
});

test('Angemeldet bleiben AN/AUS über einen Neustart (nur der App-Speicher bleibt)', async ({ page, browser }) => {
  await emulateStandalone(page);
  await page.goto('/app/registrieren');
  await page.getByLabel('Vorname', { exact: true }).fill('Merle');
  await page.getByLabel('Nachname', { exact: true }).fill('Merken');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.waitForURL(/\/app$/);

  for (const remember of [false, true]) {
    await page.getByRole('link', { name: 'Profil', exact: true }).click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.waitForURL('**/app/willkommen');
    await page.goto('/app/anmelden');
    await page.getByLabel('E-Mail').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('checkbox', { name: 'Angemeldet bleiben' }).setChecked(remember);
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole('heading', { name: /Merle/ })).toBeVisible();

    // Neustart: nur localStorage überlebt (sessionStorage nicht)
    const restarted = await browser.newContext({ ...phone(UA.iphone), storageState: await page.context().storageState() });
    const again = await restarted.newPage();
    await emulateStandalone(again);
    await again.goto('/app');
    if (remember) await expect(again.getByRole('heading', { name: /Merle/ })).toBeVisible();
    else await again.waitForURL('**/app/willkommen');
    await restarted.close();
  }
});
