'use client';

/* eslint-disable @next/next/no-img-element -- vorab skalierte Kategoriefotos */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { useLoad } from '@/components/app/use-load';
import { IconCheck, IconChevronLeft, IconChevronRight, IconClock } from '@/components/icons';
import { useSession } from '@/lib/auth/use-session';
import { DataError, getData, type Category, type PaymentMethod, type Service, type Slot, type StaffMember } from '@/lib/data';
import {
  addDays,
  formatDateFull,
  formatDay,
  formatPrice,
  formatTime,
  formatWeekdayShort,
  todayIso,
  weekday,
} from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';

const DAYS_SHOWN = 21;

export default function BookPage() {
  const { t, lang } = useI18n();
  const session = useSession();
  const customerId = session.status === 'in' ? session.session.customerId : null;
  const { state } = useLoad(
    async () => {
      const data = getData();
      const [categories, services, staff] = await Promise.all([data.listCategories(), data.listServices(), data.listStaff()]);
      return { categories, services, staff };
    },
    'catalog',
  );

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<Category | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string | null | undefined>(undefined);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('in_salon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ start: string } | null>(null);

  if (state.status !== 'ready') return <PageSkeleton />;
  const { categories, services, staff } = state.data;
  const total = t.book.steps.length;

  const go = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  const confirm = async () => {
    if (!customerId || !service || !slot) return;
    setBusy(true);
    setError(null);
    try {
      const a = await getData().createAppointment({ customerId, serviceId: service.id, staffId: slot.staffId, start: slot.start, payment });
      setBooked({ start: a.start });
    } catch (e) {
      setError(t.errors[e instanceof DataError && e.code === 'slot_taken' ? 'slot_taken' : 'unknown']);
      if (e instanceof DataError && e.code === 'slot_taken') {
        setSlot(null);
        setStep(3);
      }
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <AppPage title={t.book.title}>
        <div className={st.done} role="status">
          <span className={st.doneIcon}>
            <IconCheck size={36} />
          </span>
          <h2 className={st.stepTitle}>{t.book.successTitle}</h2>
          <p className="muted">
            {fmt(t.book.successText, { date: formatDateFull(booked.start, lang), time: formatTime(booked.start, lang) })}
          </p>
          <Link href="/app/termine" className="btn btn-primary btn-lg btn-block">
            {t.book.toAppointments}
          </Link>
        </div>
      </AppPage>
    );
  }

  const staffName = (id: string) => staff.find((m) => m.id === id)?.displayName ?? '';

  return (
    <AppPage
      title={t.book.title}
      action={
        step > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)} style={{ paddingRight: 0 }}>
            <IconChevronLeft size={22} />
            {t.common.back}
          </button>
        ) : undefined
      }
    >
      <div className={st.progress}>
        <span className={st.progressText}>
          {fmt(t.book.stepOf, { n: step + 1, total })}
          <span className="visually-hidden"> · {t.book.steps[step]}</span>
        </span>
        <div className={st.progressBar} aria-hidden="true">
          <div className={st.progressFill} style={{ transform: `scaleX(${(step + 1) / total})` }} />
        </div>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className={st.stepPane} key="cat">
          <h2 className={st.stepTitle}>{t.book.chooseCategory}</h2>
          <div className={st.catGrid}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={st.cat}
                onClick={() => {
                  setCategory(c);
                  setService(null);
                  go(1);
                }}
              >
                {c.imageUrl && <img className={st.catImg} src={c.imageUrl} alt="" width={320} height={240} loading="lazy" />}
                <span className={st.catText}>
                  <span className={st.catName}>{t.categories[c.id]}</span>
                  <span className={st.catHint}>{t.book.categoryHints[c.id]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && category && (
        <div className={st.stepPane} key="svc">
          <h2 className={st.stepTitle}>{t.categories[category.id]}</h2>
          <div className="group">
            {services
              .filter((s) => s.categoryId === category.id)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="row"
                  onClick={() => {
                    setService(s);
                    setSlot(null);
                    go(2);
                  }}
                >
                  <span className="row-main">
                    {serviceLabel(s.id, s.name, services, lang)}
                    <span className="row-sub" style={{ display: 'block' }}>
                      {fmt(t.common.minutes, { n: s.durationMinutes })}
                    </span>
                  </span>
                  <span className={st.price}>{formatPrice(s.priceEur, lang)}</span>
                  <IconChevronRight className="row-chevron" />
                </button>
              ))}
          </div>
        </div>
      )}

      {step === 2 && service && (
        <StaffStep
          staff={staff.filter((m) => m.categories.includes(service.categoryId))}
          onPick={(id) => {
            setStaffId(id);
            setSlot(null);
            go(3);
          }}
        />
      )}

      {step === 3 && service && staffId !== undefined && (
        <SlotStep
          service={service}
          staffId={staffId}
          selected={slot}
          onPick={(s) => {
            setSlot(s);
            go(4);
          }}
        />
      )}

      {step === 4 && service && slot && (
        <div className={st.stepPane} key="confirm">
          <h2 className={st.stepTitle}>{t.book.summary}</h2>
          <dl className={`card ${st.summary}`} style={{ margin: 0 }}>
            <div className={st.summaryRow}>
              <dt>{t.book.service}</dt>
              <dd>{serviceLabel(service.id, service.name, services, lang)}</dd>
            </div>
            <div className={st.summaryRow}>
              <dt>{t.book.date}</dt>
              <dd>
                {formatDateFull(slot.start, lang)}, {formatTime(slot.start, lang)}
              </dd>
            </div>
            <div className={st.summaryRow}>
              <dt>{t.book.staff}</dt>
              <dd>{staffName(slot.staffId)}</dd>
            </div>
            <div className={st.summaryRow}>
              <dt>{t.book.duration}</dt>
              <dd>{fmt(t.common.minutes, { n: service.durationMinutes })}</dd>
            </div>
            <div className={st.summaryRow}>
              <dt>{t.book.price}</dt>
              <dd>{formatPrice(service.priceEur, lang)}</dd>
            </div>
          </dl>

          <fieldset className="group" style={{ margin: 0, padding: 0 }}>
            <legend className="section-title" style={{ padding: '0 0 8px', float: 'left', width: '100%' }}>
              {t.book.payment}
            </legend>
            {(['in_salon', 'online_demo'] as const).map((m) => (
              <label key={m} className={st.payOption} style={{ clear: 'both' }}>
                <input type="radio" name="payment" value={m} checked={payment === m} onChange={() => setPayment(m)} />
                <span>
                  <strong>{m === 'in_salon' ? t.book.payInSalon : t.book.payOnline}</strong>
                  <span className="row-sub" style={{ display: 'block' }}>
                    {m === 'in_salon' ? t.book.payInSalonHint : t.book.payOnlineHint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <button type="button" className={`btn btn-primary btn-lg btn-block ${st.stickyCta}`} onClick={confirm} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? t.book.booking : t.book.confirm}
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>
            {salon.name} · {salon.street}, {salon.postalCode} {salon.city}
          </p>
        </div>
      )}
    </AppPage>
  );
}

function StaffStep({ staff, onPick }: { staff: StaffMember[]; onPick: (id: string | null) => void }) {
  const { t } = useI18n();
  return (
    <div className={st.stepPane} key="staff">
      <h2 className={st.stepTitle}>{t.book.chooseStaff}</h2>
      <div className="group">
        <button type="button" className="row" onClick={() => onPick(null)}>
          <span className={st.avatar} aria-hidden="true">
            <IconClock />
          </span>
          <span className="row-main">
            {t.book.anyStaff}
            <span className="row-sub" style={{ display: 'block' }}>
              {t.book.anyStaffHint}
            </span>
          </span>
          <IconChevronRight className="row-chevron" />
        </button>
        {staff.map((m) => (
          <button key={m.id} type="button" className="row" onClick={() => onPick(m.id)}>
            <span className={st.avatar} aria-hidden="true">
              {m.displayName.charAt(0)}
            </span>
            <span className="row-main">{m.displayName}</span>
            <IconChevronRight className="row-chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SlotStep({
  service,
  staffId,
  selected,
  onPick,
}: {
  service: Service;
  staffId: string | null;
  selected: Slot | null;
  onPick: (s: Slot) => void;
}) {
  const { t, lang } = useI18n();
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(todayIso(), i)), []);
  const firstOpen = days.find((d) => salon.openDays.includes(weekday(d))) ?? days[0]!;
  const [day, setDay] = useState(selected?.start.slice(0, 10) ?? firstOpen);
  const { state } = useLoad(() => getData().listAvailableSlots({ serviceId: service.id, staffId, date: day }), `${service.id}|${staffId}|${day}`);
  const open = salon.openDays.includes(weekday(day));

  const groups =
    state.status === 'ready'
      ? [
          { title: t.book.morning, items: state.data.filter((s) => s.start.slice(11, 13) < '12') },
          { title: t.book.afternoon, items: state.data.filter((s) => s.start.slice(11, 13) >= '12') },
        ].filter((g) => g.items.length)
      : [];

  return (
    <div className={st.stepPane} key="slot">
      <h2 className={st.stepTitle}>{t.book.chooseSlot}</h2>
      <div className={st.days} role="group" aria-label={t.book.date}>
        {days.map((d) => {
          const isOpen = salon.openDays.includes(weekday(d));
          return (
            <button
              key={d}
              type="button"
              className={st.day}
              aria-pressed={d === day}
              disabled={!isOpen}
              aria-label={formatDateFull(`${d}T12:00`, lang)}
              onClick={() => setDay(d)}
            >
              <span className={st.dayName}>{formatWeekdayShort(d, lang).replace('.', '')}</span>
              <span className={st.dayNum}>{formatDay(d, lang).replace('.', '')}</span>
            </button>
          );
        })}
      </div>
      <p className="muted">{formatDateFull(`${day}T12:00`, lang)}</p>
      {!open ? (
        <p className="muted">{t.book.closed}</p>
      ) : state.status !== 'ready' ? (
        <div className="skeleton" style={{ height: 150 }} />
      ) : groups.length === 0 ? (
        <p className="muted">{t.book.noSlots}</p>
      ) : (
        groups.map((g) => (
          <div key={g.title} className={st.slotGroup}>
            <h3 className={st.slotGroupTitle}>{g.title}</h3>
            <div className={st.slots}>
              {g.items.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  className={st.slot}
                  aria-pressed={selected?.start === s.start}
                  onClick={() => onPick(s)}
                >
                  {formatTime(s.start, lang)}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
