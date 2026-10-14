'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getData, type Service, type Slot } from '@/lib/data';
import { addDays, formatDateFull, formatDay, formatTime, formatWeekdayShort, todayIso, weekday } from '@/lib/format';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';
import st from './app.module.css';
import { LoadError } from './load-state';
import { useLoad } from './use-load';

const DAYS_SHOWN = 21;

/**
 * Tag und Uhrzeit wählen (Buchen und Verschieben). Ist an einem Tag nichts frei, führt der Link direkt
 * auf die Warteliste – mit Leistung, Mitarbeiterin und Tag vorausgefüllt.
 */
export function SlotStep({
  service,
  staffId,
  selected,
  onPick,
  waitlist = true,
}: {
  service: Service;
  staffId: string | null;
  selected: Slot | null;
  onPick: (s: Slot) => void;
  waitlist?: boolean;
}) {
  const { t, lang } = useI18n();
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(todayIso(), i)), []);
  const firstOpen = days.find((d) => salon.openDays.includes(weekday(d))) ?? days[0]!;
  const [day, setDay] = useState(selected?.start.slice(0, 10) ?? firstOpen);
  const { state, reload } = useLoad(
    () => getData().listAvailableSlots({ serviceId: service.id, staffId, date: day }),
    `${service.id}|${staffId}|${day}`,
  );
  const open = salon.openDays.includes(weekday(day));

  const groups =
    state.status === 'ready'
      ? [
          { title: t.book.morning, items: state.data.filter((s) => s.start.slice(11, 13) < '12') },
          { title: t.book.afternoon, items: state.data.filter((s) => s.start.slice(11, 13) >= '12') },
        ].filter((g) => g.items.length)
      : [];

  const waitlistHref = `/app/warteliste?service=${encodeURIComponent(service.id)}${staffId ? `&staff=${encodeURIComponent(staffId)}` : ''}&date=${day}`;

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
      ) : state.status === 'error' ? (
        <LoadError onRetry={reload} />
      ) : state.status !== 'ready' ? (
        <div className="skeleton" style={{ height: 150 }} />
      ) : groups.length === 0 ? (
        <div className={`card ${st.empty}`}>
          <p className="muted">{t.book.noSlots}</p>
          {waitlist && (
            <>
              <p className="muted">{t.waitlist.noSlotsText}</p>
              <Link href={waitlistHref} className="btn btn-primary">
                {t.waitlist.noSlotsCta}
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {groups.map((g) => (
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
          ))}
          {waitlist && (
            <p className="hint">
              {t.waitlist.noSlotsText} <Link href={waitlistHref}>{t.waitlist.noSlotsCta}</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
