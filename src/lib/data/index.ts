/**
 * Einstieg für alle Datenzugriffe der Oberfläche: `getData()`.
 * mock (Teil 1, localStorage) oder supabase (Teil 2) – gewählt über NEXT_PUBLIC_DATA_ADAPTER.
 */
import { env } from '../env';
import type { DataAdapter } from './adapter';
import { MockDataAdapter } from './mock/adapter';
import { SupabaseDataAdapter } from './supabase/adapter';

let instance: DataAdapter | null = null;

export function getData(): DataAdapter {
  if (instance) return instance;
  switch (env.dataAdapter) {
    case 'supabase':
      instance = new SupabaseDataAdapter();
      break;
    case 'mock':
    default:
      instance = new MockDataAdapter();
  }
  return instance;
}

export type { DataAdapter } from './adapter';
export * from './types';
