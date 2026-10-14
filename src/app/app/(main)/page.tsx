'use client';

import Link from 'next/link';
import { PageSkeleton } from '@/components/app/app-page';
import { serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { useLoad } from '@/components/app/use-load';
import { IconClock, IconPhone, IconPin } from '@/components/icons';
import { LogoWide } from '@/components/logo';
import { useSession } from '@/lib/auth/use-session';
import { getData } from '@/lib/data';
import { daysBetween, formatDateLong, formatTime, nowWall, todayIso } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';

export default function StartPage() {
  const { t, lang } = useI18n();
  const session = useSession();
  const id = session.status === 'in' ? session.session.customerId : null;
  const { state } = useLoad(
    id
      ? async () => {
          const data = getData();
          const [profile, appts, services] = await Promise.all([data.getProfile(id), data.listAppointments(id), data.listServices()]);
          return { profile, appts, services };
        }
      : null,
    `start-${id}`,
  );

  if (state.status !== 'ready') return <PageSkeleton />;
  const { profile, appts, services } = state.data;
  const now = nowWall();
  const next = appts.find((a) => a.start >= now && (a.status === 'confirmed' || a.status === 'pending'));
  const hour = Number(now.slice(11, 13));
  const greet = hour < 11 ? t.home.morning : hour < 18 ? t.home.day : t.home.evening;

  let relative = '';
  if (next) {
    const d = daysBetween(todayIso(), next.start.slice(0, 10));
    relative = d === 0 ? t.home.today : d === 1 ? t.home.tomorrow : fmt(t.home.inDays, { n: d });
  }

  return (
    <div className={st.screen}>
      <header className={st.header}>
        <LogoWide width={132} />
      </header>
      <div className={st.content}>
        <h1 className={st.greeting}>{fmt(greet, { name: profile?.firstName ?? '' })}</h1>

        <section className={st.section} aria-labelledby="next-title">
          <h2 id="next-title" className="section-title">
            {next ? t.home.next : t.home.none}
          </h2>
          {next ? (
            <div className={`card ${st.next}`}>
              <div className={st.nextWhen}>
                <span className={st.nextBadge}>{relative}</span>
                <p className={st.nextDate}>{formatDateLong(next.start, lang)}</p>
                <p className={st.nextTime}>{formatTime(next.start, lang)}</p>
              </div>
              <div className={st.nextService}>
                <p className={st.nextServiceName}>{serviceLabel(next.serviceId, next.serviceName, services, lang)}</p>
                <p className="muted">
                  {fmt(t.home.with, { name: next.staffName })} · {t.common.minutes.replace('{n}', String(next.durationMinutes))}
                </p>
              </div>
              <div className={st.actionsRow}>
                <a className="btn btn-secondary" href={salon.mapsUrl} target="_blank" rel="noopener noreferrer">
                  <IconPin size={20} />
                  {t.home.route}
                </a>
                <a className="btn btn-secondary" href={`tel:${salon.phoneE164}`}>
                  <IconPhone size={20} />
                  {t.home.call}
                </a>
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

        <section className={st.section} aria-labelledby="salon-title">
          <h2 id="salon-title" className="section-title">
            {t.home.salon}
          </h2>
          <div className="group">
            <a className="row" href={salon.mapsUrl} target="_blank" rel="noopener noreferrer">
              <IconPin size={22} className="muted" />
              <span className="row-main">
                {salon.street}
                <span className="row-sub" style={{ display: 'block' }}>
                  {salon.postalCode} {salon.city}
                </span>
              </span>
            </a>
            <div className="row">
              <IconClock size={22} className="muted" />
              <span className="row-main">{t.home.hours}</span>
            </div>
            <a className="row" href={`tel:${salon.phoneE164}`}>
              <IconPhone size={22} className="muted" />
              <span className="row-main">{salon.phone}</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
