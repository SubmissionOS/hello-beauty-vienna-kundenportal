import { expect, test, type Page } from '@playwright/test';
import { emulateStandalone, phone, shotDir, UA } from './devices';

// Teil 3/4 im Mock-Betrieb (Daten im Gerät). Mit Supabase: tests/supabase-teil4.spec.ts
test.skip(process.env.E2E_BACKEND === 'supabase', 'nur Mock-Adapter');
test.use(phone(UA.iphone));

async function shot(page: Page, name: string) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
}

async function demo(page: Page) {
  await emulateStandalone(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
}

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('Start: Wartelisten-Angebot ganz oben, Countdown läuft, „Ja, buchen“ bucht', async ({ page }) => {
  await demo(page);
  const banner = page.getByTestId('offer-banner');
  await expect(banner).toContainText('Ein Termin ist für Sie frei');
  // Angebot steht vor dem nächsten Termin
  const bannerY = (await banner.boundingBox())!.y;
  expect(bannerY).toBeLessThan((await page.getByText('Ihr nächster Termin').boundingBox())!.y);
  await expect(page.getByTestId('next-countdown')).toHaveText(/^Beginnt in \d+ (T \d+ Std|Std \d+ Min)$/);
  // Antwortzeit des Angebots läuft sekundengenau
  const left = banner.getByRole('timer');
  const t1 = await left.innerText();
  await page.waitForTimeout(1300);
  expect(await left.innerText()).not.toBe(t1);
  await expect(page.getByTestId('badge-neuigkeiten')).toHaveText('2');
  await expect(page.getByTestId('badge-app')).toHaveText('2'); // 1 Angebot + 1 Nachricht
  await shot(page, 'teil4-01-start');

  await banner.click();
  await page.waitForURL(/\/app\/angebot\//);
  const clock = page.getByTestId('offer-clock');
  await expect(clock).toHaveText(/^1?\d:\d\d$/);
  const c1 = await clock.innerText();
  await page.waitForTimeout(1200);
  expect(await clock.innerText()).not.toBe(c1);
  await shot(page, 'teil4-02-angebot');
  await page.getByRole('button', { name: 'Ja, buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Gebucht!' })).toBeVisible();
  await page.getByRole('link', { name: 'Zu meinen Terminen' }).click();
  await expect(page.getByRole('tab', { name: /Kommend \(5\)/ })).toBeVisible();
  await expect(page.getByText('Wimpernlifting').first()).toBeVisible();
});

test('Angebot: „Nein, danke“ und Ablauf der Antwortzeit', async ({ page }) => {
  await demo(page);
  await page.getByTestId('offer-banner').click();
  await page.getByRole('button', { name: 'Nein, danke' }).click();
  await expect(page.getByRole('heading', { name: 'Danke für die Rückmeldung' })).toBeVisible();
  // gleiches Angebot erneut öffnen → bereits beantwortet
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nicht mehr verfügbar' })).toBeVisible();

  // neues Angebot mit 2 s Antwortzeit → läuft ab
  const id = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('hb-mock-db-v1')!);
    const offers = db.extra.offers['demo-lena'];
    const o = { ...offers[0], id: 'of-kurz', status: 'offered', offeredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2000).toISOString() };
    offers.unshift(o);
    localStorage.setItem('hb-mock-db-v1', JSON.stringify(db));
    return o.id;
  });
  await page.goto(`/app/angebot/${id}`);
  await expect(page.getByRole('heading', { name: 'Leider abgelaufen' })).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('button', { name: 'Ja, buchen' })).toHaveCount(0);
});

test('Neuigkeiten: Zähler am Tab, nach dem Öffnen gelesen', async ({ page }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Neuigkeiten', exact: true }).click();
  await expect(page.getByTestId('news-item')).toHaveCount(3);
  await expect(page.getByText('Wimpernlifting −15 %')).toBeVisible();
  await expect(page.getByText(/Gültig bis/).first()).toBeVisible();
  await shot(page, 'teil4-03-neuigkeiten');
  await expect(page.getByTestId('badge-neuigkeiten')).toHaveCount(0);
});

test('Nachrichten: ungelesene Antwort auf Start, eigene Nachricht senden', async ({ page }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Neue Nachricht vom Salon' }).click();
  await expect(page.getByText('Wir legen sie Ihnen für den nächsten Termin bereit', { exact: false })).toBeVisible();
  await page.getByLabel('Ihre Nachricht').fill('Danke, bis bald!');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByTestId('chat-list').getByText('Danke, bis bald!')).toBeVisible();
  await shot(page, 'teil4-04-nachrichten');
  await page.getByRole('link', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Neue Nachricht vom Salon' })).toHaveCount(0);
});

test('Termine: Test-Zahlung, Absage mit Erstattung, Verschieben, Erneut buchen', async ({ page }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  const open = page.locator('article', { hasText: 'Zahlung offen' });
  await expect(open).toHaveCount(1);
  await expect(open.getByText(/Absagen oder verschieben bis/)).toBeVisible();
  await shot(page, 'teil4-05-termine');
  await open.getByRole('button', { name: /Jetzt bezahlen/ }).click();
  await expect(open.getByTestId('payment-panel')).toContainText('Test-Zahlung');
  await open.getByRole('button', { name: /Test-Zahlung durchführen/ }).click();
  await expect(page.getByRole('status')).toContainText('Zahlung erhalten');
  await expect(page.locator('article', { hasText: 'Laser Bikinizone' }).getByTestId('pay-status')).toContainText('Anzahlung bezahlt');

  // bezahlter Laser-Termin (9 Tage voraus) rechtzeitig absagen → volle Erstattung
  const paid = page.locator('article', { hasText: 'Laser Achseln' });
  await paid.getByRole('button', { name: 'Absagen' }).click();
  await expect(page.getByText(/Ihre Zahlung von 18(,00)?\s€ wird erstattet\./)).toBeVisible();
  await page.getByRole('button', { name: 'Ja, absagen' }).click();
  await expect(page.getByRole('status')).toContainText(/Erstattung: 18(,00)?\s€/);
  await expect(paid.getByTestId('pay-status')).toContainText('Erstattet');

  // Verschieben (eigene Mitarbeiterin, freie Zeit wählen)
  const move = page.locator('article', { hasText: 'Pediküre Spa' });
  await move.getByRole('button', { name: 'Verschieben' }).click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('heading', { name: 'Neuen Termin wählen' })).toBeVisible();
  const slot = sheet.locator('button').filter({ hasText: /^\d\d:\d\d$/ }).first();
  for (let i = 1; i < 10 && !(await slot.isVisible().catch(() => false)); i++) {
    await sheet.locator('[role="group"] button:not([disabled])').nth(i).click();
    await page.waitForTimeout(150);
  }
  await slot.click();
  await expect(page.getByRole('status')).toContainText('Verschoben auf');

  // Vergangene Termine: „Erneut buchen“ mit Vorauswahl
  await page.getByRole('tab', { name: /Vergangen/ }).click();
  await page.getByRole('link', { name: 'Erneut buchen' }).first().click();
  await page.waitForURL(/\/app\/buchen\?service=/);
  await expect(page.getByText('Schritt 4 von 5')).toBeVisible();
});

test('Buchen mit Anzahlung (Test-Zahlung) und Warteliste', async ({ page }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Buchen', exact: true }).click();
  await page.getByRole('button', { name: /^Laser/ }).click();
  await page.getByRole('button', { name: /Laser Oberlippe/ }).click();
  await page.getByRole('button', { name: /Keine Präferenz/ }).click();
  const slot = page.locator('button').filter({ hasText: /^\d\d:\d\d$/ }).first();
  for (let i = 1; i < 10 && !(await slot.isVisible().catch(() => false)); i++) {
    await page.locator('[role="group"] button:not([disabled])').nth(i).click();
    await page.waitForTimeout(150);
  }
  // Link zur Warteliste ist auf der Terminwahl immer da
  await expect(page.getByRole('link', { name: 'Auf die Warteliste setzen' })).toBeVisible();
  await slot.click();
  await expect(page.getByTestId('payment-rule')).toContainText(/Anzahlung jetzt online: 13,50\s€/);
  await shot(page, 'teil4-06-buchen-anzahlung');
  await page.getByRole('button', { name: 'Jetzt verbindlich buchen' }).click();
  await expect(page.getByTestId('payment-panel')).toBeVisible();
  await expect(page.getByText(/Reserviert noch/)).toBeVisible();
  await shot(page, 'teil4-07-test-zahlung');
  await page.getByRole('button', { name: /Test-Zahlung durchführen/ }).click();
  await expect(page.getByRole('heading', { name: 'Termin gebucht' })).toBeVisible();
  await expect(page.getByText('Zahlung erhalten')).toBeVisible();

  // Warteliste mit Vorauswahl aus der Buchung
  await page.goto('/app/warteliste?service=s-17');
  await expect(page.getByRole('checkbox', { name: 'Laser Oberlippe' })).toBeChecked();
  await page.getByLabel('Mitarbeiterin').selectOption({ label: 'Réka' });
  await page.locator('label', { hasText: 'Auch kurzfristig' }).locator('.row-main').click();
  await expect(page.getByRole('switch', { name: /Auch kurzfristig/ })).toBeChecked();
  await shot(page, 'teil4-08-warteliste-form');
  await page.getByRole('button', { name: 'Eintragen' }).click();
  await expect(page.getByText('Sie stehen jetzt auf der Warteliste.')).toBeVisible();
  await expect(page.getByTestId('waitlist-entry')).toHaveCount(2);
  await shot(page, 'teil4-09-warteliste');
  await page.getByTestId('waitlist-entry').first().getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByTestId('waitlist-entry')).toHaveCount(1);
});

test('Profil: Kundennummer + QR, Foto, Benachrichtigungen, Einwilligungen, Export', async ({ page }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.getByTestId('customer-number')).toHaveText(/^HB-[2-9A-HJ-NP-Z]{6}$/);
  await page.getByRole('button', { name: 'QR-Code' }).click();
  await expect(page.getByRole('img', { name: /Kundennummer HB-/ })).toBeVisible();
  await shot(page, 'teil4-10-qr');
  await page.getByRole('button', { name: 'Schließen' }).click();

  await page.locator('input[type="file"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.getByTestId('avatar-img')).toBeVisible();

  const news = page.getByRole('switch', { name: 'Infos aus dem Salon: E-Mail' });
  await expect(news).not.toBeChecked();
  await news.check();
  await expect(page.getByTestId('consent-sms-at')).toHaveText('Nicht erteilt');
  await page.getByRole('switch', { name: 'Angebote per SMS' }).check();
  await expect(page.getByTestId('consent-sms-at')).toHaveText(/^Erteilt am /);
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Infos aus dem Salon: E-Mail' })).toBeChecked();
  await expect(page.getByTestId('consent-sms-at')).toHaveText(/^Erteilt am /);
  await shot(page, 'teil4-11-profil');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Meine Daten exportieren/ }).click();
  const file = await (await download).path();
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8'));
  for (const key of ['customerNumber', 'chat', 'waitlist', 'waitlistOffers', 'payments', 'marketingConsents', 'notificationPreferences']) {
    expect(json).toHaveProperty(key);
  }
  expect(json.chat.length).toBeGreaterThan(0);
  expect(json.payments.length).toBeGreaterThan(0);
});

test('Mitteilungen: Erklär-Screen zuerst, Abfrage erst nach Tipp, nur in der installierten App', async ({ page, browser }) => {
  // Systemabfrage zählen (Headless-Chromium hätte sonst sofort „denied“)
  await page.addInitScript(() => {
    const w = window as unknown as { __asked: number };
    w.__asked = 0;
    Object.defineProperty(Notification, 'permission', { get: () => (w.__asked ? 'denied' : 'default') });
    Notification.requestPermission = async () => {
      w.__asked++;
      return 'denied';
    };
  });
  const asked = () => page.evaluate(() => (window as unknown as { __asked: number }).__asked);
  await demo(page);
  expect(await asked()).toBe(0); // nie beim ersten Laden
  await page.getByRole('link', { name: 'Profil', exact: true }).click();
  await page.getByRole('link', { name: /Mitteilungen aufs Handy/ }).click();
  await expect(page.getByRole('heading', { name: 'Mitteilungen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mitteilungen erlauben' })).toBeVisible();
  expect(await asked()).toBe(0); // auch nicht beim Erklär-Screen
  await shot(page, 'teil4-12-mitteilungen');
  await page.getByRole('button', { name: 'Mitteilungen erlauben' }).click();
  await expect(page.getByTestId('push-blocked')).toContainText('blockiert');
  expect(await asked()).toBe(1);

  // im normalen Browser-Tab: Hinweis aufs Installieren, kein Erlauben-Knopf
  const ctx = await browser.newContext({ ...phone(UA.iphone), storageState: await page.context().storageState() });
  const tab = await ctx.newPage();
  await tab.goto('/app/push');
  await expect(tab.getByTestId('push-blocked')).toContainText('installierten App');
  await expect(tab.getByRole('button', { name: 'Mitteilungen erlauben' })).toHaveCount(0);
  await ctx.close();
});

test('Dunkelmodus: neue Screens bei 390 px', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await demo(page);
  await shot(page, 'teil4-13-start-dunkel');
  await page.getByTestId('offer-banner').click();
  await expect(page.getByTestId('offer-clock')).toBeVisible();
  await shot(page, 'teil4-14-angebot-dunkel');
  await page.goto('/app/neuigkeiten');
  await expect(page.getByTestId('news-item').first()).toBeVisible();
  await shot(page, 'teil4-15-neuigkeiten-dunkel');
  await page.goto('/app/nachrichten');
  await expect(page.getByTestId('chat-list')).toBeVisible();
  await shot(page, 'teil4-16-nachrichten-dunkel');
  await page.goto('/app/termine');
  await expect(page.locator('article').first()).toBeVisible();
  await shot(page, 'teil4-17-termine-dunkel');
  await page.goto('/app/profil');
  await expect(page.getByTestId('customer-number')).toBeVisible();
  await shot(page, 'teil4-18-profil-dunkel');
  // horizontales Scrollen darf es auf keinem Screen geben
  for (const path of ['/app', '/app/termine', '/app/profil', '/app/warteliste', '/app/neuigkeiten', '/app/nachrichten', '/app/push']) {
    await page.goto(path);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
  }
});
