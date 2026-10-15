import { defineConfig, devices } from '@playwright/test';

/**
 * Abschlussprüfung (docs/NACHTSCHICHT.md): beide Apps im echten Browser, sichtbar (headed),
 * Chromium bei 390/768/1440 px und WebKit als iPhone (390 px), jeweils hell und dunkel.
 *   npm run test:qa                     → Screenshots + automatische Befunde unter qa/durchlauf-<RUN>/
 *   QA_RUN=B1 npm run test:qa           → nächster Durchlauf in eigenem Ordner
 * Der Durchlauf bricht bei Fehlern NICHT ab: Befunde werden gesammelt, nicht repariert.
 */
const headed = { headless: process.env.QA_HEADLESS === '1' ? true : false };

export default defineConfig({
  testDir: 'tests-qa',
  timeout: 20 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { locale: 'de-AT', timezoneId: 'Europe/Vienna', actionTimeout: 15_000, navigationTimeout: 30_000, ...headed },
  projects: [
    { name: 'chromium-390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['iPhone 15'].userAgent } },
    { name: 'chromium-768', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'chromium-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'], viewport: { width: 390, height: 844 }, browserName: 'webkit' } },
  ],
  webServer: [
    {
      command: 'npm run build && npx --no-install next start -p 3200',
      url: 'http://localhost:3200/installieren',
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_DEMO_MODE: 'true', NEXT_PUBLIC_DATA_ADAPTER: 'supabase', NEXT_PUBLIC_AUTH_ADAPTER: 'supabase' },
    },
    {
      command: 'npm run build && npx --no-install next start -p 3400',
      cwd: '../Hello-beauty-salon-CRM',
      url: 'http://localhost:3400/login',
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
