import type {
  Account,
  BookingResult,
  CancelResult,
  ChatMessage,
  Consents,
  MarketingChannel,
  NewsItem,
  NewWaitlistEntry,
  NotificationPrefs,
  NotifyKind,
  Channel,
  OfferResult,
  Payment,
  PaymentQuote,
  PushSubscriptionInput,
  UnreadCounts,
  WaitlistEntry,
  WaitlistOffer,
  Appointment,
  Category,
  CategoryId,
  CustomerExport,
  CustomerProfile,
  NewAppointment,
  NewCustomer,
  ProfilePatch,
  Service,
  Slot,
  StaffMember,
} from './types';

/**
 * Einzige Schnittstelle zwischen Oberfläche und Daten.
 * Teil 1: MockDataAdapter (localStorage). Teil 2: SupabaseDataAdapter mit derselben Signatur –
 * die Oberfläche ändert sich dabei nicht. Alle Methoden sind asynchron und werfen bei Fehlern `DataError`.
 * Zugriffsschutz (nur eigene Daten) liegt in Teil 2 bei Row Level Security, nicht in der Oberfläche.
 */
export interface DataAdapter {
  // Katalog (öffentlich)
  listCategories(): Promise<Category[]>;
  listServices(categoryId?: CategoryId): Promise<Service[]>;
  getService(serviceId: string): Promise<Service | null>;
  listStaff(categoryId?: CategoryId): Promise<StaffMember[]>;
  /** Freie Startzeiten an einem Tag ('YYYY-MM-DD'); staffId null = beliebige Mitarbeiterin */
  listAvailableSlots(query: { serviceId: string; staffId: string | null; date: string }): Promise<Slot[]>;

  // Kundin (nur eigene Daten)
  createCustomer(input: NewCustomer): Promise<CustomerProfile>;
  findCustomerIdByEmail(email: string): Promise<string | null>;
  getProfile(customerId: string): Promise<CustomerProfile | null>;
  updateProfile(customerId: string, patch: ProfilePatch): Promise<CustomerProfile>;
  listAppointments(customerId: string): Promise<Appointment[]>;
  createAppointment(input: NewAppointment): Promise<Appointment>;
  exportCustomerData(customerId: string): Promise<CustomerExport>;
  deleteCustomer(customerId: string): Promise<void>;

  // Teil 3/4 – Konto
  getAccount(): Promise<Account>;
  /** Bild ist bereits im Browser auf WebP ≤ 512 px umgerechnet (ohne EXIF/Standort) */
  uploadAvatar(image: Blob): Promise<Account>;
  removeAvatar(): Promise<Account>;
  getConsents(): Promise<Consents>;
  setConsent(channel: MarketingChannel, granted: boolean): Promise<Consents>;
  getNotificationPrefs(): Promise<NotificationPrefs>;
  setNotificationPref(kind: NotifyKind, channel: Channel, enabled: boolean): Promise<NotificationPrefs>;
  getUnreadCounts(): Promise<UnreadCounts>;

  // Chat mit dem Salon
  listChat(): Promise<ChatMessage[]>;
  sendChat(body: string): Promise<ChatMessage>;
  markChatRead(): Promise<void>;

  // Neuigkeiten & Angebote
  listNews(): Promise<NewsItem[]>;
  markNewsRead(newsId: string): Promise<void>;

  // Warteliste
  listWaitlist(): Promise<WaitlistEntry[]>;
  joinWaitlist(entry: NewWaitlistEntry): Promise<void>;
  leaveWaitlist(entryId: string): Promise<void>;
  listOffers(): Promise<WaitlistOffer[]>;
  getOffer(offerId: string): Promise<WaitlistOffer>;
  respondOffer(offerId: string, accept: boolean): Promise<OfferResult>;

  // Termine verwalten (Frist wird in der Datenbank geprüft)
  cancelAppointment(appointmentId: string): Promise<CancelResult>;
  rescheduleAppointment(appointmentId: string, start: string): Promise<Appointment>;

  // Zahlung
  getPaymentQuote(serviceId: string): Promise<PaymentQuote>;
  bookWithPayment(input: { serviceId: string; staffId: string; start: string }): Promise<BookingResult>;
  listPayments(): Promise<Payment[]>;
  /** Test-Zahlung (Mock-Anbieter) abschließen – solange kein echter Zahlungsanbieter eingerichtet ist */
  completeTestPayment(paymentId: string): Promise<Payment>;
  /** Stripe Checkout starten (nur mit echtem Anbieter): URL der Zahlungsseite von Stripe */
  startCheckout(paymentId: string): Promise<string>;

  // Web-Push
  savePushSubscription(sub: PushSubscriptionInput): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
}
