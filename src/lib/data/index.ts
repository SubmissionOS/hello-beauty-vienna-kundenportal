/**
 * Einstieg für alle Datenzugriffe der Oberfläche: `getData()`.
 * Teil 2: hier `case 'supabase': return new SupabaseDataAdapter(...)` ergänzen – sonst nichts.
 */
import { env } from '../env';
import type { DataAdapter } from './adapter';
import { MockDataAdapter } from './mock/adapter';

let instance: DataAdapter | null = null;

export function getData(): DataAdapter {
  if (instance) return instance;
  switch (env.dataAdapter) {
    case 'mock':
    default:
      instance = new MockDataAdapter();
  }
  return instance;
}

export type { DataAdapter } from './adapter';
export * from './types';
