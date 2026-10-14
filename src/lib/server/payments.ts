import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';
import { safeEqual, serverEnv } from './env';
import { supabaseAdmin } from './supabase';

/**
 * Zahlungs-Adapter. Zwei Anbieter mit derselben Schnittstelle:
 *  - mock:   „Test-Zahlung“ ohne Geldfluss (aktiv, solange STRIPE_SECRET_KEY fehlt)
 *  - stripe: Checkout Session über die REST-API (ohne Paket), Stripe Connect mit dem Konto des Salons.
 *            Kartendaten berühren nie diesen Server – Stripe Checkout ist eine Stripe-Seite.
 * Ergebnisse fließen über dieselben DB-Funktionen (svc_payment_*), die Idempotenz liegt in payment_events.
 */

export interface CheckoutPayment {
  id: string;
  amountCents: number;
  serviceName: string;
  holdExpiresAt: string;
}

export interface PaymentProvider {
  name: 'mock' | 'stripe';
  /** Zahlungsseite anlegen; Rückgabe: URL, auf die die App weiterleitet */
  createCheckout(p: CheckoutPayment, origin: string): Promise<{ url: string; ref: string }>;
  /** Erstattung beim Anbieter auslösen */
  refund(p: { id: string; providerRef: string | null; refundCents: number }): Promise<void>;
}

export const mockProvider: PaymentProvider = {
  name: 'mock',
  async createCheckout(p) {
    return { url: `/app/termine?test-payment=${p.id}`, ref: `mock_${p.id}` };
  },
  async refund(p) {
    await supabaseAdmin().rpc('svc_payment_refunded', {
      p_provider: 'mock',
      p_event_id: `refund:${p.id}`,
      p_ref: p.providerRef ?? p.id,
      p_refunded_cents: p.refundCents,
    });
  },
};

async function stripeApi(path: string, form: Record<string, string>, idempotencyKey: string) {
  const cfg = serverEnv.stripe();
  if (!cfg) throw new Error('stripe_not_configured');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Idempotency-Key': idempotencyKey,
  };
  // Stripe Connect: Zahlung direkt auf dem Konto des Salons („direct charge“)
  if (cfg.connectAccount) headers['Stripe-Account'] = cfg.connectAccount;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`stripe_${res.status}`);
  return data;
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',
  async createCheckout(p, origin) {
    const session = await stripeApi(
      'checkout/sessions',
      {
        mode: 'payment',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(p.amountCents),
        'line_items[0][price_data][product_data][name]': p.serviceName,
        'metadata[payment_id]': p.id,
        'payment_intent_data[metadata][payment_id]': p.id,
        client_reference_id: p.id,
        // Checkout läuft höchstens so lange wie die Reservierung (Stripe verlangt mind. 30 Minuten)
        expires_at: String(Math.max(Math.floor(Date.parse(p.holdExpiresAt) / 1000), Math.floor(Date.now() / 1000) + 31 * 60)),
        success_url: `${origin}/app/termine?bezahlt=1`,
        cancel_url: `${origin}/app/termine`,
      },
      `checkout:${p.id}`,
    );
    return { url: String(session.url), ref: String(session.id) };
  },
  async refund(p) {
    if (!p.providerRef) throw new Error('missing_ref');
    await stripeApi('refunds', { payment_intent: p.providerRef, amount: String(p.refundCents), 'metadata[payment_id]': p.id }, `refund:${p.id}`);
    // Bestätigung kommt per Webhook (charge.refunded)
  },
};

export const activeProvider = (): PaymentProvider => (serverEnv.stripe() ? stripeProvider : mockProvider);

/**
 * Stripe-Signatur prüfen (Header „Stripe-Signature: t=…,v1=…“): HMAC-SHA256(secret, `${t}.${payload}`),
 * Zeitstempel höchstens 5 Minuten alt. https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now(), toleranceS = 300): boolean {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => safeEqual(s, expected));
}

export type WebhookOutcome = 'paid' | 'duplicate' | 'refund_needed' | 'amount_mismatch' | 'not_found' | 'failed' | 'refunded' | 'ignored';

/** Stripe-Ereignis verarbeiten (idempotent über payment_events) */
export async function handleStripeEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }): Promise<WebhookOutcome> {
  const db = supabaseAdmin();
  const o = event.data.object;
  const meta = (o.metadata ?? {}) as Record<string, string>;
  const paymentId = meta.payment_id ?? (typeof o.client_reference_id === 'string' ? o.client_reference_id : null);
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error('db');
    return data as WebhookOutcome;
  };
  switch (event.type) {
    case 'checkout.session.completed':
      if (o.payment_status !== 'paid') return 'ignored';
      return rpc('svc_payment_succeeded', {
        p_provider: 'stripe',
        p_event_id: event.id,
        p_payment_id: paymentId,
        p_ref: typeof o.payment_intent === 'string' ? o.payment_intent : null,
        p_amount_cents: typeof o.amount_total === 'number' ? o.amount_total : null,
      });
    case 'checkout.session.expired':
    case 'payment_intent.payment_failed':
      return rpc('svc_payment_failed', {
        p_provider: 'stripe',
        p_event_id: event.id,
        p_payment_id: paymentId,
        p_ref: typeof o.id === 'string' ? o.id : null,
      });
    case 'charge.refunded':
      return rpc('svc_payment_refunded', {
        p_provider: 'stripe',
        p_event_id: event.id,
        p_ref: typeof o.payment_intent === 'string' ? o.payment_intent : '',
        p_refunded_cents: typeof o.amount_refunded === 'number' ? o.amount_refunded : 0,
      });
    default:
      return 'ignored';
  }
}

/** Test-Zahlung (Mock): gleicher Weg wie ein erfolgreicher Webhook */
export async function completeMockPayment(paymentId: string, amountCents: number): Promise<WebhookOutcome> {
  const db = supabaseAdmin();
  await db.rpc('svc_payment_set_provider', { p_payment_id: paymentId, p_provider: 'mock', p_ref: `mock_${paymentId}` });
  const { data, error } = await db.rpc('svc_payment_succeeded', {
    p_provider: 'mock',
    p_event_id: `mock:${randomUUID()}`,
    p_payment_id: paymentId,
    p_ref: `mock_${paymentId}`,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error('db');
  return data as WebhookOutcome;
}

/** Offene Erstattungen beim jeweiligen Anbieter auslösen (vom Worker aufgerufen) */
export async function processRefunds(): Promise<number> {
  const db = supabaseAdmin();
  const { data } = await db.rpc('svc_refunds_pending');
  const list = (data ?? []) as { id: string; provider: 'mock' | 'stripe'; providerRef: string | null; refundCents: number }[];
  let n = 0;
  for (const p of list) {
    const provider = p.provider === 'stripe' ? stripeProvider : mockProvider;
    if (provider.name === 'stripe' && !serverEnv.stripe()) continue;
    try {
      await provider.refund(p);
      n++;
    } catch {
      /* nächster Lauf versucht es erneut */
    }
  }
  return n;
}
