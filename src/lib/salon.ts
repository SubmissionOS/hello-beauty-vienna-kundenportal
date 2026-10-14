/**
 * Stammdaten des Salons. Quelle: Website-Repo hellobeautyvienna-website, src/data/site.ts (Stand 2026-10-13).
 */
import type { Lang } from './i18n/config';

const websiteBase = (process.env.NEXT_PUBLIC_SALON_WEBSITE_URL || 'https://hellobeautysalon.at').replace(/\/$/, '');

export const salon = {
  name: 'Hello Beauty',
  phone: '+43 660 7055 631',
  phoneE164: '+436607055631',
  email: 'info@hellobeautysalon.at',
  street: 'Barnabitengasse 7',
  postalCode: '1060',
  city: 'Wien',
  timeZone: 'Europe/Vienna',
  /** Montag–Samstag 09:00–19:00, Sonntag geschlossen */
  openDays: [1, 2, 3, 4, 5, 6] as readonly number[],
  openHour: 9,
  closeHour: 19,
  website: websiteBase,
  mapsUrl: 'https://maps.apple.com/?q=Hello+Beauty&address=Barnabitengasse+7,+1060+Wien,+%C3%96sterreich&ll=48.1986658,16.353555',
} as const;

const legalPaths: Record<'imprint' | 'privacy', Record<Lang, string>> = {
  imprint: { de: '/impressum/', en: '/en/imprint/', hu: '/hu/impresszum/' },
  privacy: { de: '/datenschutz/', en: '/en/privacy/', hu: '/hu/adatvedelem/' },
};

export function legalUrl(kind: 'imprint' | 'privacy', lang: Lang): string {
  return `${salon.website}${legalPaths[kind][lang]}`;
}
