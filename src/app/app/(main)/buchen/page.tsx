'use client';

/* eslint-disable @next/next/no-img-element -- vorab skalierte Kategoriefotos */
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { LoadError } from '@/components/app/load-state';
import { PaymentPanel } from '@/components/app/payment-panel';
import { SlotStep } from '@/components/app/slot-step';
import { useLoad } from '@/components/app/use-load';
import { IconCheck, IconChevronLeft, IconChevronRight, IconClock } from '@/components/icons';
import { useSession } from '@/lib/auth/use-session';
import { DataError, getData, type BookingResult, type Category, type Service, type Slot, type StaffMember } from '@/lib/data';
import { formatDateFull, formatPrice, formatTime, instantToWall } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';

export default function BookPage() {
  // useSearchParams braucht eine Suspense-Grenze (die Seite bleibt statisch)
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Book />
    </Suspense>
  );
}

function Book() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { state, reload } = useLoad(
    async () => {
      const data = getData();
      const [categories, services, staff] = await Promise.all([data.listCategories(), data.listServices(), data.listStaff()]);
      return { categories, services, staff };
    },
    'catalog',
  );

  if (state.status === 'error') {
    return (
      <AppPage title={t.book.title}>
        <LoadError onRetry={reload} />
      </AppPage>
    );
  }
  if (state.status !== 'ready') return <PageSkeleton />;
  return <Flow catalog={state.data} preService={params.get('service')} preStaff={params.get('staff')} />;
}

interface Catalog {
  categories: Category[];
  services: Service[];
  staff: StaffMember[];
}

function Flow({ catalog, preService, preStaff }: { catalog: Catalog; preService: string | null; preStaff: string | null }) {
  const { t, lang } = useI18n();
  const session = useSession();
  const signedIn = session.status === 'in';
  const { categories, services, staff } = catalog;
  // „Erneut buchen“: Leistung und Mitarbeiterin aus dem Link vorauswählen, direkt zur Terminwahl
  const pre = services.find((x) => x.id === preService) ?? null;
  const [step, setStep] = useState(pre ? 3 : 0);
  const [category, setCategory] = useState<Category | null>(pre ? (categories.find((c) => c.id === pre.categoryId) ?? null) : null);
  const [service, setService] = useState<Service | null>(pre);
  const [staffId, setStaffId] = useState<string | null | undefined>(
    pre ? (preStaff && staff.some((m) => m.id === preStaff) ? preStaff : null) : undefined,
  );
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [paid, setPaid] = useState(false);
  const quote = useLoad(service ? () => getData().getPaymentQuote(service.id) : null, `quote-${service?.id}`);

  const total = t.book.steps.length;

  const go = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  const confirm = async () => {
    if (!signedIn || !service || !slot) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await getData().bookWithPayment({ serviceId: service.id, staffId: slot.staffId, start: slot.start }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      const code = e instanceof DataError ? e.code : 'unknown';
      setError(code === 'slot_taken' ? t.errors.slot_taken : code === 'offline' ? t.state.offlineText : t.errors.unknown);
      if (code === 'slot_taken') {
        setSlot(null);
        setStep(3);
      }
    } finally {
      setBusy(false);
    }
  };

  // Zahlung fällig: Termin ist reserviert, bis bezahlt oder die Haltezeit abläuft
  if (result && result.payment && !paid) {
    const a = result.appointment;
    return (
      <AppPage title={t.pay.title}>
        <div className={st.stepPane}>
          <p className="muted">
            {serviceLabel(a.serviceId, a.serviceName, services, lang)} · {formatDateFull(a.start, lang)}, {formatTime(a.start, lang)}
          </p>
          <PaymentPanel payment={result.payment} holdExpiresAt={a.holdExpiresAt ?? null} onPaid={() => setPaid(true)} />
          <Link href="/app/termine" className="btn btn-ghost btn-block">
            {t.pay.later}
          </Link>
          {a.holdExpiresAt && (
            <p className="hint" style={{ textAlign: 'center' }}>
              {fmt(t.pay.laterHint, {
                time: formatTime(instantToWall(Date.parse(a.holdExpiresAt)), lang),
              })}
            </p>
          )}
        </div>
      </AppPage>
    );
  }

  if (result) {
    const booked = result.appointment;
    return (
      <AppPage title={t.book.title}>
        <div className={st.done} role="status">
          <span className={st.doneIcon}>
            <IconCheck size={36} />
          </span>
          <h2 className={st.stepTitle}>{t.book.successTitle}</h2>
          {paid && <p className="alert alert-success">{t.pay.paidTitle}</p>}
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

          <section aria-labelledby="pay-title" className={st.section}>
            <h3 id="pay-title" className="section-title">
              {t.book.payment}
            </h3>
            {quote.state.status === 'ready' ? (
              <div className={`card ${st.payInfo}`} data-testid="payment-rule">
                {quote.state.data.dueOnlineCents > 0 ? (
                  <>
                    <strong>
                      {fmt(quote.state.data.mode === 'full' ? t.pay.full : t.pay.deposit, {
                        amount: formatPrice(quote.state.data.dueOnlineCents / 100, lang),
                      })}
                    </strong>
                    {quote.state.data.mode !== 'full' && (
                      <span className="hint">
                        {fmt(t.pay.depositHint, {
                          rest: formatPrice((quote.state.data.totalCents - quote.state.data.dueOnlineCents) / 100, lang),
                        })}
                      </span>
                    )}
                    <span className="hint">{fmt(t.pay.holdHint, { min: quote.state.data.holdMinutes })}</span>
                  </>
                ) : (
                  <>
                    <strong>{t.pay.onSite}</strong>
                    <span className="hint">{t.pay.onSiteHint}</span>
                  </>
                )}
              </div>
            ) : quote.state.status === 'error' ? (
              <LoadError onRetry={quote.reload} />
            ) : (
              <div className="skeleton" style={{ height: 72 }} />
            )}
          </section>

          <button
            type="button"
            className={`btn btn-primary btn-lg btn-block ${st.stickyCta}`}
            onClick={confirm}
            disabled={busy || quote.state.status !== 'ready'}
          >
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
