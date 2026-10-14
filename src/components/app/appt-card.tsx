'use client';

import type { Appointment, Service } from '@/lib/data';
import { formatDateLong, formatDay, formatTime, wallToDate } from '@/lib/format';
import { intlLocale, type Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

/** Anzeigename einer Leistung in der aktuellen Sprache (Stammdaten-Name als Rückfall). */
export function serviceLabel(serviceId: string, fallback: string, services: Service[], lang: Lang): string {
  const s = services.find((x) => x.id === serviceId);
  return s?.nameI18n?.[lang] ?? s?.name ?? fallback;
}

export function ApptCard({ appt, services }: { appt: Appointment; services: Service[] }) {
  const { t, lang } = useI18n();
  const month = new Intl.DateTimeFormat(intlLocale[lang], { month: 'short', timeZone: 'UTC' }).format(wallToDate(appt.start));
  return (
    <article className={`card ${st.appt}`}>
      <div className={st.apptDate} aria-hidden="true">
        <span className={st.apptDay}>{formatDay(appt.start.slice(0, 10), lang)}</span>
        <span className={st.apptMonth}>{month.replace('.', '')}</span>
      </div>
      <div className={st.apptMain}>
        <h3 className={st.apptService}>{serviceLabel(appt.serviceId, appt.serviceName, services, lang)}</h3>
        <p className={st.apptMeta}>
          {formatDateLong(appt.start, lang)} · {formatTime(appt.start, lang)}
        </p>
        <p className={st.apptMeta}>
          {appt.staffName} · {t.common.minutes.replace('{n}', String(appt.durationMinutes))} ·{' '}
          {new Intl.NumberFormat(intlLocale[lang], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(appt.priceEur)}
        </p>
        <span className={st.status} data-status={appt.status}>
          {t.appointments.status[appt.status]}
        </span>
      </div>
    </article>
  );
}
