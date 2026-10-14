import { addDays, nowWall, todayIso, wallToDate, weekday } from '../../format';
import { salon } from '../../salon';
import type { DataAdapter } from '../adapter';
import {
  DataError,
  type Account,
  type Appointment,
  type BookingResult,
  type CancelResult,
  type Channel,
  type ChatMessage,
  type Consents,
  type CustomerProfile,
  type MarketingChannel,
  type NewsItem,
  type NewWaitlistEntry,
  type NotificationPrefs,
  type NotifyKind,
  type OfferResult,
  type Payment,
  type PaymentQuote,
  type PushSubscriptionInput,
  type Slot,
  type UnreadCounts,
  type WaitlistEntry,
  type WaitlistOffer,
} from '../types';
import { categories, services, staff } from './catalog';
import { extra, loadDb, newCustomerNumber, newId, saveDb, type MockDb } from './db';

const SLOT_STEP = 30;
/** Buchungen frühestens 60 Minuten im Voraus, höchstens 60 Tage */
const LEAD_MINUTES = 60;
const HORIZON_DAYS = 60;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Deterministischer Hash (FNV-1a), damit die Demo-Auslastung bei jedem Laden gleich aussieht. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Simulierte Belegung durch andere Kundinnen: 2–4 Blöcke pro Mitarbeiterin und Tag. */
function simulatedBusy(date: string, staffId: string): [number, number][] {
  const blocks: [number, number][] = [];
  const count = 2 + (hash(`${date}|${staffId}|n`) % 3);
  for (let i = 0; i < count; i++) {
    const h = hash(`${date}|${staffId}|${i}`);
    const start = salon.openHour * 60 + (h % 18) * 30;
    const len = [45, 60, 90, 120][(h >>> 8) % 4]!;
    blocks.push([start, Math.min(start + len, salon.closeHour * 60)]);
  }
  return blocks;
}

function busyFor(date: string, staffId: string, appointments: Appointment[]): [number, number][] {
  const own = appointments
    .filter((a) => a.staffId === staffId && a.start.startsWith(date) && a.status !== 'cancelled')
    .map((a): [number, number] => {
      const s = toMin(a.start.slice(11, 16));
      return [s, s + a.durationMinutes];
    });
  return [...simulatedBusy(date, staffId), ...own];
}

function isBookableDay(date: string): boolean {
  const today = todayIso();
  return date >= today && date <= addDays(today, HORIZON_DAYS) && salon.openDays.includes(weekday(date));
}

function freeStarts(date: string, staffId: string, duration: number, appointments: Appointment[]): number[] {
  if (!isBookableDay(date)) return [];
  const busy = busyFor(date, staffId, appointments);
  const now = nowWall();
  const earliest = date === now.slice(0, 10) ? toMin(now.slice(11, 16)) + LEAD_MINUTES : 0;
  const result: number[] = [];
  for (let m = salon.openHour * 60; m + duration <= salon.closeHour * 60; m += SLOT_STEP) {
    if (m < earliest) continue;
    if (busy.some(([a, b]) => m < b && m + duration > a)) continue;
    result.push(m);
  }
  return result;
}

/** Abgeschlossene Termine erscheinen automatisch als „besucht“. */
function withDerivedStatus(a: Appointment): Appointment {
  if (a.status === 'confirmed' && wallToDate(a.start).getTime() + a.durationMinutes * 60_000 < wallToDate(nowWall()).getTime()) {
    return { ...a, status: 'completed' };
  }
  return a;
}

const NOTIFY_KINDS: NotifyKind[] = ['reminder', 'chat', 'news', 'offer', 'waitlist', 'payment'];
const CHANNELS: Channel[] = ['inapp', 'email', 'sms', 'push'];
const PAYMENT_HOLD_MINUTES = 15;

/** Voreinstellungen wie app.default_pref in der DB */
function defaultPref(kind: NotifyKind, ch: Channel): boolean {
  if (ch === 'inapp') return true;
  switch (kind) {
    case 'reminder':
    case 'payment':
      return ch === 'email';
    case 'chat':
    case 'offer':
      return ch === 'push' || ch === 'email';
    case 'waitlist':
      return true;
    default:
      return false;
  }
}

/** Angemeldete Kundin (Mock-Sitzung aus lib/auth/mock.ts) */
function me(): string {
  try {
    const s = JSON.parse(localStorage.getItem('hb-mock-session') ?? 'null') as { customerId?: string } | null;
    if (s?.customerId && loadDb().customers[s.customerId]) return s.customerId;
  } catch {
    /* privater Modus */
  }
  throw new DataError('not_found');
}

/** Unbezahlte Reservierungen verfallen nach Ablauf der Haltezeit (wie app.expire_unpaid) */
function expireUnpaid(db: MockDb) {
  const now = Date.now();
  for (const a of db.appointments) {
    if (a.holdKind !== 'payment' || a.status !== 'pending' || !a.holdExpiresAt || Date.parse(a.holdExpiresAt) > now) continue;
    a.status = 'cancelled';
    a.holdKind = null;
    for (const list of Object.values(extra(db).payments)) {
      for (const p of list) if (p.appointmentId === a.id && p.status === 'requires_payment') p.status = 'expired';
    }
  }
}

function requireCustomer(id: string): CustomerProfile {
  const c = loadDb().customers[id];
  if (!c) throw new DataError('not_found');
  return c;
}

export class MockDataAdapter implements DataAdapter {
  async listCategories() {
    return clone(categories).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async listServices(categoryId?: string) {
    return clone(services.filter((s) => !categoryId || s.categoryId === categoryId));
  }

  async getService(serviceId: string) {
    return clone(services.find((s) => s.id === serviceId) ?? null);
  }

  async listStaff(categoryId?: string) {
    return clone(staff.filter((m) => !categoryId || m.categories.some((c) => c === categoryId)));
  }

  async listAvailableSlots({ serviceId, staffId, date }: { serviceId: string; staffId: string | null; date: string }) {
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new DataError('not_found');
    const appointments = loadDb().appointments;
    const team = staff.filter((m) => m.categories.includes(service.categoryId) && (!staffId || m.id === staffId));
    const byTime = new Map<number, string>();
    // Reihenfolge je Tag variieren, damit „Keine Präferenz“ nicht immer dieselbe Person wählt
    const ordered = [...team].sort((a, b) => hash(date + a.id) - hash(date + b.id));
    for (const m of ordered) {
      for (const t of freeStarts(date, m.id, service.durationMinutes, appointments)) {
        if (!byTime.has(t)) byTime.set(t, m.id);
      }
    }
    return [...byTime.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, id]): Slot => ({ start: `${date}T${toHhmm(t)}`, staffId: id }));
  }

  async createCustomer(input: Parameters<DataAdapter['createCustomer']>[0]) {
    const db = loadDb();
    const email = input.email.trim().toLowerCase();
    if (Object.values(db.customers).some((c) => c.email === email)) throw new DataError('email_taken');
    const now = new Date().toISOString();
    const profile: CustomerProfile = {
      id: newId('cu'),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || null,
      language: input.language,
      notifyEmail: true,
      notifySms: false,
      marketingConsent: input.marketingConsent,
      marketingConsentAt: input.marketingConsent ? now : null,
      privacyNoticeAt: now,
      createdAt: now,
    };
    db.customers[profile.id] = profile;
    saveDb(db);
    return clone(profile);
  }

  async findCustomerIdByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return Object.values(loadDb().customers).find((c) => c.email === e)?.id ?? null;
  }

  async getProfile(customerId: string) {
    return clone(loadDb().customers[customerId] ?? null);
  }

  async updateProfile(customerId: string, patch: Parameters<DataAdapter['updateProfile']>[1]) {
    const db = loadDb();
    const current = requireCustomer(customerId);
    const next: CustomerProfile = { ...current, ...patch };
    if (patch.phone !== undefined) next.phone = patch.phone?.trim() || null;
    if (!next.phone) next.notifySms = false;
    if (patch.marketingConsent !== undefined && patch.marketingConsent !== current.marketingConsent) {
      next.marketingConsentAt = patch.marketingConsent ? new Date().toISOString() : null;
    }
    db.customers[customerId] = next;
    saveDb(db);
    return clone(next);
  }

  async listAppointments(customerId: string) {
    const db = loadDb();
    expireUnpaid(db);
    saveDb(db);
    return clone(
      db
        .appointments.filter((a) => a.customerId === customerId)
        .map(withDerivedStatus)
        .sort((a, b) => a.start.localeCompare(b.start)),
    );
  }

  async createAppointment(input: Parameters<DataAdapter['createAppointment']>[0]) {
    await wait(450);
    requireCustomer(input.customerId);
    const service = services.find((s) => s.id === input.serviceId);
    const member = staff.find((m) => m.id === input.staffId);
    if (!service || !member) throw new DataError('not_found');
    const db = loadDb();
    const date = input.start.slice(0, 10);
    const free = freeStarts(date, member.id, service.durationMinutes, db.appointments);
    if (!free.includes(toMin(input.start.slice(11, 16)))) throw new DataError('slot_taken');
    const appointment: Appointment = {
      id: newId('ap'),
      customerId: input.customerId,
      serviceId: service.id,
      serviceName: service.name,
      categoryId: service.categoryId,
      staffId: member.id,
      staffName: member.displayName,
      start: input.start,
      durationMinutes: service.durationMinutes,
      priceEur: service.priceEur,
      status: 'confirmed',
      payment: input.payment,
      createdAt: new Date().toISOString(),
    };
    db.appointments.push(appointment);
    saveDb(db);
    return clone(appointment);
  }

  async exportCustomerData(customerId: string) {
    const x = extra(loadDb());
    return {
      exportedAt: new Date().toISOString(),
      profile: clone(requireCustomer(customerId)),
      appointments: await this.listAppointments(customerId),
      customerNumber: x.accounts[customerId]?.customerNumber ?? null,
      chat: clone(x.chat[customerId] ?? []),
      waitlist: clone(x.waitlist[customerId] ?? []),
      waitlistOffers: clone(x.offers[customerId] ?? []),
      payments: clone(x.payments[customerId] ?? []),
      marketingConsents: clone(x.consents[customerId] ?? null),
      notificationPreferences: clone(x.prefs[customerId] ?? {}),
      pushDevices: (x.push[customerId] ?? []).map((p) => ({ userAgent: p.userAgent })),
      newsRead: clone(x.newsReads[customerId] ?? []),
    };
  }

  async deleteCustomer(customerId: string) {
    await wait(300);
    const db = loadDb();
    delete db.customers[customerId];
    db.appointments = db.appointments.filter((a) => a.customerId !== customerId);
    // inkl. Profilbild, Chat, Warteliste, Zahlungen und Push-Abos
    const x = extra(db);
    for (const area of [x.accounts, x.consents, x.prefs, x.chat, x.newsReads, x.waitlist, x.offers, x.payments, x.push]) {
      delete area[customerId];
    }
    saveDb(db);
  }

  // ---------------------------------------------------------------- Teil 3/4

  async getAccount(): Promise<Account> {
    const db = loadDb();
    const id = me();
    const x = extra(db);
    if (!x.accounts[id]) {
      const taken = new Set(Object.values(x.accounts).map((a) => a.customerNumber));
      x.accounts[id] = { customerNumber: newCustomerNumber(taken), avatar: null };
      saveDb(db);
    }
    return { customerNumber: x.accounts[id].customerNumber, avatarUrl: x.accounts[id].avatar, crmLinked: false };
  }

  async uploadAvatar(image: Blob): Promise<Account> {
    if (image.size > 2 * 1024 * 1024) throw new DataError('invalid');
    await this.getAccount();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new DataError('unknown'));
      r.readAsDataURL(image);
    });
    const db = loadDb();
    extra(db).accounts[me()]!.avatar = dataUrl;
    saveDb(db);
    return this.getAccount();
  }

  async removeAvatar(): Promise<Account> {
    await this.getAccount();
    const db = loadDb();
    extra(db).accounts[me()]!.avatar = null;
    saveDb(db);
    return this.getAccount();
  }

  async getConsents(): Promise<Consents> {
    const db = loadDb();
    const id = me();
    const c = requireCustomer(id);
    const stored = extra(db).consents[id];
    return clone(
      stored ?? {
        email: { granted: c.marketingConsent, changedAt: c.marketingConsentAt },
        sms: { granted: false, changedAt: null },
        push: { granted: false, changedAt: null },
      },
    );
  }

  async setConsent(channel: MarketingChannel, granted: boolean): Promise<Consents> {
    const next = await this.getConsents();
    next[channel] = { granted, changedAt: new Date().toISOString() };
    const db = loadDb();
    const id = me();
    extra(db).consents[id] = next;
    // E-Mail bleibt mit der Profil-Einwilligung aus Teil 1/2 synchron
    if (channel === 'email') {
      db.customers[id] = { ...db.customers[id]!, marketingConsent: granted, marketingConsentAt: granted ? next.email.changedAt : null };
    }
    saveDb(db);
    return clone(next);
  }

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    const stored = extra(loadDb()).prefs[me()] ?? {};
    const out = {} as NotificationPrefs;
    for (const kind of NOTIFY_KINDS) {
      out[kind] = {} as Record<Channel, boolean>;
      for (const ch of CHANNELS) out[kind][ch] = stored[kind]?.[ch] ?? defaultPref(kind, ch);
    }
    return out;
  }

  async setNotificationPref(kind: NotifyKind, channel: Channel, enabled: boolean): Promise<NotificationPrefs> {
    const db = loadDb();
    const prefs = (extra(db).prefs[me()] ??= {});
    (prefs[kind] ??= {})[channel] = enabled;
    saveDb(db);
    return this.getNotificationPrefs();
  }

  async getUnreadCounts(): Promise<UnreadCounts> {
    const [chat, news, offers] = await Promise.all([this.listChat(), this.listNews(), this.listOffers()]);
    return {
      chat: chat.filter((m) => m.sender === 'salon' && !m.readByCustomerAt).length,
      news: news.filter((n) => !n.read).length,
      offers: offers.length,
    };
  }

  async listChat(): Promise<ChatMessage[]> {
    return clone(extra(loadDb()).chat[me()] ?? []);
  }

  async sendChat(body: string): Promise<ChatMessage> {
    await wait(250);
    const text = body.trim();
    if (!text || text.length > 2000) throw new DataError('invalid');
    const db = loadDb();
    const msg: ChatMessage = {
      id: newId('ch'),
      sender: 'customer',
      senderName: null,
      body: text,
      createdAt: new Date().toISOString(),
      readByCustomerAt: null,
      readBySalonAt: null,
    };
    (extra(db).chat[me()] ??= []).push(msg);
    saveDb(db);
    return clone(msg);
  }

  async markChatRead(): Promise<void> {
    const db = loadDb();
    const now = new Date().toISOString();
    for (const m of extra(db).chat[me()] ?? []) if (m.sender === 'salon' && !m.readByCustomerAt) m.readByCustomerAt = now;
    saveDb(db);
  }

  async listNews(): Promise<NewsItem[]> {
    const x = extra(loadDb());
    const read = new Set(x.newsReads[me()] ?? []);
    const now = Date.now();
    return clone(
      x.news
        .filter((n) => !n.validUntil || Date.parse(n.validUntil) > now)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map((n) => ({ ...n, read: read.has(n.id) })),
    );
  }

  async markNewsRead(newsId: string): Promise<void> {
    const db = loadDb();
    const reads = (extra(db).newsReads[me()] ??= []);
    if (!reads.includes(newsId)) reads.push(newsId);
    saveDb(db);
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    return clone(extra(loadDb()).waitlist[me()] ?? []);
  }

  async joinWaitlist(e: NewWaitlistEntry): Promise<void> {
    await wait(300);
    if (!e.serviceIds.length || !e.weekdays.length || e.dateTo < e.dateFrom || e.timeTo <= e.timeFrom || e.dateFrom < todayIso()) {
      throw new DataError('invalid');
    }
    const picked = e.serviceIds.map((sid) => services.find((s) => s.id === sid));
    if (picked.some((s) => !s)) throw new DataError('not_found');
    const db = loadDb();
    const list = (extra(db).waitlist[me()] ??= []);
    if (list.length >= 10) throw new DataError('rate_limited');
    list.unshift({
      ...e,
      id: newId('wl'),
      serviceNames: picked.map((s) => s!.name),
      staffName: staff.find((m) => m.id === e.staffId)?.displayName ?? null,
      createdAt: new Date().toISOString(),
    });
    saveDb(db);
  }

  async leaveWaitlist(entryId: string): Promise<void> {
    const db = loadDb();
    const x = extra(db);
    const list = x.waitlist[me()] ?? [];
    if (!list.some((w) => w.id === entryId)) throw new DataError('not_found');
    x.waitlist[me()] = list.filter((w) => w.id !== entryId);
    saveDb(db);
  }

  /** Abgelaufene Angebote werden „sofort beim Lesen“ geschlossen – wie in der DB */
  private expireOffers(db: MockDb): WaitlistOffer[] {
    const offers = extra(db).offers[me()] ?? [];
    for (const o of offers) if (o.status === 'offered' && Date.parse(o.expiresAt) <= Date.now()) o.status = 'expired';
    return offers;
  }

  async listOffers(): Promise<WaitlistOffer[]> {
    const db = loadDb();
    const open = this.expireOffers(db).filter((o) => o.status === 'offered');
    saveDb(db);
    return clone(open);
  }

  async getOffer(offerId: string): Promise<WaitlistOffer> {
    const db = loadDb();
    const o = this.expireOffers(db).find((x) => x.id === offerId);
    saveDb(db);
    if (!o) throw new DataError('not_found');
    return clone(o);
  }

  async respondOffer(offerId: string, accept: boolean): Promise<OfferResult> {
    await wait(350);
    const db = loadDb();
    const o = (extra(db).offers[me()] ?? []).find((x) => x.id === offerId);
    if (!o) throw new DataError('not_found');
    if (o.status !== 'offered') throw new DataError('offer_closed');
    if (Date.parse(o.expiresAt) <= Date.now()) {
      o.status = 'expired';
      saveDb(db);
      return { result: 'expired' };
    }
    if (!accept) {
      o.status = 'declined';
      saveDb(db);
      return { result: 'declined' };
    }
    const service = services.find((s) => s.id === o.serviceId)!;
    const member = staff.find((m) => m.displayName === o.staffName) ?? staff[0]!;
    const appointment: Appointment = {
      id: newId('ap'),
      customerId: me(),
      serviceId: service.id,
      serviceName: service.name,
      categoryId: service.categoryId,
      staffId: member.id,
      staffName: member.displayName,
      start: o.start,
      durationMinutes: o.durationMinutes,
      priceEur: o.priceEur,
      status: 'confirmed',
      payment: 'in_salon',
      createdAt: new Date().toISOString(),
    };
    db.appointments.push(appointment);
    o.status = 'accepted';
    o.appointmentId = appointment.id;
    saveDb(db);
    return { result: 'booked', appointment: clone(appointment) };
  }

  private changeable(db: MockDb, appointmentId: string): Appointment {
    const a = db.appointments.find((x) => x.id === appointmentId && x.customerId === me());
    if (!a || (a.status !== 'confirmed' && a.status !== 'pending')) throw new DataError('not_found');
    if (wallToDate(a.start).getTime() - Date.now() < salon.changeNoticeHours * 3_600_000) throw new DataError('too_late');
    return a;
  }

  async cancelAppointment(appointmentId: string): Promise<CancelResult> {
    await wait(300);
    const db = loadDb();
    const a = this.changeable(db, appointmentId);
    a.status = 'cancelled';
    a.holdKind = null;
    let refundCents = 0;
    for (const p of extra(db).payments[me()] ?? []) {
      if (p.appointmentId !== a.id) continue;
      if (p.status === 'paid') {
        // rechtzeitig abgesagt → volle Erstattung (Frist wurde oben geprüft)
        p.status = 'refunded';
        p.refundCents = p.amountCents;
        refundCents += p.amountCents;
      } else if (p.status === 'requires_payment') p.status = 'cancelled';
    }
    saveDb(db);
    return { refundCents };
  }

  async rescheduleAppointment(appointmentId: string, start: string): Promise<Appointment> {
    await wait(350);
    const db = loadDb();
    const a = this.changeable(db, appointmentId);
    const others = db.appointments.filter((x) => x.id !== a.id);
    const free = freeStarts(start.slice(0, 10), a.staffId, a.durationMinutes, others);
    if (!free.includes(toMin(start.slice(11, 16)))) throw new DataError('slot_taken');
    a.start = start;
    saveDb(db);
    return clone(withDerivedStatus(a));
  }

  async getPaymentQuote(serviceId: string): Promise<PaymentQuote> {
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new DataError('not_found');
    const totalCents = Math.round(service.priceEur * 100);
    // Demo-Regel: Laser mit 30 % Anzahlung, alles andere vor Ort [PLATZHALTER: echte Regeln legt der Salon fest]
    const deposit = service.categoryId === 'laser';
    return {
      mode: deposit ? 'deposit_percent' : 'on_site',
      totalCents,
      dueOnlineCents: deposit ? Math.round(totalCents * 0.3) : 0,
      holdMinutes: PAYMENT_HOLD_MINUTES,
    };
  }

  async bookWithPayment(input: { serviceId: string; staffId: string; start: string }): Promise<BookingResult> {
    const quote = await this.getPaymentQuote(input.serviceId);
    const online = quote.dueOnlineCents > 0;
    const appointment = await this.createAppointment({
      customerId: me(),
      serviceId: input.serviceId,
      staffId: input.staffId,
      start: input.start,
      payment: online ? 'online_demo' : 'in_salon',
    });
    if (!online) return { appointment, payment: null };
    const db = loadDb();
    const a = db.appointments.find((x) => x.id === appointment.id)!;
    a.status = 'pending';
    a.holdKind = 'payment';
    a.holdExpiresAt = new Date(Date.now() + quote.holdMinutes * 60_000).toISOString();
    const payment: Payment = {
      id: newId('pay'),
      appointmentId: a.id,
      amountCents: quote.dueOnlineCents,
      currency: 'EUR',
      kind: quote.mode === 'full' ? 'full' : 'deposit',
      status: 'requires_payment',
      provider: 'mock',
      refundCents: 0,
      createdAt: new Date().toISOString(),
      paidAt: null,
    };
    (extra(db).payments[me()] ??= []).unshift(payment);
    saveDb(db);
    return { appointment: clone(a), payment: clone(payment) };
  }

  async listPayments(): Promise<Payment[]> {
    const db = loadDb();
    expireUnpaid(db);
    saveDb(db);
    return clone(extra(db).payments[me()] ?? []);
  }

  async completeTestPayment(paymentId: string): Promise<Payment> {
    await wait(600);
    const db = loadDb();
    expireUnpaid(db);
    const p = (extra(db).payments[me()] ?? []).find((x) => x.id === paymentId);
    if (!p) throw new DataError('not_found');
    if (p.status !== 'requires_payment') throw new DataError('too_late');
    p.status = 'paid';
    p.paidAt = new Date().toISOString();
    const a = db.appointments.find((x) => x.id === p.appointmentId);
    if (a) {
      a.status = 'confirmed';
      a.holdKind = null;
      a.holdExpiresAt = null;
    }
    saveDb(db);
    return clone(p);
  }

  async savePushSubscription(sub: PushSubscriptionInput): Promise<void> {
    const db = loadDb();
    const list = (extra(db).push[me()] ??= []).filter((s) => s.endpoint !== sub.endpoint);
    list.push(sub);
    extra(db).push[me()] = list;
    saveDb(db);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    const db = loadDb();
    const x = extra(db);
    x.push[me()] = (x.push[me()] ?? []).filter((s) => s.endpoint !== endpoint);
    saveDb(db);
  }
}
