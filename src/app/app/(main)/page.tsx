'use client';

import Link from 'next/link';
import { PageSkeleton } from '@/components/app/app-page';
import { serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { leftText, useNow } from '@/components/app/countdown';
import { LoadError } from '@/components/app/load-state';
import { useLoad } from '@/components/app/use-load';
import { IconBell, IconCalendar, IconChat, IconChevronRight, IconClock, IconHourglass, IconPhone, IconPin } from '@/components/icons';
import { LogoWide } from '@/components/logo';
import { useSession } from '@/lib/auth/use-session';
import { getData, type WaitlistOffer } from '@/lib/data';
import { daysBetween, formatDateLong, formatTime, nowWall, todayIso, wallToInstant } from '@/lib/format';
import { downloadIcs } from '@/lib/ics';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';
import { useUnread } from '@/lib/unread';

export default function StartPage() {
  const { t, lang } = useI18n();
  const session = useSession();
  const unread = useUnread();
  const now = useNow(1000);
  const id = session.status === 'in' ? session.session.customerId : null;
  const { state, reload } = useLoad(
    id
      ? async () => {
          const data = getData();
          const [profile, appts, services, offers] = await Promise.all([
            data.getProfile(id),
            data.listAppointments(id),
            data.listServices(),
            data.listOffers(),
          ]);
          return { profile, appts, services, offers };
        }
      : null,
    `start-${id}`,
  );

  if (state.status === 'error') {
    return (
      <main className={st.screen}>
        <header className={st.header}>
          <LogoWide />
        </header>
        <div className={st.content}>
          <LoadError onRetry={reload} />
        </div>
      </main>
    );
  }
  if (state.status !== 'ready') return <PageSkeleton />;
  const { profile, appts, services } = state.data;
  // abgelaufene Angebote sofort ausblenden (die DB schließt sie beim nächsten Lesen)
  const offers = state.data.offers.filter((o) => Date.parse(o.expiresAt) > now);
  const wallNow = nowWall();
  const next = appts.find((a) => a.start >= wallNow && (a.status === 'confirmed' || a.status === 'pending'));
  const hour = Number(wallNow.slice(11, 13));
  // Nachts (bis 5 Uhr) gilt noch „Guten Abend“
  const greet = hour >= 5 && hour < 11 ? t.home.morning : hour >= 5 && hour < 18 ? t.home.day : t.home.evening;

  let relative = '';
  if (next) {
    const d = daysBetween(todayIso(), next.start.slice(0, 10));
    relative = d === 0 ? t.home.today : d === 1 ? t.home.tomorrow : fmt(t.home.inDays, { n: d });
  }
  const nextName = next ? serviceLabel(next.serviceId, next.serviceName, services, lang) : '';

  return (
    <main className={st.screen}>
      <header className={st.header}>
        <LogoWide />
      </header>
      <div className={st.content}>
        <h1 className={st.greeting}>{fmt(greet, { name: profile?.firstName ?? '' })}</h1>

        {offers.map((o) => (
          <OfferBanner key={o.id} offer={o} now={now} name={serviceLabel(o.serviceId, o.serviceName, services, lang)} />
        ))}

        {(unread.chat > 0 || unread.news > 0) && (
          <div className="group">
            {unread.chat > 0 && (
              <Link className="row" href="/app/nachrichten">
                <span className="row-icon">
                  <IconChat />
                </span>
                <span className="row-main">
                  {unread.chat === 1 ? t.home4.unreadChat : fmt(t.home4.unreadChatMany, { n: unread.chat })}
                </span>
                <span className={st.dot} aria-hidden="true" />
                <IconChevronRight className="row-chevron" />
              </Link>
            )}
            {unread.news > 0 && (
              <Link className="row" href="/app/neuigkeiten">
                <span className="row-icon">
                  <IconBell />
                </span>
                <span className="row-main">
                  {unread.news === 1 ? t.home4.unreadNews : fmt(t.home4.unreadNewsMany, { n: unread.news })}
                </span>
                <span className={st.dot} aria-hidden="true" />
                <IconChevronRight className="row-chevron" />
              </Link>
            )}
          </div>
        )}

        <section className={st.section} aria-labelledby="next-title">
          <h2 id="next-title" className="section-title">
            {next ? t.home.next : t.home.none}
          </h2>
          {next ? (
            <div className={`card ${st.next}`}>
              <div className={st.nextWhen}>
                <p className="eyebrow">{relative}</p>
                <p className={st.nextDate}>{formatDateLong(next.start, lang)}</p>
                <p className={st.nextTime}>{formatTime(next.start, lang)}</p>
                <p className={st.countdown} role="timer" aria-live="off" data-testid="next-countdown">
                  {fmt(t.home4.startsIn, { t: leftText(wallToInstant(next.start) - now, t) })}
                </p>
              </div>
              <div className={st.nextService}>
                <p className={st.nextServiceName}>{nextName}</p>
                <p className="muted">
                  {fmt(t.home.with, { name: next.staffName })} · {t.common.minutes.replace('{n}', String(next.durationMinutes))}
                </p>
              </div>
              <div className={st.actionsRow}>
                <a className="btn btn-secondary" href={salon.mapsUrl} target="_blank" rel="noopener noreferrer">
                  <IconPin size={20} />
                  {t.home.route}
                </a>
                <button type="button" className="btn btn-secondary" onClick={() => downloadIcs(next, `${nextName} · ${salon.name}`)}>
                  <IconCalendar size={20} />
                  {t.home4.ics}
                </button>
              </div>
            </div>
          ) : (
            <div className={`card ${st.empty}`}>
              <p className="muted">{t.home.noneText}</p>
            </div>
          )}
        </section>

        <Link href="/app/buchen" className="btn btn-primary btn-lg btn-block">
          {next ? t.home.bookAnother : t.home.book}
        </Link>

        <div className="group">
          <Link className="row" href="/app/nachrichten">
            <span className="row-icon">
              <IconChat />
            </span>
            <span className="row-main">{t.home4.messages}</span>
            <IconChevronRight className="row-chevron" />
          </Link>
          <Link className="row" href="/app/warteliste">
            <span className="row-icon">
              <IconHourglass />
            </span>
            <span className="row-main">{t.home4.waitlist}</span>
            <IconChevronRight className="row-chevron" />
          </Link>
        </div>

        <section className={st.section} aria-labelledby="salon-title">
          <h2 id="salon-title" className="section-title">
            {t.home.salon}
          </h2>
          <div className="group">
            <a className="row" href={salon.mapsUrl} target="_blank" rel="noopener noreferrer">
              <span className="row-icon">
                <IconPin />
              </span>
              <span className="row-main">
                {salon.street}
                <span className="row-sub" style={{ display: 'block' }}>
                  {salon.postalCode} {salon.city}
                </span>
              </span>
            </a>
            <div className="row">
              <span className="row-icon">
                <IconClock />
              </span>
              <span className="row-main">{t.home.hours}</span>
            </div>
            <a className="row" href={`tel:${salon.phoneE164}`}>
              <span className="row-icon">
                <IconPhone />
              </span>
              <span className="row-main">{salon.phone}</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Offenes Wartelisten-Angebot ganz oben – mit laufender Antwortzeit */
function OfferBanner({ offer, now, name }: { offer: WaitlistOffer; now: number; name: string }) {
  const { t, lang } = useI18n();
  return (
    <Link href={`/app/angebot/${offer.id}`} className={`card ${st.offerBanner}`} data-testid="offer-banner">
      <span className="eyebrow">{t.home4.offerTitle}</span>
      <span className={st.offerBannerText}>
        {fmt(t.home4.offerText, { service: name, date: formatDateLong(offer.start, lang), time: formatTime(offer.start, lang) })}
      </span>
      <span className={st.countdown} role="timer" aria-live="off">
        {fmt(t.home4.offerLeft, { t: leftText(Date.parse(offer.expiresAt) - now, t) })}
      </span>
      <span className="btn btn-primary btn-block">{t.home4.offerCta}</span>
    </Link>
  );
}
