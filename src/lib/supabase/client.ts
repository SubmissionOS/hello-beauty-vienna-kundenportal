import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sessionStore } from '../auth/remember';

/**
 * Supabase im Browser – nur mit dem öffentlichen Publishable Key; die Daten schützt RLS.
 * Sitzung im localStorage (bzw. sessionStorage bei „Angemeldet bleiben“ AUS) der jeweiligen Umgebung:
 * keine Cookies, automatische Token-Erneuerung. Der Tenant ergibt sich in der DB aus dem Origin der Seite.
 */
let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen');
  client = createClient(url, key, {
    auth: {
      storageKey: 'hb-auth',
      storage: sessionStore,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Fehlertext einer Postgres-Funktion (raise exception '<code>') */
export function dbErrorCode(error: { message?: string } | null): string | null {
  return error?.message?.match(/^[a-z_]+$/)?.[0] ?? (error ? 'unknown' : null);
}
