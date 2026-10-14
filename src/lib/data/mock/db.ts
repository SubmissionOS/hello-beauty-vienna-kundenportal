/**
 * Mock-Datenbank im localStorage des Geräts – nur für Teil 1 (Demo/Test).
 * Wird von MockDataAdapter und MockAuthAdapter gemeinsam genutzt. Teil 2 ersetzt beides durch Supabase.
 */
import { addDays, nowWall, todayIso, weekday } from '../../format';
import type {
  Appointment,
  Channel,
  ChatMessage,
  Consents,
  CustomerProfile,
  NewsItem,
  NotifyKind,
  Payment,
  PushSubscriptionInput,
  WaitlistEntry,
  WaitlistOffer,
} from '../types';
import { services, staff } from './catalog';

export interface MockDb {
  version: 1;
  customers: Record<string, CustomerProfile>;
  appointments: Appointment[];
  /** Teil 3/4 – fehlt in älteren Ständen, wird über extra() ergänzt */
  extra?: MockExtra;
}

export interface MockExtra {
  accounts: Record<string, { customerNumber: string; avatar: string | null }>;
  consents: Record<string, Consents>;
  prefs: Record<string, Partial<Record<NotifyKind, Partial<Record<Channel, boolean>>>>>;
  chat: Record<string, ChatMessage[]>;
  news: Omit<NewsItem, 'read'>[];
  newsReads: Record<string, string[]>;
  waitlist: Record<string, WaitlistEntry[]>;
  offers: Record<string, WaitlistOffer[]>;
  payments: Record<string, Payment[]>;
  push: Record<string, PushSubscriptionInput[]>;
  demoSeeded?: boolean;
}

const KEY = 'hb-mock-db-v1';
let memory: MockDb | null = null;

const empty = (): MockDb => ({ version: 1, customers: {}, appointments: [] });

export function loadDb(): MockDb {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as MockDb) : null;
    memory = parsed?.version === 1 ? parsed : empty();
  } catch {
    memory = empty();
  }
  return memory;
}

export function saveDb(db: MockDb) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* Speicher voll oder gesperrt: bleibt im Arbeitsspeicher */
  }
}

export function newId(prefix: string): string {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${rnd[0]!.toString(36)}${rnd[1]!.toString(36)}`;
}

export const DEMO_CUSTOMER_ID = 'demo-lena';
export const DEMO_EMAIL = 'lena.musterfrau@example.com';

/** Nächster Werktag (Mo–Sa) ab einem Datum. */
function workday(iso: string): string {
  return weekday(iso) === 0 ? addDays(iso, 1) : iso;
}

/** Legt die Demo-Kundin mit Terminen relativ zu heute an (immer aktuell, egal wann vorgeführt wird). */
export function ensureDemoCustomer(db: MockDb): MockDb {
  if (db.customers[DEMO_CUSTOMER_ID]) return ensureDemoExtras(db);
  const today = todayIso();
  const now = new Date().toISOString();
  db.customers[DEMO_CUSTOMER_ID] = {
    id: DEMO_CUSTOMER_ID,
    firstName: 'Lena',
    lastName: 'Musterfrau',
    email: DEMO_EMAIL,
    phone: '+43 660 0000000',
    language: 'de',
    notifyEmail: true,
    notifySms: false,
    marketingConsent: false,
    marketingConsentAt: null,
    privacyNoticeAt: now,
    createdAt: now,
  };
  const plan: [number, string, string, string][] = [
    [-80, '10:00', 's-15', 'st-petra'],
    [-46, '16:30', 's-03', 'st-ivana'],
    [-18, '11:00', 's-04', 'st-ivana'],
    [3, '14:30', 's-02', 'st-reka'],
    [24, '10:00', 's-07', 'st-petra'],
  ];
  for (const [offset, time, serviceId, staffId] of plan) {
    const service = services.find((x) => x.id === serviceId)!;
    const member = staff.find((x) => x.id === staffId)!;
    const start = `${workday(addDays(today, offset))}T${time}`;
    db.appointments.push({
      id: newId('ap'),
      customerId: DEMO_CUSTOMER_ID,
      serviceId,
      serviceName: service.name,
      categoryId: service.categoryId,
      staffId,
      staffName: member.displayName,
      start,
      durationMinutes: service.durationMinutes,
      priceEur: service.priceEur,
      status: start < nowWall() ? 'completed' : 'confirmed',
      payment: 'in_salon',
      createdAt: now,
    });
  }
  return ensureDemoExtras(db);
}

// ---------------------------------------------------------------- Teil 3/4

const NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne 0/O/1/I wie in der DB

export function newCustomerNumber(taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const n = `HB-${[...bytes].map((b) => NUMBER_ALPHABET[b % NUMBER_ALPHABET.length]).join('')}`;
    if (!taken.has(n)) return n;
  }
}

/** Ergänzt die Teil-3/4-Bereiche (ältere Mock-Stände haben sie noch nicht) */
export function extra(db: MockDb): MockExtra {
  db.extra ??= {
    accounts: {},
    consents: {},
    prefs: {},
    chat: {},
    news: [],
    newsReads: {},
    waitlist: {},
    offers: {},
    payments: {},
    push: {},
  };
  return db.extra;
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function demoAppointment(serviceId: string, staffId: string, start: string, now: string): Appointment {
  const service = services.find((x) => x.id === serviceId)!;
  const member = staff.find((x) => x.id === staffId)!;
  return {
    id: newId('ap'),
    customerId: DEMO_CUSTOMER_ID,
    serviceId,
    serviceName: service.name,
    categoryId: service.categoryId,
    staffId,
    staffName: member.displayName,
    start,
    durationMinutes: service.durationMinutes,
    priceEur: service.priceEur,
    status: 'confirmed',
    payment: 'in_salon',
    createdAt: now,
  };
}

/**
 * Demo-Inhalte für Teil 4: Kundennummer, 3 Neuigkeiten, Chat, Warteliste, ein bezahlter und ein offener Test-Termin.
 * Bei jedem Demo-Login bekommt Lena ein frisches Wartelisten-Angebot (Countdown läuft beim Öffnen)
 * und – falls verfallen – wieder einen Termin mit offener Test-Zahlung.
 */
export function ensureDemoExtras(db: MockDb): MockDb {
  const x = extra(db);
  const today = todayIso();
  const now = new Date().toISOString();
  const id = DEMO_CUSTOMER_ID;
  if (!x.demoSeeded) {
    x.demoSeeded = true;
    x.accounts[id] ??= { customerNumber: 'HB-7KQ4MZ', avatar: null };
    x.consents[id] = {
      email: { granted: false, changedAt: null },
      sms: { granted: false, changedAt: null },
      push: { granted: false, changedAt: null },
    };
    x.news = [
      {
        id: 'nw-1',
        kind: 'offer',
        title: 'Wimpernlifting −15 %',
        body: 'Im Herbst gibt es 15 % auf jedes Wimpernlifting. Einfach in der App buchen, der Rabatt wird im Salon abgezogen.',
        imageUrl: '/photos/cosmetics.webp',
        validUntil: minutesFromNow(14 * 24 * 60),
        publishedAt: minutesFromNow(-60),
      },
      {
        id: 'nw-2',
        kind: 'news',
        title: 'Neue Shellac-Farben sind da',
        body: 'Zwölf neue Herbstfarben warten im Salon. Fragen Sie bei Ihrem nächsten Termin danach.',
        imageUrl: '/photos/nails.webp',
        validUntil: null,
        publishedAt: minutesFromNow(-26 * 60),
      },
      {
        id: 'nw-3',
        kind: 'free_slot',
        title: 'Termin frei: Pediküre',
        body: 'Bei Ivana ist kurzfristig ein Termin für Pediküre frei geworden. Jetzt in der App buchen.',
        imageUrl: null,
        validUntil: minutesFromNow(2 * 24 * 60),
        publishedAt: minutesFromNow(-3 * 24 * 60),
      },
    ];
    x.newsReads[id] = ['nw-3'];
    x.chat[id] = [
      {
        id: newId('ch'),
        sender: 'customer',
        senderName: null,
        body: 'Hallo! Haben Sie die Shellac-Farbe „Bordeaux“ wieder lagernd?',
        createdAt: minutesFromNow(-26 * 60),
        readByCustomerAt: null,
        readBySalonAt: minutesFromNow(-25 * 60),
      },
      {
        id: newId('ch'),
        sender: 'salon',
        senderName: 'Petra',
        body: 'Hallo Lena, ja – seit heute wieder da. Wir legen sie Ihnen für den nächsten Termin bereit. Liebe Grüße, Petra',
        createdAt: minutesFromNow(-90),
        readByCustomerAt: null,
        readBySalonAt: null,
      },
    ];
    x.waitlist[id] = [
      {
        id: 'wl-demo',
        serviceIds: ['s-15'],
        serviceNames: ['Wimpernlifting'],
        staffId: null,
        staffName: null,
        dateFrom: today,
        dateTo: addDays(today, 21),
        weekdays: [1, 2, 3, 4, 5, 6],
        timeFrom: '09:00',
        timeTo: '19:00',
        shortNotice: true,
        createdAt: minutesFromNow(-3 * 24 * 60),
      },
    ];
    // bezahlter Test-Termin (Laser mit Online-Anzahlung)
    const paid = { ...demoAppointment('s-18', 'st-reka', `${workday(addDays(today, 9))}T12:00`, now), payment: 'online_demo' as const };
    db.appointments.push(paid);
    x.payments[id] = [
      {
        id: newId('pay'),
        appointmentId: paid.id,
        amountCents: 1800,
        currency: 'EUR',
        kind: 'deposit',
        status: 'paid',
        provider: 'mock',
        refundCents: 0,
        createdAt: now,
        paidAt: now,
      },
    ];
  }

  // offener Test-Termin mit ausstehender Zahlung – nach Ablauf bei jedem Demo-Login neu
  const payments = (x.payments[id] ??= []);
  const openPay = payments.find((p) => p.status === 'requires_payment');
  const openAppt = openPay && db.appointments.find((a) => a.id === openPay.appointmentId);
  if (!openAppt || !openAppt.holdExpiresAt || Date.parse(openAppt.holdExpiresAt) <= Date.now()) {
    const appt: Appointment = {
      ...demoAppointment('s-20', 'st-petra', `${workday(addDays(today, 12))}T15:00`, now),
      status: 'pending',
      payment: 'online_demo',
      holdKind: 'payment',
      holdExpiresAt: minutesFromNow(15),
    };
    db.appointments.push(appt);
    payments.unshift({
      id: newId('pay'),
      appointmentId: appt.id,
      amountCents: 2700,
      currency: 'EUR',
      kind: 'deposit',
      status: 'requires_payment',
      provider: 'mock',
      refundCents: 0,
      createdAt: now,
      paidAt: null,
    });
  }

  // frisches Wartelisten-Angebot: 12 Minuten Antwortzeit
  const offers = (x.offers[id] ??= []);
  if (!offers.some((o) => o.status === 'offered' && Date.parse(o.expiresAt) > Date.now())) {
    const service = services.find((s) => s.id === 's-15')!;
    offers.unshift({
      id: newId('of'),
      status: 'offered',
      serviceId: service.id,
      serviceName: service.name,
      staffName: 'Réka',
      start: `${workday(addDays(today, 2))}T11:00`,
      durationMinutes: service.durationMinutes,
      priceEur: service.priceEur,
      offeredAt: now,
      expiresAt: minutesFromNow(12),
      appointmentId: null,
    });
  }
  return db;
}
