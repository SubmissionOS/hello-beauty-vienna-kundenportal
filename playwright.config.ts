import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';

/**
 * Tests laufen gegen den Produktions-Build (mit Service Worker und Secret-Scan), Demo-Modus an.
 *   npm test                     → Mock-Adapter (Teil 1, ohne Netz)
 *   npm run test:supabase        → Supabase-Adapter gegen das echte Projekt (Werte aus .env.local)
 * Geräte werden über User-Agent + 390 px Breite simuliert (Chromium), siehe tests/devices.ts.
 */
const PORT = 3200;
const backend = process.env.E2E_BACKEND === 'supabase' ? 'supabase' : 'mock';
// Webhook-Geheimnis nur für diesen Testlauf (zufällig, nie gespeichert) – Tests signieren simulierte Stripe-Ereignisse damit
process.env.E2E_WEBHOOK_SECRET ??= `whsec_${randomBytes(24).toString('hex')}`;

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
    command: `npm run build && npx --no-install next start -p ${PORT}`,
    url: `http://localhost:${PORT}/installieren`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_DEMO_MODE: 'true',
      NEXT_PUBLIC_DATA_ADAPTER: backend,
      NEXT_PUBLIC_AUTH_ADAPTER: backend,
      STRIPE_WEBHOOK_SECRET: process.env.E2E_WEBHOOK_SECRET,
      // die abgeschaltete CRM-Schnittstelle bleibt getestet
      CRM_API_ENABLED: 'true',
    },
  },
});
