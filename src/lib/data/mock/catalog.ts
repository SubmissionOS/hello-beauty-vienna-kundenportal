/**
 * Demo-Katalog – übernommen aus dem Hello-Beauty-CRM (Repo hello-beauty-vienna, src/lib/mock/services.ts
 * und src/lib/mock/calendar.ts, Stand 2026-10-14). Namen, Dauer und Preise unverändert.
 * Die Übersetzungen EN/HU sind nur Anzeige-Hilfen der App.
 * [PLATZHALTER: echte Leistungsliste, Mitarbeiterinnen und Zuständigkeiten kommen in Teil 2 aus Supabase]
 */
import type { Category, Service, StaffMember } from '../types';

export const categories: Category[] = [
  { id: 'nails', sortOrder: 1, imageUrl: '/photos/nails.webp' },
  { id: 'pedicure', sortOrder: 2, imageUrl: '/photos/pedicure.webp' },
  { id: 'cosmetics', sortOrder: 3, imageUrl: '/photos/cosmetics.webp' },
  { id: 'laser', sortOrder: 4, imageUrl: '/photos/laser.webp' },
];

const s = (
  id: string,
  categoryId: Service['categoryId'],
  name: string,
  durationMinutes: number,
  priceEur: number,
  en: string,
  hu: string,
): Service => ({ id, categoryId, name, durationMinutes, priceEur, nameI18n: { en, hu } });

export const services: Service[] = [
  s('s-01', 'nails', 'Maniküre klassisch', 45, 45, 'Classic manicure', 'Klasszikus manikűr'),
  s('s-02', 'nails', 'Maniküre + Shellac', 60, 60, 'Manicure + Shellac', 'Manikűr + shellac'),
  s('s-03', 'nails', 'Auffüllen + Lack', 60, 55, 'Refill + polish', 'Töltés + lakk'),
  s('s-04', 'nails', 'Gel-Modellage Neuset', 90, 85, 'Gel extensions, new set', 'Zselés műköröm, új szett'),
  s('s-05', 'nails', 'Nailart French', 60, 70, 'Nail art French', 'Francia nail art'),
  s('s-06', 'nails', 'Nailart aufwendig', 90, 95, 'Nail art, detailed', 'Igényes nail art'),
  s('s-09', 'nails', 'Handpflege + Peeling', 30, 30, 'Hand care + scrub', 'Kézápolás + peeling'),
  s('s-10', 'nails', 'Nagelreparatur einzeln', 20, 15, 'Single nail repair', 'Egy köröm javítása'),
  s('s-07', 'pedicure', 'Pediküre Spa', 75, 65, 'Spa pedicure', 'Spa pedikűr'),
  s('s-08', 'pedicure', 'Pediküre klassisch', 60, 50, 'Classic pedicure', 'Klasszikus pedikűr'),
  s('s-11', 'pedicure', 'Fußpflege medizinisch', 60, 58, 'Medical foot care', 'Gyógypedikűr'),
  s('s-12', 'pedicure', 'Zehennagel-Modellage', 45, 48, 'Toenail extensions', 'Lábköröm-építés'),
  s('s-13', 'cosmetics', 'Gesichtsbehandlung klassisch', 60, 70, 'Classic facial', 'Klasszikus arckezelés'),
  s('s-14', 'cosmetics', 'Gesichtsbehandlung intensiv', 90, 105, 'Intensive facial', 'Intenzív arckezelés'),
  s('s-15', 'cosmetics', 'Wimpernlifting', 60, 75, 'Lash lift', 'Szempillalifting'),
  s('s-16', 'cosmetics', 'Augenbrauen zupfen + färben', 30, 28, 'Brow shaping + tint', 'Szemöldökszedés + festés'),
  s('s-17', 'laser', 'Laser Oberlippe', 20, 45, 'Laser upper lip', 'Lézer – felső ajak'),
  s('s-18', 'laser', 'Laser Achseln', 20, 60, 'Laser underarms', 'Lézer – hónalj'),
  s('s-19', 'laser', 'Laser Unterschenkel', 40, 120, 'Laser lower legs', 'Lézer – lábszár'),
  s('s-20', 'laser', 'Laser Bikinizone', 30, 90, 'Laser bikini line', 'Lézer – bikinivonal'),
];

/** Mitarbeiterinnen aus dem CRM-Demo (Ressourcenspalten des Kalenders). Zuständigkeit: alle Kategorien (Annahme). */
export const staff: StaffMember[] = [
  { id: 'st-petra', displayName: 'Petra', categories: ['nails', 'pedicure', 'cosmetics', 'laser'] },
  { id: 'st-reka', displayName: 'Réka', categories: ['nails', 'pedicure', 'cosmetics', 'laser'] },
  { id: 'st-ivana', displayName: 'Ivana', categories: ['nails', 'pedicure', 'cosmetics', 'laser'] },
];
