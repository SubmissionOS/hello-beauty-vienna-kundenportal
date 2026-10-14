/**
 * Einstieg für die Anmeldung: `getAuth()`.
 * mock (Teil 1) oder supabase (Teil 2) – gewählt über NEXT_PUBLIC_AUTH_ADAPTER.
 * Die Implementierung wird erst beim ersten Aufruf geladen (eigener JS-Chunk, siehe lib/data/index.ts).
 */
import { env } from '../env';
import type { AuthAdapter, Session } from './types';

let instance: AuthAdapter | null = null;

/** Bittet den Browser, den App-Speicher (und damit die Sitzung) nicht bei Platzmangel zu räumen */
function keepStorage<T>(value: T): T {
  void navigator.storage?.persist?.().catch(() => {});
  return value;
}

function load(): Promise<AuthAdapter> {
  switch (env.authAdapter) {
    case 'supabase':
      return import('./supabase').then((m) => new m.SupabaseAuthAdapter());
    case 'mock':
    default:
      return import('./mock').then((m) => new m.MockAuthAdapter());
  }
}

export function getAuth(): AuthAdapter {
  if (instance) return instance;
  let loading: Promise<AuthAdapter> | null = null;
  const impl = () => (loading ??= load());
  instance = {
    getSession: async () => (await impl()).getSession(),
    onChange(listener: (s: Session | null) => void) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      impl().then((a) => {
        if (!cancelled) unsubscribe = a.onChange(listener);
      });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    register: async (input) => keepStorage(await (await impl()).register(input)),
    signIn: async (email, password, remember) => keepStorage(await (await impl()).signIn(email, password, remember)),
    requestPasswordReset: async (email) => (await impl()).requestPasswordReset(email),
    beginPasswordReset: async () => (await impl()).beginPasswordReset(),
    updatePassword: async (password) => keepStorage(await (await impl()).updatePassword(password)),
    signInDemo: async () => keepStorage(await (await impl()).signInDemo()),
    signOut: async () => (await impl()).signOut(),
  };
  return instance;
}

export * from './types';
