import { defineConfig } from '@playwright/test';

/**
 * App-übergreifende Tests: Kundenportal (3200) + CRM (3400) gleichzeitig gegen dieselbe Supabase-Datenbank.
 *   npm run test:crossapp
 * Beide Apps laufen als Produktions-Build. Das CRM-Repo liegt daneben (../Hello-beauty-salon-CRM) und braucht
 * seine .env.local (im Portal: npm run crm:env). Passwörter der Team-Demokonten kommen aus .env.local.
 */
export default defineConfig({
  testDir: 'tests-crossapp',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    headless: process.env.HEADED !== '1',
  },
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
