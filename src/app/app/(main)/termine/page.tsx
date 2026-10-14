'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { ApptCard, serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { useNow } from '@/components/app/countdown';
import { LoadError } from '@/components/app/load-state';
import { PaymentPanel } from '@/components/app/payment-panel';
import { SlotStep } from '@/components/app/slot-step';
import { useLoad } from '@/components/app/use-load';
import { IconPhone } from '@/components/icons';
import { useSession } from '@/lib/auth/use-session';
import { DataError, getData, type Appointment, type Payment, type Service } from '@/lib/data';
import { formatDateFull, formatPrice, formatTime, instantToWall, nowWall, wallToInstant } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';
import { refreshUnread } from '@/lib/unread';

export default function AppointmentsPage() {
  const { t } = useI18n();
  const session = useSession();
  const id = session.status === 'in' ? session.session.customerId : null;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [notice, setNotice] = useState<string | null>(null);
  const { state, reload } = useLoad(
    id
      ? async () => {
          const data = getData();
          const [appts, services, payments] = await Promise.all([data.listAppointments(id), data.listServices(), data.listPayments()]);
          return { appts, services, payments };
        }
      : null,
    `appts-${id}`,
  );

  if (state.status === 'error') {
    return (
      <AppPage title={t.appointments.title}>
        <LoadError onRetry={reload} />
      </AppPage>
    );
  }
  if (state.status !== 'ready') return <PageSkeleton />;
  const { appts, services, payments } = state.data;
  const now = nowWall();
  const upcoming = appts.filter((a) => a.start >= now && a.status !== 'completed');
  const past = appts.filter((a) => !(a.start >= now && a.status !== 'completed')).reverse();
  const list = tab === 'upcoming' ? upcoming : past;
  const paymentOf = (a: Appointment) => payments.find((p) => p.appointmentId === a.id) ?? null;

  const changed = (text: string) => {
    setNotice(text);
    reload();
    refreshUnread();
  };

  return (
    <AppPage title={t.appointments.title}>
      <div className="segmented" role="tablist" aria-label={t.appointments.title}>
        <button type="button" role="tab" aria-selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
          {t.appointments.upcoming} ({upcoming.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'past'} onClick={() => setTab('past')}>
          {t.appointments.past} ({past.length})
        </button>
      </div>
      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}
      <div className={st.apptList} role="tabpanel" key={tab}>
        {list.length === 0 ? (
          <div className={`card ${st.empty}`}>
            <p className="muted">{tab === 'upcoming' ? t.appointments.emptyUpcoming : t.appointments.emptyPast}</p>
            {tab === 'upcoming' && (
              <Link href="/app/buchen" className="btn btn-primary">
                {t.home.book}
              </Link>
            )}
          </div>
        ) : (
          list.map((a) => (
            <ApptCard key={a.id} appt={a} services={services} payment={paymentOf(a)}>
              {tab === 'upcoming' ? (
                <UpcomingActions appt={a} payment={paymentOf(a)} services={services} onChanged={changed} />
              ) : (
                <Link
                  href={`/app/buchen?service=${encodeURIComponent(a.serviceId)}&staff=${encodeURIComponent(a.staffId)}`}
                  className="btn btn-secondary"
                >
                  {t.appt.rebook}
                </Link>
              )}
            </ApptCard>
          ))
        )}
      </div>
      {tab === 'upcoming' && upcoming.length > 0 && (
        <a className="row card" href={`tel:${salon.phoneE164}`}>
          <span className="row-icon">
            <IconPhone />
          </span>
          <span className="row-main">{salon.phone}</span>
        </a>
      )}
    </AppPage>
  );
}

/** Absagen/Verschieben mit Fristanzeige; offene Zahlung direkt bezahlen. Die DB prüft die Frist verbindlich. */
function UpcomingActions({
  appt,
  payment,
  services,
  onChanged,
}: {
  appt: Appointment;
  payment: Payment | null;
  services: Service[];
  onChanged: (text: string) => void;
}) {
  const { t, lang } = useI18n();
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const moveDialog = useRef<HTMLDialogElement>(null);
  const [paying, setPaying] = useState(false);
  const [moving, setMoving] = useState(false);
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (appt.status === 'cancelled' || appt.status === 'no_show') return null;

  const deadline = wallToInstant(appt.start) - salon.changeNoticeHours * 3_600_000;
  const changeable = now < deadline;
  const deadlineWall = instantToWall(deadline);
  const name = serviceLabel(appt.serviceId, appt.serviceName, services, lang);
  const service = services.find((s) => s.id === appt.serviceId);
  const openPayment = payment?.status === 'requires_payment' && appt.holdKind === 'payment' ? payment : null;

  const fail = (e: unknown) => {
    const code = e instanceof DataError ? e.code : 'unknown';
    setError(code === 'too_late' ? fmt(t.appt.tooLate, { hours: salon.changeNoticeHours }) : code === 'slot_taken' ? t.errors.slot_taken : t.errors.unknown);
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await getData().cancelAppointment(appt.id);
      cancelDialog.current?.close();
      onChanged(r.refundCents > 0 ? `${t.appt.cancelled} ${fmt(t.appt.refunded, { amount: formatPrice(r.refundCents / 100, lang) })}` : t.appt.cancelled);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const move = async (start: string) => {
    setBusy(true);
    setError(null);
    try {
      const a = await getData().rescheduleAppointment(appt.id, start);
      moveDialog.current?.close();
      onChanged(fmt(t.appt.rescheduled, { date: formatDateFull(a.start, lang), time: formatTime(a.start, lang) }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={st.apptActions}>
      {openPayment &&
        (paying ? (
          <PaymentPanel payment={openPayment} holdExpiresAt={appt.holdExpiresAt ?? null} onPaid={() => onChanged(t.pay.paidTitle)} />
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setPaying(true)}>
            {t.appt.payNow} · {formatPrice(openPayment.amountCents / 100, lang)}
          </button>
        ))}
      <p className="hint">
        {changeable
          ? fmt(t.appt.freeUntil, { date: formatDateFull(deadlineWall, lang), time: formatTime(deadlineWall, lang) })
          : fmt(t.appt.tooLate, { hours: salon.changeNoticeHours })}
      </p>
      {changeable && (
        <div className={st.actionsRow}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMoving(true);
              moveDialog.current?.showModal();
            }}
          >
            {t.appt.reschedule}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => cancelDialog.current?.showModal()}>
            {t.appt.cancel}
          </button>
        </div>
      )}

      <dialog
        ref={cancelDialog}
        className="sheet"
        aria-labelledby={`cancel-${appt.id}`}
        onClick={(e) => e.target === cancelDialog.current && cancelDialog.current?.close()}
      >
        <div className="sheet-grip" />
        <div className={st.form}>
          <h2 id={`cancel-${appt.id}`} className={st.stepTitle}>
            {t.appt.cancelTitle}
          </h2>
          <p className="muted">
            {fmt(t.appt.cancelText, { service: name, date: formatDateFull(appt.start, lang), time: formatTime(appt.start, lang) })}
          </p>
          {payment?.status === 'paid' && (
            <p className="alert alert-info">{fmt(t.appt.cancelRefund, { amount: formatPrice(payment.amountCents / 100, lang) })}</p>
          )}
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn btn-danger btn-lg btn-block" onClick={cancel} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t.appt.cancelConfirm}
          </button>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => cancelDialog.current?.close()}>
            {t.appt.keep}
          </button>
        </div>
      </dialog>

      <dialog
        ref={moveDialog}
        className={`sheet ${st.sheetTall}`}
        aria-labelledby={`move-${appt.id}`}
        onClose={() => setMoving(false)}
        onClick={(e) => e.target === moveDialog.current && moveDialog.current?.close()}
      >
        <div className="sheet-grip" />
        <div className={st.form}>
          <h2 id={`move-${appt.id}`} className={st.stepTitle}>
            {t.appt.rescheduleTitle}
          </h2>
          <p className="muted">
            {fmt(t.appt.rescheduleFor, { service: name, date: formatDateFull(appt.start, lang), time: formatTime(appt.start, lang) })}
          </p>
          {error && (
            <p className="alert alert-error" role="alert">
              {error}
            </p>
          )}
          {service && moving && <MoveSlots service={service} staffId={appt.staffId} busy={busy} onPick={move} />}
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => moveDialog.current?.close()}>
            {t.common.cancel}
          </button>
        </div>
      </dialog>
    </div>
  );
}

/** Freie Zeiten bei derselben Mitarbeiterin (Verschieben ändert nur die Zeit) */
function MoveSlots({ service, staffId, busy, onPick }: { service: Service; staffId: string; busy: boolean; onPick: (start: string) => void }) {
  return (
    <div aria-busy={busy}>
      <SlotStep service={service} staffId={staffId} selected={null} waitlist={false} onPick={(s) => !busy && onPick(s.start)} />
    </div>
  );
}
