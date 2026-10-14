import { de } from './de';
import { en } from './en';
import { hu } from './hu';
import type { Lang } from './config';

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? Widen<U>[]
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type Dict = Widen<typeof de>;

export const dicts: Record<Lang, Dict> = { de, en, hu };

/** Ersetzt {name}-Platzhalter. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

export * from './config';
