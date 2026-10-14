'use client';

import { useState } from 'react';
import { IconCard } from '@/components/icons';
import { DataError, getData, type Payment } from '@/lib/data';
import { formatPrice } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';
import { leftText, useNow } from './countdown';

/**
 * Bezahlschritt für eine reservierte Buchung. Solange kein Zahlungsanbieter verbunden ist, läuft die
 * „Test-Zahlung“ (Mock-Anbieter) – gleicher Weg wie später der Stripe-Webhook, es werden keine Kartendaten erfasst.
 * Mit NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY geht es stattdessen zu Stripe Checkout (Zahlungsseite von Stripe, kein Script hier).
 */
const stripeEnabled = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export function PaymentPanel({
  payment,
  holdExpiresAt,
  onPaid,
}: {
  payment: Payment;
  holdExpiresAt: string | null;
  onPaid: (p: Payment) => void;
}) {
  const { t, lang } = useI18n();
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = holdExpiresAt ? Date.parse(holdExpiresAt) - now : 1;
  const expired = left <= 0;
  const amount = formatPrice(payment.amountCents / 100, lang);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      if (stripeEnabled) {
        window.location.assign(await getData().startCheckout(payment.id));
        return;
      }
      onPaid(await getData().completeTestPayment(payment.id));
    } catch (e) {
      setError(e instanceof DataError && e.code === 'too_late' ? t.pay.expired : t.errors.unknown);
      setBusy(false);
    }
  };

  return (
    <div className={`card ${st.payPanel}`} data-testid="payment-panel">
      <div className={st.payHead}>
        <span className="row-icon" aria-hidden="true">
          <IconCard />
        </span>
        <div>
          <p className={st.payTitle}>{stripeEnabled ? t.pay.title : t.pay.testTitle}</p>
          {!stripeEnabled && <p className="hint">{t.pay.testText}</p>}
        </div>
      </div>
      {holdExpiresAt && (
        <p className={st.holdLeft} role="timer" aria-live="off">
          {expired ? t.pay.expired : fmt(t.appt.holdLeft, { t: leftText(left, t) })}
        </p>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={pay} disabled={busy || expired}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {busy ? t.pay.paying : stripeEnabled ? `${t.appt.payNow} · ${amount}` : fmt(t.pay.testPay, { amount })}
      </button>
    </div>
  );
}
