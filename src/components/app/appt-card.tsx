'use client';

import type { Appointment, Payment, Service } from '@/lib/data';
import { formatDateLong, formatDay, formatPrice, formatTime, wallToDate } from '@/lib/format';
import { intlLocale, type Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

/** Anzeigename einer Leistung in der aktuellen Sprache (Stammdaten-Name als Rückfall). */
export function serviceLabel(serviceId: string, fallback: string, services: Service[], lang: Lang): string {
  const s = services.find((x) => x.id === serviceId);
  return s?.nameI18n?.[lang] ?? s?.name ?? fallback;
}

export function ApptCard({
  appt,
  services,
  payment,
  children,
}: {
  appt: Appointment;
  services: Service[];
  /** Teil 4: Zahlungsstatus des Termins (undefined = nicht anzeigen) */
  payment?: Payment | null;
  children?: React.ReactNode;
}) {
  const { t, lang } = useI18n();
  const month = new Intl.DateTimeFormat(intlLocale[lang], { month: 'short', timeZone: 'UTC' }).format(wallToDate(appt.start));
  const payLabel =
    payment === undefined
      ? null
      : !payment
        ? // „Zahlung im Salon“ ergibt bei abgesagten Terminen keinen Sinn
          appt.status === 'cancelled' || appt.status === 'no_show'
          ? null
          : t.appt.pay.none
        : payment.status === 'paid' && payment.kind === 'deposit'
          ? t.appt.pay.paidDeposit
          : t.appt.pay[payment.status];
  return (
    <article className={`card ${st.appt}`}>
      <div className={st.apptDate} aria-hidden="true">
        <span className={st.apptDay}>{formatDay(appt.start.slice(0, 10), lang)}</span>
        <span className={st.apptMonth}>{month.replace('.', '')}</span>
      </div>
      <div className={st.apptMain}>
        <h2 className={st.apptService}>{serviceLabel(appt.serviceId, appt.serviceName, services, lang)}</h2>
        <p className={st.apptMeta}>
          {formatDateLong(appt.start, lang)} · {formatTime(appt.start, lang)}
        </p>
        <p className={st.apptMeta}>
          {appt.staffName} · {t.common.minutes.replace('{n}', String(appt.durationMinutes))} ·{' '}
          {formatPrice(appt.priceEur, lang)}
        </p>
        <div className={st.chips}>
          <span className={st.status} data-status={appt.status}>
            {t.appointments.status[appt.status]}
          </span>
          {payLabel && (
            <span className={st.status} data-pay={payment?.status ?? 'none'} data-testid="pay-status">
              {payLabel}
              {payment && payment.status !== 'cancelled' && payment.status !== 'expired' && ` · ${formatPrice(payment.amountCents / 100, lang)}`}
            </span>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}
