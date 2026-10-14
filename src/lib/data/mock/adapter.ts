import { addDays, nowWall, todayIso, wallToDate, weekday } from '../../format';
import { salon } from '../../salon';
import type { DataAdapter } from '../adapter';
import { DataError, type Appointment, type CustomerProfile, type Slot } from '../types';
import { categories, services, staff } from './catalog';
import { loadDb, newId, saveDb } from './db';

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
    return clone(
      loadDb()
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
    return {
      exportedAt: new Date().toISOString(),
      profile: clone(requireCustomer(customerId)),
      appointments: await this.listAppointments(customerId),
    };
  }

  async deleteCustomer(customerId: string) {
    await wait(300);
    const db = loadDb();
    delete db.customers[customerId];
    db.appointments = db.appointments.filter((a) => a.customerId !== customerId);
    saveDb(db);
  }
}
