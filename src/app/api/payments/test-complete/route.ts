import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import { completeMockPayment } from '@/lib/server/payments';
import { originFromRequest, supabaseAs } from '@/lib/server/supabase';

/**
 * „Test-Zahlung“ (Mock-Anbieter) – nur solange kein echter Zahlungsanbieter eingerichtet ist.
 * Prüft mit dem Token der Kundin, dass die Zahlung ihr gehört und noch offen ist (RLS/DB-Funktion),
 * und bucht sie dann über denselben Weg wie ein Webhook.
 */
export async function POST(req: Request) {
  if (serverEnv.stripe()) return NextResponse.json({ error: 'test_payments_disabled' }, { status: 404 });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return new NextResponse(null, { status: 401 });
  let paymentId = '';
  try {
    paymentId = String(((await req.json()) as { paymentId?: unknown }).paymentId ?? '');
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const asUser = supabaseAs(originFromRequest(req), token);
  const { data: open, error } = await asUser.rpc('payment_for_checkout', { p_payment_id: paymentId });
  if (error) return new NextResponse(null, { status: 401 });
  // null = nicht ihre Zahlung, schon bezahlt oder Reservierung abgelaufen
  if (!open) return NextResponse.json({ error: 'not_open' }, { status: 409 });

  const outcome = await completeMockPayment(paymentId, (open as { amountCents: number }).amountCents);
  if (outcome !== 'paid') return NextResponse.json({ error: outcome }, { status: 409 });
  const { data: payments } = await asUser.rpc('my_payments');
  const payment = (payments as { id: string }[] | null)?.find((p) => p.id === paymentId);
  return NextResponse.json(payment ?? { id: paymentId, status: 'paid' }, { headers: { 'Cache-Control': 'no-store' } });
}
