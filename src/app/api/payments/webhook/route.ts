import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import { handleStripeEvent, verifyStripeSignature } from '@/lib/server/payments';

/**
 * Stripe-Webhook: Signatur prüfen (Rohtext!), dann idempotent verarbeiten – ein Ereignis zählt nur einmal
 * (payment_events, Primärschlüssel Anbieter + Ereignis-ID). Antwort 200 auch für bekannte/ignorierte Ereignisse,
 * damit Stripe nicht endlos wiederholt.
 */
export async function POST(req: Request) {
  const secret = serverEnv.stripeWebhookSecret();
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });
  const payload = await req.text();
  if (payload.length > 256 * 1024) return new NextResponse(null, { status: 413 });
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature') ?? '', secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof event?.id !== 'string' || typeof event?.type !== 'string' || typeof event?.data?.object !== 'object') {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
  }
  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, outcome });
  } catch {
    // DB nicht erreichbar → Stripe wiederholt später
    return NextResponse.json({ error: 'retry' }, { status: 500 });
  }
}
