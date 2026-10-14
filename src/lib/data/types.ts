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
  /** Teil 4: Termin wartet auf Online-Zahlung (Reservierung läuft bis holdExpiresAt) */
  holdKind?: 'payment' | null;
  holdExpiresAt?: string | null;
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
  [key: string]: unknown;
  profile: CustomerProfile;
  appointments: Appointment[];
}

export type DataErrorCode =
  | 'slot_taken'
  | 'not_found'
  | 'email_taken'
  | 'too_late'
  | 'offer_closed'
  | 'rate_limited'
  | 'invalid'
  | 'offline'
  | 'unknown';

export class DataError extends Error {
  constructor(public readonly code: DataErrorCode) {
    super(code);
    this.name = 'DataError';
  }
}

// ---------------------------------------------------------------- Teil 3/4

export type Channel = 'inapp' | 'email' | 'sms' | 'push';
export type MarketingChannel = 'email' | 'sms' | 'push';
export type NotifyKind = 'reminder' | 'chat' | 'news' | 'offer' | 'waitlist' | 'payment';

export interface Account {
  /** feste, nicht erratbare Kundennummer HB-XXXXXX */
  customerNumber: string;
  avatarUrl: string | null;
  crmLinked: boolean;
}

/** Werbe-Einwilligung je Kanal mit Zeitstempel der letzten Änderung */
export type Consents = Record<MarketingChannel, { granted: boolean; changedAt: string | null }>;
export type NotificationPrefs = Record<NotifyKind, Record<Channel, boolean>>;

export interface ChatMessage {
  id: string;
  sender: 'customer' | 'salon';
  senderName: string | null;
  body: string;
  createdAt: string;
  readByCustomerAt: string | null;
  readBySalonAt: string | null;
}

export interface NewsItem {
  id: string;
  kind: 'news' | 'offer' | 'free_slot';
  title: string;
  body: string;
  imageUrl: string | null;
  validUntil: string | null;
  publishedAt: string;
  read: boolean;
}

export interface UnreadCounts {
  chat: number;
  news: number;
  offers: number;
}

export interface NewWaitlistEntry {
  serviceIds: string[];
  staffId: string | null;
  dateFrom: string;
  dateTo: string;
  /** 0 = Sonntag … 6 = Samstag */
  weekdays: number[];
  timeFrom: string;
  timeTo: string;
  shortNotice: boolean;
}

export interface WaitlistEntry extends NewWaitlistEntry {
  id: string;
  serviceNames: string[];
  staffName: string | null;
  createdAt: string;
}

export interface WaitlistOffer {
  id: string;
  status: 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  serviceId: string;
  serviceName: string;
  staffName: string;
  start: WallTime;
  durationMinutes: number;
  priceEur: number;
  offeredAt: string;
  expiresAt: string;
  appointmentId: string | null;
}

export type OfferResult = { result: 'booked'; appointment: Appointment } | { result: 'declined' } | { result: 'expired' };

export type PaymentStatus =
  | 'requires_payment'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refund_pending'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

export interface Payment {
  id: string;
  appointmentId: string | null;
  amountCents: number;
  currency: 'EUR';
  kind: 'deposit' | 'full';
  status: PaymentStatus;
  provider: 'mock' | 'stripe';
  refundCents: number;
  createdAt: string;
  paidAt: string | null;
}

export interface PaymentQuote {
  mode: 'on_site' | 'deposit_percent' | 'deposit_fixed' | 'full';
  totalCents: number;
  dueOnlineCents: number;
  holdMinutes: number;
}

export interface BookingResult {
  appointment: Appointment;
  payment: Payment | null;
}

export interface CancelResult {
  /** Erstattung in Cent (nur bei bezahlten Terminen) */
  refundCents: number;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}
