import { dbErrorCode, supabaseBrowser } from '../../supabase/client';
import type { DataAdapter } from '../adapter';
import {
  DataError,
  type Account,
  type BookingResult,
  type CancelResult,
  type Channel,
  type ChatMessage,
  type Consents,
  type DataErrorCode,
  type MarketingChannel,
  type NewsItem,
  type NewWaitlistEntry,
  type NotificationPrefs,
  type NotifyKind,
  type OfferResult,
  type Payment,
  type PaymentQuote,
  type PushSubscriptionInput,
  type UnreadCounts,
  type WaitlistEntry,
  type WaitlistOffer,
  type Appointment,
  type Category,
  type CategoryId,
  type CustomerExport,
  type CustomerProfile,
  type NewAppointment,
  type NewCustomer,
  type ProfilePatch,
  type Service,
  type Slot,
  type StaffMember,
} from '../types';

/**
 * Supabase-Adapter (Teil 2). Lesen über Tabellen/Views mit RLS, Schreiben nur über Postgres-Funktionen.
 * Zeiten kommen bereits als Wandzeit aus der DB (app.to_wall) – hier wird nichts umgerechnet.
 */

type Row = Record<string, unknown>;

const KNOWN: DataErrorCode[] = ['slot_taken', 'not_found', 'email_taken', 'too_late', 'offer_closed', 'rate_limited'];

function fail(error: { message?: string } | null): never {
  const code = dbErrorCode(error);
  if (KNOWN.includes(code as DataErrorCode)) throw new DataError(code as DataErrorCode);
  // Netzwerkfehler (fetch) → offline, damit die Oberfläche den passenden Zustand zeigt
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new DataError('offline');
  if (code && /^invalid_/.test(code)) throw new DataError('invalid');
  throw new DataError('unknown');
}

const toService = (r: Row): Service => ({
  id: r.id as string,
  categoryId: (r.service_categories as { key: CategoryId }).key,
  name: r.name as string,
  nameI18n: (r.name_i18n as Service['nameI18n']) ?? {},
  durationMinutes: r.duration_minutes as number,
  priceEur: Number(r.price_eur),
});

const toProfile = (r: Row): CustomerProfile => ({
  id: r.id as string,
  firstName: r.first_name as string,
  lastName: r.last_name as string,
  email: r.email as string,
  phone: (r.phone as string | null) ?? null,
  language: r.language as CustomerProfile['language'],
  notifyEmail: r.notify_email as boolean,
  notifySms: r.notify_sms as boolean,
  marketingConsent: r.marketing_consent as boolean,
  marketingConsentAt: (r.marketing_consent_at as string | null) ?? null,
  privacyNoticeAt: r.privacy_notice_at as string,
  createdAt: r.created_at as string,
});

const toChat = (r: Row): ChatMessage => ({
  id: r.id as string,
  sender: r.sender as ChatMessage['sender'],
  senderName: (r.sender_name as string | null) ?? null,
  body: r.body as string,
  createdAt: r.created_at as string,
  readByCustomerAt: (r.read_by_customer_at as string | null) ?? null,
  readBySalonAt: (r.read_by_salon_at as string | null) ?? null,
});

const fromJsonOffer = (o: WaitlistOffer): WaitlistOffer => ({ ...o, priceEur: Number(o.priceEur) });

/** Antworten der Funktionen sind schon im Adapter-Format (camelCase), nur Zahlen normalisieren */
const fromJsonAppointment = (j: Appointment): Appointment => ({ ...j, priceEur: Number(j.priceEur) });

const SERVICE_COLUMNS = 'id, name, name_i18n, duration_minutes, price_eur, service_categories!inner(key)';

export class SupabaseDataAdapter implements DataAdapter {
  private get db() {
    return supabaseBrowser();
  }

  async listCategories(): Promise<Category[]> {
    const { data, error } = await this.db.from('service_categories').select('key, sort_order, image_url').order('sort_order');
    if (error) fail(error);
    return data.map((r) => ({ id: r.key as CategoryId, sortOrder: r.sort_order, imageUrl: r.image_url }));
  }

  async listServices(categoryId?: CategoryId): Promise<Service[]> {
    let q = this.db.from('services').select(SERVICE_COLUMNS).order('sort_order');
    if (categoryId) q = q.eq('service_categories.key', categoryId);
    const { data, error } = await q;
    if (error) fail(error);
    return (data as Row[]).map(toService);
  }

  async getService(serviceId: string): Promise<Service | null> {
    const { data, error } = await this.db.from('services').select(SERVICE_COLUMNS).eq('id', serviceId).maybeSingle();
    if (error) fail(error);
    return data ? toService(data as Row) : null;
  }

  async listStaff(categoryId?: CategoryId): Promise<StaffMember[]> {
    const { data, error } = await this.db
      .from('staff')
      .select('id, display_name, staff_services(services(service_categories(key)))')
      .order('sort_order');
    if (error) fail(error);
    type StaffRow = { id: string; display_name: string; staff_services: { services: { service_categories: { key: CategoryId } } }[] };
    return (data as unknown as StaffRow[])
      .map((m) => ({
        id: m.id,
        displayName: m.display_name,
        categories: [...new Set(m.staff_services.map((x) => x.services.service_categories.key))],
      }))
      .filter((m) => !categoryId || m.categories.includes(categoryId));
  }

  async listAvailableSlots(q: { serviceId: string; staffId: string | null; date: string }): Promise<Slot[]> {
    const { data, error } = await this.db.rpc('available_slots', {
      p_service_id: q.serviceId,
      p_staff_id: q.staffId,
      p_date: q.date,
    });
    if (error) fail(error);
    return (data as { start: string; staff_id: string }[]).map((s) => ({ start: s.start, staffId: s.staff_id }));
  }

  async createCustomer(input: NewCustomer): Promise<CustomerProfile> {
    const { data, error } = await this.db.rpc('register_customer', {
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_phone: input.phone,
      p_language: input.language,
      p_marketing: input.marketingConsent,
    });
    if (error) fail(error);
    return data as CustomerProfile;
  }

  async findCustomerIdByEmail(email: string): Promise<string | null> {
    // RLS liefert höchstens den eigenen Datensatz im aktuellen Tenant
    const { data, error } = await this.db.from('customers').select('id, email').maybeSingle();
    if (error) fail(error);
    return data && data.email === email.trim().toLowerCase() ? (data.id as string) : null;
  }

  async getProfile(customerId: string): Promise<CustomerProfile | null> {
    const { data, error } = await this.db.from('customers').select('*').eq('id', customerId).maybeSingle();
    if (error) fail(error);
    return data ? toProfile(data) : null;
  }

  async updateProfile(_customerId: string, patch: ProfilePatch): Promise<CustomerProfile> {
    const { data, error } = await this.db.rpc('update_profile', { p_patch: patch });
    if (error) fail(error);
    return data as CustomerProfile;
  }

  async listAppointments(): Promise<Appointment[]> {
    // v2: inkl. Zahlungs-Reservierung, ohne Wartelisten-Reservierungen (die sind Angebote, keine Termine)
    return (await this.rpc<Appointment[]>('my_appointments_v2')).map(fromJsonAppointment);
  }

  async createAppointment(input: NewAppointment): Promise<Appointment> {
    const { data, error } = await this.db.rpc('book_appointment', {
      p_service_id: input.serviceId,
      p_staff_id: input.staffId,
      p_start: input.start,
      p_payment: input.payment,
    });
    if (error) fail(error);
    return fromJsonAppointment(data as Appointment);
  }

  async exportCustomerData(): Promise<CustomerExport> {
    // v2: zusätzlich Chat, Warteliste, Angebote, Zahlungen, Einwilligungen, Benachrichtigungs-Einstellungen
    const out = await this.rpc<CustomerExport>('export_my_data_v2');
    return { ...out, appointments: out.appointments.map(fromJsonAppointment) };
  }

  async deleteCustomer(): Promise<void> {
    // Endgültiges Löschen braucht den Secret Key → serverseitige Route, nur für die eingeloggte Person selbst
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new DataError('not_found');
    const res = await fetch('/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new DataError(res.status === 404 ? 'not_found' : 'unknown');
  }

  // ---------------------------------------------------------------- Teil 3/4

  private async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) fail(error);
    return data as T;
  }

  /** Token der eingeloggten Kundin für die Server-Routen (Konto löschen, Test-Zahlung) */
  private async token(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new DataError('not_found');
    return token;
  }

  private async toAccount(raw: { customerNumber: string; avatarPath: string | null; crmLinked: boolean }): Promise<Account> {
    let avatarUrl: string | null = null;
    if (raw.avatarPath) {
      // privater Bucket: signierte URL, 1 Stunde gültig
      const { data } = await this.db.storage.from('avatars').createSignedUrl(raw.avatarPath, 3600);
      avatarUrl = data?.signedUrl ?? null;
    }
    return { customerNumber: raw.customerNumber, avatarUrl, crmLinked: raw.crmLinked };
  }

  async getAccount(): Promise<Account> {
    const raw = await this.rpc<{ customerNumber: string; avatarPath: string | null; crmLinked: boolean } | null>('my_account');
    if (!raw) throw new DataError('not_found');
    return this.toAccount(raw);
  }

  async uploadAvatar(image: Blob): Promise<Account> {
    const { data: me, error } = await this.db.from('customers').select('id, tenant_id').maybeSingle();
    if (error) fail(error);
    if (!me) throw new DataError('not_found');
    const ext = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
    const path = `${me.tenant_id}/${me.id}/avatar-${Date.now()}.${ext}`;
    const up = await this.db.storage.from('avatars').upload(path, image, { contentType: image.type, upsert: false });
    if (up.error) throw new DataError(/size|large/i.test(up.error.message) ? 'invalid' : 'unknown');
    const old = (await this.rpc<{ avatarPath: string | null }>('my_account')).avatarPath;
    await this.rpc('set_avatar', { p_path: path });
    if (old && old !== path) await this.db.storage.from('avatars').remove([old]);
    return this.getAccount();
  }

  async removeAvatar(): Promise<Account> {
    const old = (await this.rpc<{ avatarPath: string | null }>('my_account')).avatarPath;
    await this.rpc('set_avatar', { p_path: null });
    if (old) await this.db.storage.from('avatars').remove([old]);
    return this.getAccount();
  }

  async getConsents(): Promise<Consents> {
    return this.rpc<Consents>('my_consents');
  }

  async setConsent(channel: MarketingChannel, granted: boolean): Promise<Consents> {
    return this.rpc<Consents>('set_marketing_consent', { p_channel: channel, p_granted: granted });
  }

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    return this.rpc<NotificationPrefs>('my_notification_preferences');
  }

  async setNotificationPref(kind: NotifyKind, channel: Channel, enabled: boolean): Promise<NotificationPrefs> {
    return this.rpc<NotificationPrefs>('set_notification_preference', { p_kind: kind, p_channel: channel, p_enabled: enabled });
  }

  async getUnreadCounts(): Promise<UnreadCounts> {
    const [chat, news, offers] = await Promise.all([
      this.db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('sender', 'salon').is('read_by_customer_at', null),
      this.rpc<number>('news_unread_count'),
      this.rpc<unknown[]>('my_waitlist_offers'),
    ]);
    if (chat.error) fail(chat.error);
    return { chat: chat.count ?? 0, news, offers: offers.length };
  }

  async listChat(): Promise<ChatMessage[]> {
    const { data, error } = await this.db
      .from('chat_messages')
      .select('id, sender, sender_name, body, created_at, read_by_customer_at, read_by_salon_at')
      .order('created_at')
      .limit(500);
    if (error) fail(error);
    return (data as Row[]).map(toChat);
  }

  async sendChat(body: string): Promise<ChatMessage> {
    const text = body.trim();
    if (!text || text.length > 2000) throw new DataError('invalid');
    return toChat(await this.rpc<Row>('send_chat_message', { p_body: text }));
  }

  async markChatRead(): Promise<void> {
    await this.rpc('mark_chat_read');
  }

  async listNews(): Promise<NewsItem[]> {
    const raw = await this.rpc<(Omit<NewsItem, 'imageUrl'> & { imagePath: string | null })[]>('news_feed');
    return raw.map(({ imagePath, ...n }) => ({
      ...n,
      imageUrl: imagePath ? this.db.storage.from('news-images').getPublicUrl(imagePath).data.publicUrl : null,
    }));
  }

  async markNewsRead(newsId: string): Promise<void> {
    await this.rpc('mark_news_read', { p_news_id: newsId });
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    return this.rpc<WaitlistEntry[]>('my_waitlist');
  }

  async joinWaitlist(e: NewWaitlistEntry): Promise<void> {
    if (!e.serviceIds.length || !e.weekdays.length || e.dateTo < e.dateFrom || e.timeTo <= e.timeFrom) {
      throw new DataError('invalid');
    }
    await this.rpc('join_waitlist', {
      p_service_ids: e.serviceIds,
      p_staff_id: e.staffId,
      p_date_from: e.dateFrom,
      p_date_to: e.dateTo,
      p_weekdays: e.weekdays,
      p_time_from: e.timeFrom,
      p_time_to: e.timeTo,
      p_short_notice: e.shortNotice,
    });
  }

  async leaveWaitlist(entryId: string): Promise<void> {
    await this.rpc('leave_waitlist', { p_entry_id: entryId });
  }

  async listOffers(): Promise<WaitlistOffer[]> {
    return (await this.rpc<WaitlistOffer[]>('my_waitlist_offers')).map(fromJsonOffer);
  }

  async getOffer(offerId: string): Promise<WaitlistOffer> {
    return fromJsonOffer(await this.rpc<WaitlistOffer>('waitlist_offer', { p_offer_id: offerId }));
  }

  async respondOffer(offerId: string, accept: boolean): Promise<OfferResult> {
    const r = await this.rpc<OfferResult>('waitlist_offer_respond', { p_offer_id: offerId, p_accept: accept });
    return r.result === 'booked' ? { result: 'booked', appointment: fromJsonAppointment(r.appointment) } : r;
  }

  async cancelAppointment(appointmentId: string): Promise<CancelResult> {
    const r = await this.rpc<{ payments: Payment[] }>('cancel_with_refund', { p_appointment_id: appointmentId });
    return { refundCents: r.payments.reduce((sum, p) => sum + (p.refundCents ?? 0), 0) };
  }

  async rescheduleAppointment(appointmentId: string, start: string): Promise<Appointment> {
    return fromJsonAppointment(await this.rpc<Appointment>('reschedule_appointment', { p_id: appointmentId, p_new_start: start }));
  }

  async getPaymentQuote(serviceId: string): Promise<PaymentQuote> {
    return this.rpc<PaymentQuote>('payment_quote', { p_service_id: serviceId });
  }

  async bookWithPayment(input: { serviceId: string; staffId: string; start: string }): Promise<BookingResult> {
    const r = await this.rpc<BookingResult>('book_with_payment', {
      p_service_id: input.serviceId,
      p_staff_id: input.staffId,
      p_start: input.start,
    });
    return { appointment: fromJsonAppointment(r.appointment), payment: r.payment };
  }

  async listPayments(): Promise<Payment[]> {
    return this.rpc<Payment[]>('my_payments');
  }

  async completeTestPayment(paymentId: string): Promise<Payment> {
    // Mock-Anbieter läuft über den Server (gleicher Weg wie später der Stripe-Webhook)
    const res = await fetch('/api/payments/test-complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    if (!res.ok) throw new DataError(res.status === 404 ? 'not_found' : res.status === 409 ? 'too_late' : 'unknown');
    return (await res.json()) as Payment;
  }

  async startCheckout(paymentId: string): Promise<string> {
    const res = await fetch('/api/payments/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId }),
    });
    if (!res.ok) throw new DataError(res.status === 409 ? 'too_late' : 'unknown');
    return ((await res.json()) as { url: string }).url;
  }

  async savePushSubscription(sub: PushSubscriptionInput): Promise<void> {
    await this.rpc('save_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: sub.p256dh,
      p_auth: sub.auth,
      p_user_agent: sub.userAgent,
    });
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await this.rpc('delete_push_subscription', { p_endpoint: endpoint });
  }
}
