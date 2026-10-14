import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import { stripeProvider } from '@/lib/server/payments';
import { originFromRequest, supabaseAdmin, supabaseAs } from '@/lib/server/supabase';

/**
 * Stripe Checkout starten (vorbereitet, aktiv erst mit STRIPE_SECRET_KEY). Kein Stripe-Script in der App –
 * die Kundin wird auf die Zahlungsseite von Stripe weitergeleitet; Kartendaten berühren diesen Server nie.
 */
export async function POST(req: Request) {
  if (!serverEnv.stripe()) return NextResponse.json({ error: 'stripe_not_configured' }, { status: 501 });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return new NextResponse(null, { status: 401 });
  const { paymentId } = (await req.json().catch(() => ({}))) as { paymentId?: string };
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const origin = originFromRequest(req);
  const { data: open } = await supabaseAs(origin, token).rpc('payment_for_checkout', { p_payment_id: paymentId });
  if (!open) return NextResponse.json({ error: 'not_open' }, { status: 409 });
  const p = open as { id: string; amountCents: number; serviceName: string; holdExpiresAt: string };
  try {
    const session = await stripeProvider.createCheckout(p, process.env.NEXT_PUBLIC_APP_URL || origin);
    await supabaseAdmin().rpc('svc_payment_set_provider', { p_payment_id: p.id, p_provider: 'stripe', p_ref: session.ref });
    return NextResponse.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });
  }
}
