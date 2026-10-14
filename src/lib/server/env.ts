import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Private Umgebungswerte – nur serverseitig lesbar. `import 'server-only'` lässt den Build scheitern,
 * sobald eine Client-Komponente diese Datei (direkt oder indirekt) importiert.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return v;
}
const optional = (name: string): string | null => process.env[name] || null;

export const serverEnv = {
  supabaseSecretKey: () => required('SUPABASE_SECRET_KEY'),
  demoCustomerPassword: () => required('DEMO_CUSTOMER_PASSWORD'),
  // Teil 4
  crmBridgeSecret: () => optional('CRM_BRIDGE_SECRET'),
  notifyWorkerSecret: () => optional('NOTIFY_WORKER_SECRET'),
  vapid: () => {
    const publicKey = optional('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
    const privateKey = optional('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey, subject: optional('VAPID_SUBJECT') ?? 'mailto:info@hellobeautysalon.at' };
  },
  resend: () => {
    const key = optional('RESEND_API_KEY');
    const from = optional('NOTIFY_FROM_EMAIL');
    return key && from ? { key, from } : null;
  },
  stripe: () => {
    const secretKey = optional('STRIPE_SECRET_KEY');
    return secretKey ? { secretKey, webhookSecret: optional('STRIPE_WEBHOOK_SECRET'), connectAccount: optional('STRIPE_CONNECT_ACCOUNT_ID') } : null;
  },
  stripeWebhookSecret: () => optional('STRIPE_WEBHOOK_SECRET'),
};

/** Vergleich in konstanter Zeit (für Geheimnisse in Headern) */
export function safeEqual(a: string, b: string): boolean {

  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
