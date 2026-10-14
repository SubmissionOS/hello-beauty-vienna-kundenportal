import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from './env';

/** Demo-Kundin (angelegt von scripts/seed.mjs über die Admin-API) */
export const DEMO_EMAIL = 'lena.musterfrau@example.com';

const url = () => {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error('NEXT_PUBLIC_SUPABASE_URL fehlt');
  return u;
};
const publishableKey = () => {
  const k = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!k) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt');
  return k;
};

/**
 * Origin aus dem Host der eingehenden Anfrage. Die DB leitet daraus den Tenant ab (app.current_tenant()) –
 * so kommt der Tenant immer vom Server, nie aus einem Parameter des Clients.
 */
export function originFromRequest(req: Request): string {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]!.trim();
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${host}`;
}

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** Secret Key: umgeht RLS – nur für eng begrenzte Serveraufgaben (Konto löschen). */
export function supabaseAdmin(): SupabaseClient {
  return createClient(url(), serverEnv.supabaseSecretKey(), { auth: noSession });
}

/** Mit Publishable Key und optionalem Nutzer-Token, Tenant über den Origin der Anfrage. */
export function supabaseAs(origin: string, accessToken?: string): SupabaseClient {
  const headers: Record<string, string> = { Origin: origin };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return createClient(url(), publishableKey(), { auth: noSession, global: { headers } });
}
