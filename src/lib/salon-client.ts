'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Appointment, ChatMessage, WaitlistOffer } from './data/types';

/**
 * Salon-Bereich (/salon): eigener Supabase-Client mit eigenem Sitzungsspeicher, damit Salon- und
 * Kundinnen-Anmeldung auf demselben Gerät getrennt bleiben. Zugriff nur für Einträge in salon_members
 * (DB prüft jede Funktion mit app.is_salon_member()).
 */
let client: SupabaseClient | null = null;

export function salonDb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('supabase_not_configured');
  client = createClient(url, key, {
    auth: { storageKey: 'hb-salon-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export const salonAvailable = () => process.env.NEXT_PUBLIC_DATA_ADAPTER === 'supabase' && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface Member {
  tenantId: string;
  displayName: string;
  role: 'owner' | 'staff';
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await salonDb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function currentMember(): Promise<Member | null> {
  const { data: s } = await salonDb().auth.getSession();
  if (!s.session) return null;
  const { data } = await salonDb()
    .from('salon_members')
    .select('tenant_id, display_name, role')
    .eq('user_id', s.session.user.id)
    .maybeSingle();
  return data ? { tenantId: data.tenant_id, displayName: data.display_name, role: data.role } : null;
}

export async function salonSignIn(email: string, password: string): Promise<Member | null> {
  const { error } = await salonDb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(error.status === 429 ? 'rate_limited' : 'invalid_credentials');
  const m = await currentMember();
  if (!m) await salonDb().auth.signOut({ scope: 'local' });
  return m;
}

export async function salonDemoSignIn(): Promise<Member | null> {
  const res = await fetch('/api/salon/demo-login', { method: 'POST' });
  if (!res.ok) throw new Error('demo_unavailable');
  const tokens = (await res.json()) as { access_token: string; refresh_token: string };
  const { error } = await salonDb().auth.setSession(tokens);
  if (error) throw new Error('demo_unavailable');
  return currentMember();
}

export const salonSignOut = () => salonDb().auth.signOut({ scope: 'local' });

// ---------------------------------------------------------------- Nachrichten
export interface Thread {
  customerId: string;
  name: string;
  lastAt: string;
  lastBody: string;
  unread: number;
}
export const listThreads = () => rpc<Thread[]>('salon_chat_threads');

export async function listMessages(customerId: string): Promise<ChatMessage[]> {
  const { data, error } = await salonDb()
    .from('chat_messages')
    .select('id, sender, sender_name, body, created_at, read_by_customer_at, read_by_salon_at')
    .eq('customer_id', customerId)
    .order('created_at')
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    sender: r.sender,
    senderName: r.sender_name,
    body: r.body,
    createdAt: r.created_at,
    readByCustomerAt: r.read_by_customer_at,
    readBySalonAt: r.read_by_salon_at,
  }));
}
export const sendMessage = (customerId: string, body: string) => rpc('salon_send_chat_message', { p_customer_id: customerId, p_body: body });
export const markRead = (customerId: string) => rpc('salon_mark_chat_read', { p_customer_id: customerId });

// ---------------------------------------------------------------- Neuigkeiten
export interface SalonNews {
  id: string;
  kind: 'news' | 'offer' | 'free_slot';
  title: string;
  body: string;
  imagePath: string | null;
  validUntil: string | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  createdAt: string;
}
export const listNews = () => rpc<SalonNews[]>('salon_news_list');
export const saveNews = (n: { id: string | null; kind: SalonNews['kind']; title: string; body: string; imagePath: string | null; validUntil: string | null }) =>
  rpc<SalonNews>('salon_news_save', {
    p_id: n.id,
    p_kind: n.kind,
    p_title: n.title,
    p_body: n.body,
    p_image_path: n.imagePath,
    p_valid_until: n.validUntil,
  });
export const publishNews = (id: string) => rpc<SalonNews>('salon_news_publish', { p_id: id });

export async function uploadNewsImage(tenantId: string, image: Blob): Promise<string> {
  const ext = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
  const path = `${tenantId}/news-${Date.now()}.${ext}`;
  const { error } = await salonDb().storage.from('news-images').upload(path, image, { contentType: image.type });
  if (error) throw new Error('upload_failed');
  return path;
}
export const newsImageUrl = (path: string) => salonDb().storage.from('news-images').getPublicUrl(path).data.publicUrl;

// ---------------------------------------------------------------- Warteliste & Termine
export interface SalonWaitEntry {
  id: string;
  customerId: string;
  customerNumber: string;
  name: string;
  serviceNames: string[];
  staffName: string | null;
  dateFrom: string;
  dateTo: string;
  weekdays: number[];
  timeFrom: string;
  timeTo: string;
  shortNotice: boolean;
  createdAt: string;
}
export type SalonOffer = WaitlistOffer & { customerId: string };
export const listWaitlist = () => rpc<{ entries: SalonWaitEntry[]; offers: SalonOffer[] }>('salon_waitlist');

export type SalonAppointment = Omit<Appointment, 'holdKind'> & { customerName: string; customerNumber: string; holdKind: 'payment' | 'waitlist_offer' | null };
export const listUpcoming = () => rpc<SalonAppointment[]>('salon_upcoming_appointments');
/** Slot freigeben: Termin wird frei, die Warteliste bekommt ihn (Kaskade) */
export const releaseSlot = (id: string) => rpc('salon_release_slot', { p_appointment_id: id });
/** Salon sagt ab: Erstattung nach Regel, Slot geht ebenfalls an die Warteliste */
export const cancelBySalon = (id: string) => rpc('salon_cancel_appointment', { p_appointment_id: id });
