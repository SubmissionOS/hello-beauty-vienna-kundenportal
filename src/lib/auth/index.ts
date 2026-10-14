/**
 * Einstieg für die Anmeldung: `getAuth()`.
 * Teil 2: hier `case 'supabase': return new SupabaseAuthAdapter(...)` ergänzen – sonst nichts.
 */
import { env } from '../env';
import { MockAuthAdapter } from './mock';
import type { AuthAdapter } from './types';

let instance: AuthAdapter | null = null;

export function getAuth(): AuthAdapter {
  if (instance) return instance;
  switch (env.authAdapter) {
    case 'mock':
    default:
      instance = new MockAuthAdapter();
  }
  return instance;
}

export * from './types';
