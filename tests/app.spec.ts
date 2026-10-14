import { expect, test, type Page } from '@playwright/test';
import { emulateStandalone, phone, shotDir, UA } from './devices';

// Mock-spezifisch (Konten im localStorage, Link „Passwort vergessen“ wird angezeigt); mit Supabase deckt tests/supabase.spec.ts denselben Ablauf ab
test.skip(process.env.E2E_BACKEND === 'supabase', 'nur Mock-Adapter');
test.use(phone(UA.iphone));

async function shot(page: Page, name: string) {
  await page.waitForTimeout(450); // Einblend-Animationen abwarten
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await emulateStandalone(page);
});

test('Registrierung mit Passwort → Buchung → Termine → Profil → Löschen', async ({ page }) => {
  await page.goto('/app?source=pwa');
  await page.waitForURL('**/app/willkommen');
  await shot(page, 'app-01-willkommen');

  await page.getByRole('link', { name: 'Konto erstellen' }).click();
  const marketing = page.getByRole('checkbox');
  await expect(marketing).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute('href', /datenschutz/);
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.getByText('Bitte ausfüllen.').first()).toBeVisible();
  await expect(page.getByText('Bitte mindestens 10 Zeichen eingeben.')).toBeVisible();
  await shot(page, 'app-02-registrieren');

  await page.getByLabel('Vorname', { exact: true }).fill('Sophie');
  await page.getByLabel('Nachname', { exact: true }).fill('Beispiel');
  await page.getByLabel('E-Mail', { exact: true }).fill('sophie@example.com');
  // Passwortmanager (Schlüsselbund/Google) erkennen das Formular an autocomplete + name
  const pw = page.locator('#password');
  await expect(page.locator('#email')).toHaveAttribute('autocomplete', 'username');
  await expect(pw).toHaveAttribute('autocomplete', 'new-password');
  await expect(pw).toHaveAttribute('name', 'password');
  await pw.fill('kurz');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.locator('#password-error')).toHaveText('Bitte mindestens 10 Zeichen eingeben.');
  await pw.fill('Rosen-Garten-2026');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Passwort anzeigen' }).click();
  await expect(pw).toHaveAttribute('type', 'text');
  await shot(page, 'app-03-passwort');
  await page.getByRole('button', { name: 'Passwort verbergen' }).click();
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.waitForURL(/\/app$/);
  // Passwort liegt nie im Klartext im Speicher
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('Rosen-Garten-2026');
  await expect(page.getByRole('heading', { name: /Sophie/ })).toBeVisible();
  await shot(page, 'app-04-start-ohne-termin');

  // Buchung
  await page.getByRole('link', { name: 'Buchen', exact: true }).click();
  await expect(page.getByText('Schritt 1 von 5')).toBeVisible();
  await shot(page, 'app-05-buchen-kategorie');
  await page.getByRole('button', { name: /^Nägel/ }).click();
  await shot(page, 'app-06-buchen-leistung');
  await page.getByRole('button', { name: /Maniküre \+ Shellac/ }).click();
  await shot(page, 'app-07-buchen-mitarbeiterin');
  await page.getByRole('button', { name: /Keine Präferenz/ }).click();
  // ersten Tag mit freien Zeiten wählen
  const slot = page.locator('button').filter({ hasText: /^\d\d:\d\d$/ }).first();
  for (let i = 1; i < 10 && !(await slot.isVisible().catch(() => false)); i++) {
    const days = page.locator('[role="group"] button:not([disabled])');
    await days.nth(i).click();
    await page.waitForTimeout(150);
  }
  await shot(page, 'app-08-buchen-termin');
  await slot.click();
  await expect(page.getByText('Schritt 5 von 5')).toBeVisible();
  // Teil 4: Zahlungsregel statt Auswahl – Maniküre wird im Salon bezahlt
  await expect(page.getByTestId('payment-rule')).toContainText('Bezahlung im Salon');
  await shot(page, 'app-09-buchen-bestaetigen');
  await page.getByRole('button', { name: 'Jetzt verbindlich buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Termin gebucht' })).toBeVisible();
  await shot(page, 'app-10-buchen-fertig');

  await page.getByRole('link', { name: 'Zu meinen Terminen' }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(page.getByText('Bestätigt')).toBeVisible();
  await shot(page, 'app-11-termine');

  await page.getByRole('link', { name: 'Start', exact: true }).click();
  await expect(page.getByText('Ihr nächster Termin')).toBeVisible();
  await shot(page, 'app-12-start');

  // Profil
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Terminerinnerungen: SMS' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Impressum/ })).toHaveAttribute('href', /impressum/);
  await shot(page, 'app-13-profil');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Meine Daten exportieren/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^hello-beauty-daten-.*\.json$/);

  await page.getByRole('button', { name: 'Dunkel' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, 'app-14-profil-dunkel');
  await page.getByRole('button', { name: 'Automatisch' }).click();

  await page.getByRole('button', { name: 'Konto löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Konto wirklich löschen?' })).toBeVisible();
  await shot(page, 'app-15-konto-loeschen');
  await page.getByRole('button', { name: 'Endgültig löschen' }).click();
  await page.waitForURL('**/app/willkommen');

  // Konto ist weg: Anmeldung schlägt fehl – mit derselben neutralen Meldung wie bei falschem Passwort
  await page.getByRole('link', { name: 'Ich habe schon ein Konto' }).click();
  await page.getByLabel('E-Mail').fill('sophie@example.com');
  await page.locator('#password').fill('Rosen-Garten-2026');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('p.alert[role="alert"]')).toHaveText('E-Mail-Adresse oder Passwort stimmen nicht.');
  await shot(page, 'app-16-anmelden');
});

test('Anmelden, angemeldet bleiben, Passwort vergessen', async ({ page, browser }) => {
  await page.goto('/app/registrieren');
  await page.getByLabel('Vorname', { exact: true }).fill('Mira');
  await page.getByLabel('Nachname', { exact: true }).fill('Test');
  await page.getByLabel('E-Mail', { exact: true }).fill('mira@example.com');
  await page.locator('#password').fill('Erstes-Passwort-1');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.waitForURL(/\/app$/);
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/app/willkommen');

  // falsches Passwort: neutrale Meldung
  await page.goto('/app/anmelden');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
  await page.getByLabel('E-Mail').fill('mira@example.com');
  await page.locator('#password').fill('falsches-passwort');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('p.alert[role="alert"]')).toHaveText('E-Mail-Adresse oder Passwort stimmen nicht.');

  // Passwort vergessen → Link (im Testbetrieb angezeigt) → neues Passwort → angemeldet
  await page.getByRole('link', { name: 'Passwort vergessen?' }).click();
  await expect(page.getByRole('heading', { name: 'Passwort vergessen' })).toBeVisible();
  await page.getByLabel('E-Mail').fill('mira@example.com');
  await page.getByRole('button', { name: 'Link senden' }).click();
  await expect(page.getByRole('heading', { name: 'E-Mail ist unterwegs' })).toBeVisible();
  await shot(page, 'app-21-passwort-vergessen');
  await page.getByRole('link', { name: 'Neues Passwort festlegen' }).click();
  await expect(page.locator('#new-password')).toHaveAttribute('autocomplete', 'new-password');
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue('mira@example.com');
  await page.locator('#new-password').fill('Zweites-Passwort-2');
  await shot(page, 'app-22-passwort-neu');
  await page.getByRole('button', { name: 'Passwort speichern' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Mira/ })).toBeVisible();

  // „Neustart“: neuer Browser-Kontext mit dem gespeicherten App-Speicher → weiterhin angemeldet
  const restarted = await browser.newContext({ ...phone(UA.iphone), storageState: await page.context().storageState() });
  const again = await restarted.newPage();
  await emulateStandalone(again);
  await again.goto('/app');
  await expect(again.getByRole('heading', { name: /Mira/ })).toBeVisible();
  await restarted.close();

  // abmelden; altes Passwort gilt nicht mehr, neues schon
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.waitForURL('**/app/willkommen');
  await page.goto('/app/anmelden');
  await page.getByLabel('E-Mail').fill('mira@example.com');
  await page.locator('#password').fill('Erstes-Passwort-1');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.locator('p.alert[role="alert"]')).toBeVisible();
  await page.locator('#password').fill('Zweites-Passwort-2');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Mira/ })).toBeVisible();
});

test('Demo-Kundin, Sprachen und Dunkelmodus', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Kommend \(4\)/ })).toBeVisible();
  await page.getByRole('tab', { name: /Vergangen/ }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await shot(page, 'app-17-demo-vergangen');

  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText('Your next appointment')).toBeVisible();
  await shot(page, 'app-18-start-en');

  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Magyar' }).click();
  await page.getByRole('link', { name: 'Foglalás', exact: true }).click();
  await expect(page.getByText('Miben segíthetünk?')).toBeVisible();
  await shot(page, 'app-19-buchen-hu');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('link', { name: 'Kezdőlap', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, 'app-20-start-dunkel-hu');
});
