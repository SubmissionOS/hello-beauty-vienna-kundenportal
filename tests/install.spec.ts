import { expect, test } from '@playwright/test';
import { emulateStandalone, laptop, phone, shotDir, UA } from './devices';

test.describe('iPhone (iOS 26, Safari)', () => {
  test.use(phone(UA.iphone));

  test('zeigt Anleitung mit 4 Tipps, Umschalter, Pfeil – ohne Login', async ({ page }) => {
    await page.goto('/installieren');
    await expect(page.getByRole('heading', { name: 'So geht’s – 4 Tipps' })).toBeVisible();
    const steps = page.locator('ol li');
    await expect(steps).toHaveCount(5);
    // Mockup ist nicht bedienbar
    const device = page.locator('figure [aria-hidden="true"]').first();
    await expect(device).toHaveCSS('pointer-events', 'none');
    await expect(page.getByText('Ihre Safari-Leiste')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${shotDir}/installieren-ios-animation-1.png` });
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `${shotDir}/installieren-ios-animation-2.png` });

    await page.getByRole('button', { name: 'Älteres iOS' }).click();
    await expect(page.getByRole('heading', { name: 'So geht’s – 3 Tipps' })).toBeVisible();
    await expect(page.locator('ol li')).toHaveCount(4);
  });

  test('Pause hält die Animation an, Wiederholen startet bei Schritt 1', async ({ page }) => {
    await page.goto('/installieren');
    await page.getByRole('button', { name: 'Pause' }).click();
    const current = page.locator('li[aria-current="step"]');
    const before = await current.innerText();
    await page.waitForTimeout(2500);
    expect(await current.innerText()).toBe(before);
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(current).toContainText('Unten rechts');
  });

  test('Standbilder je Schritt (reduzierte Bewegung) in DE, EN, HU', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/installieren');
    await expect(page.getByRole('button', { name: 'Nächster Schritt' })).toBeVisible();
    for (let n = 1; n <= 5; n++) {
      await page.locator('section').first().screenshot({ path: `${shotDir}/installieren-ios-schritt-${n}.png` });
      if (n < 5) await page.getByRole('button', { name: 'Nächster Schritt' }).click();
    }
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'How it works – 4 taps' })).toBeVisible();
    await page.getByRole('button', { name: 'Magyar' }).click();
    await expect(page.getByRole('heading', { name: 'Így működik – 4 koppintás' })).toBeVisible();
    await page.screenshot({ path: `${shotDir}/installieren-ios-hu.png`, fullPage: true });
  });

  test('Seite komplett (390 px)', async ({ page }) => {
    await page.goto('/installieren');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shotDir}/installieren-ios.png`, fullPage: true });
  });
});

test.describe('iPhone mit älterem iOS', () => {
  test.use(phone(UA.iphoneLegacy));
  test('wählt automatisch die Variante mit Teilen-Symbol', async ({ page }) => {
    await page.goto('/installieren');
    await expect(page.getByRole('heading', { name: 'So geht’s – 3 Tipps' })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('section').first().screenshot({ path: `${shotDir}/installieren-ios-aelter.png` });
  });
});

test.describe('Android (Chrome)', () => {
  test.use(phone(UA.android));

  test('ohne Install-Event: Ladezustand, nach 5 s Anleitung', async ({ page }) => {
    await page.goto('/installieren');
    const btn = page.getByRole('button', { name: /Wird vorbereitet/ });
    await expect(btn).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'So geht’s – 2 Tipps' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'So geht’s – 2 Tipps' })).toBeVisible({ timeout: 7000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${shotDir}/installieren-android-anleitung.png`, fullPage: true });
  });

  test('mit Install-Event: Button → prompt() → Erfolg', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __promptCalls: number }).__promptCalls = 0;
      window.addEventListener('DOMContentLoaded', () => {
        const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: string }>;
        };
        e.prompt = async () => {
          (window as unknown as { __promptCalls: number }).__promptCalls++;
        };
        e.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(e);
      });
    });
    await page.goto('/installieren');
    const btn = page.getByRole('button', { name: 'App hinzufügen' });
    await expect(btn).toBeEnabled();
    await page.screenshot({ path: `${shotDir}/installieren-android.png`, fullPage: true });
    await btn.click();
    await expect(page.getByText('Öffnen Sie Hello Beauty jetzt vom Startbildschirm.')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __promptCalls: number }).__promptCalls)).toBe(1);
    await page.screenshot({ path: `${shotDir}/installieren-android-erfolg.png`, fullPage: true });
  });
});

test.describe('In-App-Browser (Instagram)', () => {
  test.use(phone(UA.instagram));
  test('Hinweis, Safari-Link und Link kopieren', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/installieren');
    await expect(page.getByRole('heading', { name: 'Bitte im Browser öffnen' })).toBeVisible();
    await expect(page.getByText(/in Instagram geöffnet/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'In Safari öffnen' })).toHaveAttribute('href', /^x-safari-http/);
    await page.getByRole('button', { name: 'Link kopieren' }).click();
    await expect(page.getByRole('button', { name: 'Link kopiert' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/installieren$/);
    await page.screenshot({ path: `${shotDir}/installieren-inapp.png`, fullPage: true });
  });
});

test.describe('Desktop (Vorführmodus)', () => {
  test.use(laptop);
  test('QR-Code groß, iOS und Android nebeneinander', async ({ page }) => {
    await page.goto('/installieren');
    await expect(page.getByRole('img', { name: /QR-Code: http.*\/installieren/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'So geht’s – 4 Tipps' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'So geht’s – 2 Tipps' })).toBeVisible();
    await page.waitForTimeout(4200);
    await page.screenshot({ path: `${shotDir}/installieren-desktop.png` });
  });
});

test.describe('Installierte App (standalone)', () => {
  test.use(phone(UA.iphone));
  test('/installieren und / leiten in die App', async ({ page }) => {
    await emulateStandalone(page);
    await page.goto('/installieren');
    await page.waitForURL('**/app/willkommen');
    await page.goto('/');
    await page.waitForURL('**/app/willkommen');
    await expect(page.getByRole('heading', { name: 'Willkommen bei Hello Beauty' })).toBeVisible();
    await page.screenshot({ path: `${shotDir}/standalone-willkommen.png`, fullPage: true });
  });
});

test.describe('QR-Seite', () => {
  test.use(laptop);
  test('QR auf aktuelle Origin, lokal erzeugt', async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on('request', (r) => !r.url().startsWith(baseURL!) && !r.url().startsWith('data:') && external.push(r.url()));
    await page.goto('/qr');
    await expect(page.getByRole('img', { name: `QR-Code: ${baseURL}/installieren` })).toBeVisible();
    expect(external).toEqual([]);
    await page.screenshot({ path: `${shotDir}/qr.png`, fullPage: true });
  });
});
