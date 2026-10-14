import { expect, test } from '@playwright/test';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { emulateStandalone, phone, UA } from './devices';

/**
 * Ende-zu-Ende gegen das echte Supabase-Projekt (nur mit E2E_BACKEND=supabase).
 * E-Mail-Versand ist noch nicht eingerichtet: Der Test fängt nur die Sende-Anfrage ab und holt den echten
 * 6-stelligen Code über die Admin-API (generateLink) – verifyOtp, RLS und Funktionen laufen echt.
 */
test.skip(process.env.E2E_BACKEND !== 'supabase', 'nur mit E2E_BACKEND=supabase');
test.use(phone(UA.iphone));

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test.beforeEach(async ({ page }) => {
  await emulateStandalone(page);
});

test('Demo-Kundin: Termine aus der DB, Buchung, Export', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
  await expect(page.getByText('Ihr nächster Termin')).toBeVisible();

  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Vergangen \(3\)/ })).toBeVisible();

  await page.getByRole('link', { name: 'Buchen', exact: true }).click();
  await page.getByRole('button', { name: /^Kosmetik/ }).click();
  await page.getByRole('button', { name: /Augenbrauen/ }).click();
  await page.getByRole('button', { name: /Keine Präferenz/ }).click();
  const slot = page.locator('button').filter({ hasText: /^\d\d:\d\d$/ }).last();
  for (let i = 1; i < 10 && !(await slot.isVisible().catch(() => false)); i++) {
    await page.locator('[role="group"] button:not([disabled])').nth(i).click();
    await page.waitForTimeout(400);
  }
  await slot.click();
  await page.getByRole('button', { name: 'Jetzt verbindlich buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Termin gebucht' })).toBeVisible();
  await page.getByRole('link', { name: 'Zu meinen Terminen' }).click();
  await expect(page.getByRole('tab', { name: /Kommend \(3\)/ })).toBeVisible();

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Meine Daten exportieren/ }).click();
  const file = await (await download).path();
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8'));
  expect(json.profile.firstName).toBe('Lena');
  expect(json.appointments.length).toBeGreaterThanOrEqual(6);
});

test('Registrierung mit echtem Code, Profil, Konto löschen', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  // nur den Versand abfangen (kein SMTP) – alles andere echt
  await page.route('**/auth/v1/otp*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await page.goto('/app/registrieren');
  await page.getByLabel('Vorname', { exact: true }).fill('Erika');
  await page.getByLabel('Nachname', { exact: true }).fill('Testfall');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Code anfordern' }).click();
  await expect(page.getByRole('heading', { name: 'Code eingeben' })).toBeVisible();

  const db = admin();
  const { data: created, error: ce } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { language: 'de' } });
  expect(ce).toBeNull();
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  expect(le).toBeNull();
  const code = link.properties?.email_otp ?? '';
  expect(code).toMatch(/^\d{6}$/);

  await page.locator('#otp').fill(code === '000000' ? '111111' : '000000');
  await expect(page.locator('#otp-error')).toBeVisible();
  await page.locator('#otp').fill(code);
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Erika/ })).toBeVisible();

  const { data: cust } = await db.from('customers').select('first_name, marketing_consent').eq('user_id', created.user!.id).single();
  expect(cust).toEqual({ first_name: 'Erika', marketing_consent: false });

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('switch', { name: /Neuigkeiten/ }).check();
  await expect
    .poll(async () => (await db.from('customers').select('marketing_consent_at').eq('user_id', created.user!.id).single()).data?.marketing_consent_at)
    .not.toBeNull();

  await page.getByRole('button', { name: 'Konto löschen' }).click();
  await page.getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.waitForURL('**/app/willkommen');
  const { data: gone } = await db.auth.admin.getUserById(created.user!.id);
  expect(gone.user).toBeNull();
});

test('Anmeldung mit unbekannter Adresse: kein Konto, keine Mail', async ({ page }) => {
  await page.goto('/app/anmelden');
  await page.getByLabel('E-Mail').fill(`unbekannt-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Code senden' }).click();
  await expect(page.getByText('Zu dieser E-Mail-Adresse gibt es noch kein Konto.')).toBeVisible();
});
