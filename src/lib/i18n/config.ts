export const langs = ['de', 'en', 'hu'] as const;
export type Lang = (typeof langs)[number];
export const defaultLang: Lang = 'de';

export const intlLocale: Record<Lang, string> = { de: 'de-AT', en: 'en-GB', hu: 'hu-HU' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (langs as readonly string[]).includes(value);
}

/** Gespeicherte Wahl, sonst Browsersprache, sonst Deutsch. */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem('hb-lang');
    if (isLang(stored)) return stored;
  } catch {
    /* Speicher gesperrt (privater Modus) */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const short = l.slice(0, 2).toLowerCase();
    if (isLang(short)) return short;
  }
  return defaultLang;
}
