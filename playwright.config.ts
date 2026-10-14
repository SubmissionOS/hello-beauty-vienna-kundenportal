import { defineConfig } from '@playwright/test';

/**
 * Tests laufen gegen den Produktions-Build (mit Service Worker), Demo-Modus an.
 * Geräte werden über User-Agent + 390 px Breite simuliert (Chromium), siehe tests/devices.ts.
 */
const PORT = 3200;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
  },
  webServer: {
    command: `npx --no-install next build && npx --no-install next start -p ${PORT}`,
    url: `http://localhost:${PORT}/installieren`,
    reuseExistingServer: true,
    timeout: 300_000,
    env: { NEXT_PUBLIC_DEMO_MODE: 'true' },
  },
});
