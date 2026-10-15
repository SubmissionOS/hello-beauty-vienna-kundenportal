import { expect, test } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { emulateStandalone, phone, UA } from './devices';

/**
 * Ende-zu-Ende gegen das echte Supabase-Projekt (nur mit E2E_BACKEND=supabase).
 * Registrierung/Anmeldung mit Passwort laufen echt (signUp, signInWithPassword, RLS, register_customer).
 * Ohne eigenes SMTP fängt der Test nur die Mail „Passwort zurücksetzen“ ab und holt den echten Recovery-Token
 * über die Admin-API (generateLink + /verify). Alle Testnutzerinnen werden am Ende gelöscht.
 */
test.skip(process.env.E2E_BACKEND !== 'supabase', 'nur mit E2E_BACKEND=supabase');
test.use(phone(UA.iphone));

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test.beforeEach(async ({ page }) => {
  await emulateStandalone(page);
});

test('Demo-Kundin: Termine aus der DB, Buchung, Export', async ({ page }) => {
  const startedAt = new Date().toISOString();
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
  await expect(page.getByText('Ihr nächster Termin')).toBeVisible();
  // Sitzung liegt im App-Speicher, nicht in Cookies (§ 165 Abs. 3 TKG: kein Banner nötig)
  expect(await page.context().cookies()).toEqual([]);

  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  // 3 abgeschlossene + 1 abgesagter (Seed Teil 4) – Abgesagtes steht unter „Vergangen“
  await expect(page.getByRole('tab', { name: /Vergangen \(4\)/ })).toBeVisible();
  const before = Number((await page.getByRole('tab', { name: /Kommend/ }).innerText()).match(/\((\d+)\)/)![1]);

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
  await expect(page.getByRole('tab', { name: new RegExp(`Kommend \\(${before + 1}\\)`) })).toBeVisible();

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Meine Daten exportieren/ }).click();
  const file = await (await download).path();
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8'));
  expect(json.profile.firstName).toBe('Lena');
  expect(json.appointments.length).toBeGreaterThanOrEqual(6);

  // Testbuchung und ihren Zähler fürs Buchungs-Limit wieder entfernen, damit die Demo-Daten gleich bleiben
  const { data: demo } = await admin().from('customers').select('id').eq('email', 'lena.musterfrau@example.com').single();
  await admin().from('appointments').delete().eq('customer_id', demo!.id).gte('created_at', startedAt);
  await admin().from('booking_attempts').delete().eq('customer_id', demo!.id).gte('created_at', startedAt);
});

const created: string[] = [];
test.afterAll(async () => {
  // Testnutzerinnen immer entfernen, auch wenn ein Test vorher scheitert
  const db = admin();
  for (const email of created) {
    const { data } = await db.from('customers').select('id, user_id').eq('email', email);
    for (const c of data ?? []) {
      await db.from('customers').delete().eq('id', c.id);
      if (c.user_id) await db.auth.admin.deleteUser(c.user_id);
    }
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users.users.filter((x) => x.email === email)) await db.auth.admin.deleteUser(u.id);
  }
});

test('Registrierung mit Passwort, angemeldet bleiben, Passwort zurücksetzen, Konto löschen', async ({ page, browser }) => {
  const email = `e2e-pw-${Date.now()}@example.com`;
  created.push(email);
  const db = admin();

  // Konto erstellen → sofort angemeldet (Confirm email ist AUS) → Start
  await page.goto('/app/registrieren');
  await page.getByLabel('Vorname', { exact: true }).fill('Erika');
  await page.getByLabel('Nachname', { exact: true }).fill('Testfall');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.locator('#password').fill('Erstes-Passwort-1');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Erika/ })).toBeVisible();

  const { data: cust } = await db.from('customers').select('user_id, first_name, marketing_consent').eq('email', email).single();
  expect(cust).toMatchObject({ first_name: 'Erika', marketing_consent: false });
  const userId = cust!.user_id as string;

  // „Neustart des Handys“: neuer Kontext nur mit dem gespeicherten App-Speicher und abgelaufenem Zugangstoken
  const state = await page.context().storageState();
  const origin = state.origins.find((o) => o.localStorage.some((x) => x.name === 'hb-auth'))!;
  const auth = origin.localStorage.find((x) => x.name === 'hb-auth')!;
  const stored = JSON.parse(auth.value);
  stored.expires_at = Math.floor(Date.now() / 1000) - 60; // Zugangstoken gilt als abgelaufen → Refresh-Token muss greifen
  auth.value = JSON.stringify(stored);
  const restarted = await browser.newContext({ ...phone(UA.iphone), storageState: state });
  const again = await restarted.newPage();
  await emulateStandalone(again);
  await again.goto('/app');
  await expect(again.getByRole('heading', { name: /Erika/ })).toBeVisible();
  await restarted.close();

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('switch', { name: /Neuigkeiten/ }).check();
  await expect
    .poll(async () => (await db.from('customers').select('marketing_consent_at').eq('user_id', userId).single()).data?.marketing_consent_at)
    .not.toBeNull();

  // Abmelden; falsches Passwort und unbekannte Adresse geben dieselbe Meldung
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/app/willkommen');
  await page.goto('/app/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.locator('#password').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  const neutral = 'E-Mail-Adresse oder Passwort stimmen nicht.';
  await expect(page.locator('p.alert[role="alert"]')).toHaveText(neutral);
  await page.getByLabel('E-Mail').fill(`unbekannt-${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('p.alert[role="alert"]')).toHaveText(neutral);

  // Passwort vergessen: Anfrage geht mit redirectTo auf /app/passwort-neu raus (Versand abgefangen, kein SMTP)
  let recoverBody = '';
  await page.route('**/auth/v1/recover*', async (route) => {
    recoverBody = `${route.request().url()} ${route.request().postData() ?? ''}`;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('link', { name: 'Passwort vergessen?' }).click();
  await expect(page.getByRole('heading', { name: 'Passwort vergessen' })).toBeVisible();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByRole('button', { name: 'Link senden' }).click();
  await expect(page.getByRole('heading', { name: 'E-Mail ist unterwegs' })).toBeVisible();
  expect(decodeURIComponent(recoverBody)).toContain('/app/passwort-neu');

  // Link aus der Mail nachbilden: echter Recovery-Token → Sitzung im URL-Fragment wie nach dem Klick
  const { data: link, error: le } = await db.auth.admin.generateLink({ type: 'recovery', email });
  expect(le).toBeNull();
  const verify = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', token_hash: link.properties!.hashed_token }),
  });
  const tokens = (await verify.json()) as { access_token: string; refresh_token: string };
  expect(tokens.access_token).toBeTruthy();

  // abgelaufener/ungültiger Link: klare Meldung
  await page.goto('/app/passwort-neu#error=access_denied&error_code=otp_expired');
  await expect(page.getByRole('heading', { name: 'Link nicht mehr gültig' })).toBeVisible();

  await page.goto('about:blank'); // nur Hash-Änderung würde die Seite nicht neu laden
  await page.goto(`/app/passwort-neu#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&type=recovery`);
  await expect(page.getByRole('heading', { name: 'Neues Passwort festlegen' })).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  await page.locator('#new-password').fill('Zweites-Passwort-2');
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Erika/ })).toBeVisible();

  // altes Passwort gilt nicht mehr, neues schon
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/app/willkommen');
  await page.goto('/app/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.locator('#password').fill('Erstes-Passwort-1');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('p.alert[role="alert"]')).toHaveText(neutral);
  await page.locator('#password').fill('Zweites-Passwort-2');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/app$/);

  // Konto löschen entfernt auch die Auth-Nutzerin
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Konto löschen' }).click();
  await page.getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.waitForURL('**/app/willkommen');
  const { data: gone } = await db.auth.admin.getUserById(userId);
  expect(gone.user).toBeNull();
});

test('Registrierung mit vergebener Adresse: Hinweis statt Fehler, kein zweites Konto', async ({ page }) => {
  const lenaCount = async () => (await admin().from('customers').select('id', { count: 'exact', head: true }).eq('email', 'lena.musterfrau@example.com')).count;
  const before = await lenaCount();
  await page.goto('/app/registrieren');
  await page.getByLabel('Vorname', { exact: true }).fill('Lena');
  await page.getByLabel('Nachname', { exact: true }).fill('Doppelt');
  await page.getByLabel('E-Mail', { exact: true }).fill('lena.musterfrau@example.com');
  await page.locator('#password').fill('Irgendein-Passwort-9');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.locator('p.alert[role="alert"]')).toContainText('Für diese E-Mail gibt es schon ein Konto –');
  await expect(page.locator('p.alert[role="alert"]').getByRole('link', { name: 'jetzt anmelden?' })).toHaveAttribute('href', '/app/anmelden');
  expect(await lenaCount()).toBe(before);
});
