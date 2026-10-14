/**
 * Einstieg für die Anmeldung: `getAuth()`.
 * mock (Teil 1) oder supabase (Teil 2) – gewählt über NEXT_PUBLIC_AUTH_ADAPTER.
 */
import { env } from '../env';
import { MockAuthAdapter } from './mock';
import { SupabaseAuthAdapter } from './supabase';
import type { AuthAdapter } from './types';

let instance: AuthAdapter | null = null;

export function getAuth(): AuthAdapter {
  if (instance) return instance;
  switch (env.authAdapter) {
    case 'supabase':
      instance = new SupabaseAuthAdapter();
      break;
    case 'mock':
    default:
      instance = new MockAuthAdapter();
  }
  return instance;
}

export * from './types';
