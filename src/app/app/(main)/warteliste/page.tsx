'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { serviceLabel } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { LoadError } from '@/components/app/load-state';
import { useLoad } from '@/components/app/use-load';
import { IconTrash } from '@/components/icons';
import { DataError, getData, type CategoryId, type Service, type StaffMember, type WaitlistEntry } from '@/lib/data';
import { addDays, formatDateLong, formatDateShort, instantToWall, todayIso } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';

export default function WaitlistPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Waitlist />
    </Suspense>
  );
}

function Waitlist() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(!!params.get('service'));
  const { state, reload } = useLoad(async () => {
    const data = getData();
    const [entries, services, staff] = await Promise.all([data.listWaitlist(), data.listServices(), data.listStaff()]);
    return { entries, services, staff };
  }, 'waitlist');

  if (state.status === 'error') {
    return (
      <AppPage title={t.waitlist.title}>
        <LoadError onRetry={reload} />
      </AppPage>
    );
  }
  if (state.status !== 'ready') return <PageSkeleton />;
  const { entries, services, staff } = state.data;

  const remove = async (id: string) => {
    await getData().leaveWaitlist(id);
    setNotice(t.waitlist.removed);
    reload();
  };

  return (
    <AppPage title={t.waitlist.title}>
      <p className="muted">{t.waitlist.lead}</p>
      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}
      {adding ? (
        <EntryForm
          services={services}
          staff={staff}
          preService={params.get('service')}
          preStaff={params.get('staff')}
          preDate={params.get('date')}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setNotice(t.waitlist.saved);
            reload();
          }}
        />
      ) : (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => (setNotice(null), setAdding(true))}>
          {t.waitlist.add}
        </button>
      )}
      {entries.length === 0 ? (
        !adding && (
          <div className={`card ${st.empty}`}>
            <p className="muted">{t.waitlist.empty}</p>
          </div>
        )
      ) : (
        <div className={st.apptList}>
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} services={services} onRemove={() => remove(e.id)} />
          ))}
        </div>
      )}
    </AppPage>
  );
}

function EntryCard({ entry, services, onRemove }: { entry: WaitlistEntry; services: Service[]; onRemove: () => void }) {
  const { t, lang } = useI18n();
  const names = entry.serviceIds.map((id, i) => serviceLabel(id, entry.serviceNames[i] ?? '', services, lang)).join(', ');
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => entry.weekdays.includes(d)).map((d) => t.waitlist.weekdayNames[d]);
  return (
    <article className={`card ${st.appt}`} data-testid="waitlist-entry">
      <div className={st.apptMain} style={{ gridColumn: '1 / -1' }}>
        <h2 className={st.apptService}>{names}</h2>
        <p className={st.apptMeta}>
          {fmt(t.waitlist.days, { from: formatDateShort(`${entry.dateFrom}T12:00`, lang), to: formatDateShort(`${entry.dateTo}T12:00`, lang) })} ·{' '}
          {days.join(', ')}
        </p>
        <p className={st.apptMeta}>
          {fmt(t.waitlist.time, { from: entry.timeFrom, to: entry.timeTo })} · {entry.staffName ?? t.waitlist.anyStaff}
          {entry.shortNotice && ` · ${t.waitlist.shortNotice}`}
        </p>
        <p className="hint">{fmt(t.waitlist.since, { date: formatDateLong(instantToWall(Date.parse(entry.createdAt)), lang) })}</p>
        <button type="button" className="btn btn-ghost" onClick={onRemove} style={{ justifySelf: 'start', paddingLeft: 0 }}>
          <IconTrash size={20} />
          {t.waitlist.remove}
        </button>
      </div>
    </article>
  );
}

function EntryForm({
  services,
  staff,
  preService,
  preStaff,
  preDate,
  onCancel,
  onSaved,
}: {
  services: Service[];
  staff: StaffMember[];
  preService: string | null;
  preStaff: string | null;
  preDate: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const today = todayIso();
  const initial = services.find((s) => s.id === preService);
  const [category, setCategory] = useState<CategoryId>(initial?.categoryId ?? 'nails');
  const [picked, setPicked] = useState<string[]>(initial ? [initial.id] : []);
  const [staffId, setStaffId] = useState<string>(preStaff ?? '');
  const from = preDate && preDate >= today ? preDate : today;
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(addDays(from, 21));
  const [weekdays, setWeekdays] = useState<number[]>([...salon.openDays]);
  const [timeFrom, setTimeFrom] = useState(`${String(salon.openHour).padStart(2, '0')}:00`);
  const [timeTo, setTimeTo] = useState(`${String(salon.closeHour).padStart(2, '0')}:00`);
  const [shortNotice, setShortNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const inCategory = services.filter((s) => s.categoryId === category);
  const team = staff.filter((m) => m.categories.includes(category));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked.length) return setError(t.waitlist.chooseService);
    if (!weekdays.length) return setError(t.waitlist.chooseDay);
    if (dateTo < dateFrom || dateFrom < today || timeTo <= timeFrom) return setError(t.waitlist.invalidRange);
    setBusy(true);
    setError(null);
    try {
      await getData().joinWaitlist({
        serviceIds: picked,
        staffId: staffId || null,
        dateFrom,
        dateTo,
        weekdays,
        timeFrom,
        timeTo,
        shortNotice,
      });
      onSaved();
    } catch (err) {
      const code = err instanceof DataError ? err.code : 'unknown';
      setError(code === 'rate_limited' ? t.waitlist.limit : code === 'invalid' ? t.waitlist.invalidRange : t.errors.unknown);
      setBusy(false);
    }
  };

  return (
    <form className={`card ${st.form}`} style={{ padding: 16 }} onSubmit={save} noValidate aria-labelledby="wl-title">
      <h2 id="wl-title" className={st.stepTitle}>
        {t.waitlist.addTitle}
      </h2>

      <fieldset className={st.fieldset}>
        <legend className="label">{t.waitlist.category}</legend>
        <div className={st.chipRow}>
          {(['nails', 'pedicure', 'cosmetics', 'laser'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={st.chipToggle}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setPicked([]);
                setStaffId('');
              }}
            >
              {t.categories[c]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={st.fieldset}>
        <legend className="label">{t.waitlist.services}</legend>
        <div className="group">
          {inCategory.map((s) => (
            <label key={s.id} className="row">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => setPicked(toggle(picked, s.id))} />
              <span className="row-main">{serviceLabel(s.id, s.name, services, lang)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="wl-staff">
          {t.waitlist.staff}
        </label>
        <select id="wl-staff" className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">{t.waitlist.anyStaff}</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className={st.twoCols}>
        <div className="field">
          <label className="label" htmlFor="wl-from">
            {t.waitlist.from}
          </label>
          <input id="wl-from" className="input" type="date" min={today} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="wl-to">
            {t.waitlist.to}
          </label>
          <input id="wl-to" className="input" type="date" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <fieldset className={st.fieldset}>
        <legend className="label">{t.waitlist.weekdays}</legend>
        <div className={st.chipRow}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              className={st.chipToggle}
              aria-pressed={weekdays.includes(d)}
              disabled={!salon.openDays.includes(d)}
              onClick={() => setWeekdays(toggle(weekdays, d))}
            >
              {t.waitlist.weekdayNames[d]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={st.twoCols}>
        <div className="field">
          <label className="label" htmlFor="wl-tfrom">
            {t.waitlist.timeFrom}
          </label>
          <input id="wl-tfrom" className="input" type="time" step={1800} value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="wl-tto">
            {t.waitlist.timeTo}
          </label>
          <input id="wl-tto" className="input" type="time" step={1800} value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
        </div>
      </div>

      <label className="row card">
        <span className="row-main">
          {t.waitlist.shortNotice}
          <span className="row-sub" style={{ display: 'block' }}>
            {t.waitlist.shortNoticeHint}
          </span>
        </span>
        <input type="checkbox" role="switch" className="switch" checked={shortNotice} onChange={(e) => setShortNotice(e.target.checked)} />
      </label>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className={st.actionsRow}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {t.waitlist.save}
        </button>
      </div>
    </form>
  );
}
