import type { Lang } from '../i18n/config';

/** Identisch zum DB-Enum im CRM (supabase/migrations/0001_enums.sql im Repo hello-beauty-vienna). */
export type CategoryId = 'nails' | 'pedicure' | 'cosmetics' | 'laser';

export interface Category {
  id: CategoryId;
  sortOrder: number;
  /** Pfad zu einem Foto, optional */
  imageUrl: string | null;
}

export interface Service {
  id: string;
  categoryId: CategoryId;
  /** Stammdaten-Name wie im CRM (Deutsch) */
  name: string;
  /** Optionale Übersetzungen; fehlt eine, zeigt die App `name` */
  nameI18n?: Partial<Record<Lang, string>>;
  durationMinutes: number;
  priceEur: number;
}

export interface StaffMember {
  id: string;
  /** Vorname, so wie er Kundinnen angezeigt wird */
  displayName: string;
  /** Leistungskategorien, die sie anbietet */
  categories: CategoryId[];
}

/** Wandzeit des Salons (Europe/Vienna) als 'YYYY-MM-DDTHH:mm'. Supabase-Adapter rechnet in timestamptz um. */
export type WallTime = string;

export interface Slot {
  start: WallTime;
  /** Mitarbeiterin, bei der der Slot frei ist */
  staffId: string;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type PaymentMethod = 'in_salon' | 'online_demo';

export interface Appointment {
  id: string;
  customerId: string;
  serviceId: string;
  /** Name zum Buchungszeitpunkt (bleibt lesbar, auch wenn die Leistung später umbenannt wird) */
  serviceName: string;
  categoryId: CategoryId;
  staffId: string;
  staffName: string;
  start: WallTime;
  durationMinutes: number;
  priceEur: number;
  status: AppointmentStatus;
  payment: PaymentMethod;
  createdAt: string;
}

export interface NewAppointment {
  customerId: string;
  serviceId: string;
  staffId: string;
  start: WallTime;
  payment: PaymentMethod;
}

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  language: Lang;
  notifyEmail: boolean;
  notifySms: boolean;
  /** Marketing-Einwilligung, getrennt von der Registrierung; mit Zeitstempel (DSGVO Art. 7 Abs. 1) */
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  /** Zeitpunkt, zu dem der Datenschutzhinweis angezeigt wurde */
  privacyNoticeAt: string;
  createdAt: string;
}

export type ProfilePatch = Partial<
  Pick<CustomerProfile, 'firstName' | 'lastName' | 'phone' | 'language' | 'notifyEmail' | 'notifySms' | 'marketingConsent'>
>;

export interface NewCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  language: Lang;
  marketingConsent: boolean;
}

/** Datenauskunft nach DSGVO Art. 15/20 */
export interface CustomerExport {
  exportedAt: string;
  profile: CustomerProfile;
  appointments: Appointment[];
}

export type DataErrorCode = 'slot_taken' | 'not_found' | 'email_taken' | 'unknown';

export class DataError extends Error {
  constructor(public readonly code: DataErrorCode) {
    super(code);
    this.name = 'DataError';
  }
}
