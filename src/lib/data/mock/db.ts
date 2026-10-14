/**
 * Mock-Datenbank im localStorage des Geräts – nur für Teil 1 (Demo/Test).
 * Wird von MockDataAdapter und MockAuthAdapter gemeinsam genutzt. Teil 2 ersetzt beides durch Supabase.
 */
import { addDays, nowWall, todayIso, weekday } from '../../format';
import type { Appointment, CustomerProfile } from '../types';
import { services, staff } from './catalog';

export interface MockDb {
  version: 1;
  customers: Record<string, CustomerProfile>;
  appointments: Appointment[];
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
  if (db.customers[DEMO_CUSTOMER_ID]) return db;
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
  return db;
}
