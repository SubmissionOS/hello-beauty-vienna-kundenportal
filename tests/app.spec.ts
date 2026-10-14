import { expect, test, type Page } from '@playwright/test';
import { emulateStandalone, phone, shotDir, UA } from './devices';

test.use(phone(UA.iphone));

async function shot(page: Page, name: string) {
  await page.waitForTimeout(450); // Einblend-Animationen abwarten
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await emulateStandalone(page);
});

test('Registrierung → Code → Buchung → Termine → Profil → Löschen', async ({ page }) => {
  await page.goto('/app?source=pwa');
  await page.waitForURL('**/app/willkommen');
  await shot(page, 'app-01-willkommen');

  await page.getByRole('link', { name: 'Konto erstellen' }).click();
  const marketing = page.getByRole('checkbox');
  await expect(marketing).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute('href', /datenschutz/);
  await page.getByRole('button', { name: 'Code anfordern' }).click();
  await expect(page.getByText('Bitte ausfüllen.').first()).toBeVisible();
  await shot(page, 'app-02-registrieren');

  await page.getByLabel('Vorname', { exact: true }).fill('Sophie');
  await page.getByLabel('Nachname', { exact: true }).fill('Beispiel');
  await page.getByLabel('E-Mail', { exact: true }).fill('sophie@example.com');
  await page.getByRole('button', { name: 'Code anfordern' }).click();
  const notice = page.getByTestId('mock-code');
  await expect(notice).toBeVisible();
  await expect(page.locator('#otp')).toHaveAttribute('autocomplete', 'one-time-code');
  const code = (await notice.innerText()).match(/\d{6}/)![0];
  await page.locator('#otp').fill(code === '000000' ? '111111' : '000000');
  await expect(page.locator('#otp-error')).toContainText('Der Code stimmt nicht');
  await shot(page, 'app-03-code');
  await page.locator('#otp').fill(code);
  await page.waitForURL(/\/app$/);
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
  await page.getByLabel(/Jetzt online bezahlen/).check();
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
  await expect(page.getByRole('switch', { name: /Per SMS/ })).toBeDisabled();
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

  // Konto ist weg: Anmeldung mit derselben Adresse schlägt fehl
  await page.getByRole('link', { name: 'Ich habe schon ein Konto' }).click();
  await page.getByLabel('E-Mail').fill('sophie@example.com');
  await page.getByRole('button', { name: 'Code senden' }).click();
  await expect(page.getByText('Zu dieser E-Mail-Adresse gibt es noch kein Konto.')).toBeVisible();
  await shot(page, 'app-16-anmelden');
});

test('Demo-Kundin, Sprachen und Dunkelmodus', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Kommend \(2\)/ })).toBeVisible();
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
