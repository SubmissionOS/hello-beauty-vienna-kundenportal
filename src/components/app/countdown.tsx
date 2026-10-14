'use client';

import { useEffect, useState } from 'react';
import { fmt, type Dict } from '@/lib/i18n';

/** Aktuelle Zeit, alle `ms` Millisekunden neu (für Countdowns) */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** „2 T 4 Std“, „3 Std 12 Min“, „4 Min 05 s“ – die zwei größten Einheiten */
export function leftText(ms: number, t: Dict): string {
  if (ms <= 0) return t.countdown.expired;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const c = t.countdown;
  if (d > 0) return `${fmt(c.d, { n: d })} ${fmt(c.h, { n: h })}`;
  if (h > 0) return `${fmt(c.h, { n: h })} ${fmt(c.m, { n: m })}`;
  return `${fmt(c.m, { n: m })} ${fmt(c.s, { n: String(sec).padStart(2, '0') })}`;
}

/** mm:ss bzw. h:mm:ss für die große Anzeige */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
