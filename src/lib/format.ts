import { intlLocale, type Lang } from './i18n/config';
import { salon } from './salon';

/**
 * Termine werden als Wandzeit des Salons gespeichert: 'YYYY-MM-DDTHH:mm' (Europe/Vienna).
 * Für Anzeige und Rechnen wird daraus ein Date in UTC gebaut, das nur mit timeZone 'UTC' formatiert wird –
 * so verschiebt die Zeitzone des Geräts nie die Uhrzeit.
 */
export function wallToDate(wall: string): Date {
  return new Date(`${wall}:00Z`);
}

/** Aktuelle Wandzeit in Wien als 'YYYY-MM-DDTHH:mm'. */
export function nowWall(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: salon.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function todayIso(): string {
  return nowWall().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const cache = new Map<string, Intl.DateTimeFormat>();
function df(lang: Lang, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = lang + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale[lang], { ...opts, timeZone: 'UTC' });
    cache.set(key, f);
  }
  return f;
}

export const formatDateLong = (wall: string, lang: Lang) =>
  df(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(wallToDate(wall));
export const formatDateShort = (wall: string, lang: Lang) =>
  df(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(wallToDate(wall));
export const formatDateFull = (wall: string, lang: Lang) =>
  df(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(wallToDate(wall));
export const formatTime = (wall: string, lang: Lang) =>
  df(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(wallToDate(wall));
export const formatDay = (iso: string, lang: Lang) => df(lang, { day: 'numeric' }).format(wallToDate(`${iso}T12:00`));
export const formatWeekdayShort = (iso: string, lang: Lang) =>
  df(lang, { weekday: 'short' }).format(wallToDate(`${iso}T12:00`));
export const formatMonth = (iso: string, lang: Lang) =>
  df(lang, { month: 'long', year: 'numeric' }).format(wallToDate(`${iso}T12:00`));

export function formatPrice(eur: number, lang: Lang): string {
  return new Intl.NumberFormat(intlLocale[lang], {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: Number.isInteger(eur) ? 0 : 2,
  }).format(eur);
}
