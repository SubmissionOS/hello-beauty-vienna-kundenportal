import { dbErrorCode, supabaseBrowser } from '../../supabase/client';
import type { DataAdapter } from '../adapter';
import {
  DataError,
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

function fail(error: { message?: string } | null): never {
  const code = dbErrorCode(error);
  throw new DataError(code === 'slot_taken' || code === 'not_found' || code === 'email_taken' ? code : 'unknown');
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

const toAppointment = (r: Row): Appointment => ({
  id: r.id as string,
  customerId: r.customer_id as string,
  serviceId: r.service_id as string,
  serviceName: r.service_name as string,
  categoryId: r.category_key as CategoryId,
  staffId: r.staff_id as string,
  staffName: r.staff_name as string,
  start: r.start as string,
  durationMinutes: r.duration_minutes as number,
  priceEur: Number(r.price_eur),
  status: r.status as Appointment['status'],
  payment: r.payment as Appointment['payment'],
  createdAt: r.created_at as string,
});

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

  async listAppointments(customerId: string): Promise<Appointment[]> {
    const { data, error } = await this.db.from('my_appointments').select('*').eq('customer_id', customerId).order('start');
    if (error) fail(error);
    return data.map(toAppointment);
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
    const { data, error } = await this.db.rpc('export_my_data');
    if (error) fail(error);
    const out = data as CustomerExport;
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
}
