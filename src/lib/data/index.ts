/**
 * Einstieg für alle Datenzugriffe der Oberfläche: `getData()`.
 * mock (Teil 1, localStorage) oder supabase (Teil 2) – gewählt über NEXT_PUBLIC_DATA_ADAPTER.
 * Die Implementierung wird erst beim ersten Aufruf geladen (eigener JS-Chunk): Supabase belastet so weder
 * den ersten Seitenaufbau noch den Mock-Betrieb.
 */
import { env } from '../env';
import type { DataAdapter } from './adapter';

let instance: DataAdapter | null = null;

function load(): Promise<DataAdapter> {
  switch (env.dataAdapter) {
    case 'supabase':
      return import('./supabase/adapter').then((m) => new m.SupabaseDataAdapter());
    case 'mock':
    default:
      return import('./mock/adapter').then((m) => new m.MockDataAdapter());
  }
}

export function getData(): DataAdapter {
  if (instance) return instance;
  let loading: Promise<DataAdapter> | null = null;
  const adapter = () => (loading ??= load());
  // Alle Methoden der Schnittstelle sind asynchron – der Proxy reicht sie an die geladene Implementierung weiter
  instance = new Proxy({} as DataAdapter, {
    get: (_target, method: string) =>
      // kein „then“: sonst würde der Proxy fälschlich als Promise behandelt
      method === 'then'
        ? undefined
        : async (...args: unknown[]) => {
            const impl = (await adapter()) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
            return impl[method]!(...args);
          },
  });
  return instance;
}

export type { DataAdapter } from './adapter';
export * from './types';
