'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { BackLink } from '@/components/app/back-link';
import st from '@/components/app/app.module.css';
import { clock, useNow } from '@/components/app/countdown';
import { LoadError } from '@/components/app/load-state';
import { useLoad } from '@/components/app/use-load';
import { IconCheck, IconHourglass } from '@/components/icons';
import { DataError, getData, type OfferResult, type WaitlistOffer } from '@/lib/data';
import { formatDateFull, formatPrice, formatTime } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { refreshUnread } from '@/lib/unread';

/**
 * Wartelisten-Angebot (Deep-Link aus Push, SMS und E-Mail: /app/angebot/<id>).
 * Großer Countdown, „Ja, buchen“ / „Nein, danke“. Die Buchung passiert atomar in der DB –
 * bei gleichzeitigen Klicks auf mehreren Geräten zählt der erste.
 */
export default function OfferPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useLoad(
    () =>
      getData()
        .getOffer(id)
        .then((o): WaitlistOffer | null => o)
        .catch((e) => {
          if (e instanceof DataError && e.code === 'not_found') return null;
          throw e;
        }),
    `offer-${id}`,
  );
  if (state.status === 'error') {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <LoadError onRetry={reload} />
      </AppPage>
    );
  }
  if (state.status !== 'ready') return <PageSkeleton />;
  if (!state.data) {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <Outcome title={t.offer.closedTitle} text={t.offer.notFound} />
      </AppPage>
    );
  }
  return <Offer offer={state.data} />;
}

function Offer({ offer }: { offer: WaitlistOffer }) {
  const { t, lang } = useI18n();
  const now = useNow(250);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [result, setResult] = useState<OfferResult | 'closed' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = Date.parse(offer.expiresAt) - now;
  const total = Math.max(1, Date.parse(offer.expiresAt) - Date.parse(offer.offeredAt));

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    setError(null);
    try {
      setResult(await getData().respondOffer(offer.id, accept));
    } catch (e) {
      if (e instanceof DataError && (e.code === 'offer_closed' || e.code === 'not_found')) setResult('closed');
      else setError(e instanceof DataError && e.code === 'offline' ? t.state.offlineText : t.errors.unknown);
    } finally {
      setBusy(null);
      refreshUnread();
    }
  };

  const when = { date: formatDateFull(offer.start, lang), time: formatTime(offer.start, lang) };

  if (result === 'closed' || (!result && (offer.status === 'declined' || offer.status === 'withdrawn'))) {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <Outcome title={t.offer.closedTitle} text={t.offer.closed} />
      </AppPage>
    );
  }
  if ((result && result.result === 'booked') || (!result && offer.status === 'accepted')) {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <Outcome title={t.offer.bookedTitle} text={fmt(t.offer.booked, when)} success />
      </AppPage>
    );
  }
  if (result && result.result === 'declined') {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <Outcome title={t.offer.declinedTitle} text={t.offer.declined} />
      </AppPage>
    );
  }
  if ((result && result.result === 'expired') || offer.status === 'expired' || left <= 0) {
    return (
      <AppPage title={t.offer.title} action={<BackLink />}>
        <Outcome title={t.offer.expiredTitle} text={t.offer.expired} />
      </AppPage>
    );
  }

  return (
    <AppPage title={t.offer.title} action={<BackLink />}>
      <p className="muted">{t.offer.lead}</p>
      <div className={`card ${st.offerTimer}`}>
        <p className="eyebrow" id="offer-left">
          {t.offer.left}
        </p>
        <p className={st.offerClock} role="timer" aria-labelledby="offer-left" data-testid="offer-clock">
          {clock(left)}
        </p>
        <div className={st.progressBar} aria-hidden="true">
          <div className={st.progressFill} style={{ transform: `scaleX(${Math.max(0, left / total)})` }} />
        </div>
      </div>
      <dl className={`card ${st.summary}`} style={{ margin: 0 }}>
        <div className={st.summaryRow}>
          <dt>{t.book.service}</dt>
          <dd>{offer.serviceName}</dd>
        </div>
        <div className={st.summaryRow}>
          <dt>{t.book.date}</dt>
          <dd>
            {when.date}, {when.time}
          </dd>
        </div>
        <div className={st.summaryRow}>
          <dt>{t.book.staff}</dt>
          <dd>{offer.staffName}</dd>
        </div>
        <div className={st.summaryRow}>
          <dt>{t.book.duration}</dt>
          <dd>{fmt(t.common.minutes, { n: offer.durationMinutes })}</dd>
        </div>
        <div className={st.summaryRow}>
          <dt>{t.book.price}</dt>
          <dd>{formatPrice(offer.priceEur, lang)}</dd>
        </div>
      </dl>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className={st.offerActions}>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => respond(true)} disabled={!!busy}>
          {busy === 'yes' && <span className="spinner" aria-hidden="true" />}
          {t.offer.accept}
        </button>
        <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => respond(false)} disabled={!!busy}>
          {busy === 'no' && <span className="spinner" aria-hidden="true" />}
          {t.offer.decline}
        </button>
      </div>
    </AppPage>
  );
}

function Outcome({ title, text, success }: { title: string; text: string; success?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={st.done} role="status">
      <span className={st.doneIcon} data-tone={success ? 'success' : 'neutral'}>
        {success ? <IconCheck size={36} /> : <IconHourglass size={34} />}
      </span>
      <h2 className={st.stepTitle}>{title}</h2>
      <p className="muted">{text}</p>
      {success ? (
        <Link href="/app/termine" className="btn btn-primary btn-lg btn-block">
          {t.offer.toAppointments}
        </Link>
      ) : (
        <Link href="/app" className="btn btn-primary btn-lg btn-block">
          {t.offer.toStart}
        </Link>
      )}
    </div>
  );
}
