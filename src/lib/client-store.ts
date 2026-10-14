'use client';

import { useSyncExternalStore } from 'react';

/**
 * Winziger Store für Client-Zustand (Sprache, Darstellung, Sitzung).
 * Server-Rendering bekommt immer `serverValue`; im Browser wird `init` beim ersten Lesen ausgeführt.
 */
export function createClientStore<T>(init: () => T, serverValue: T) {
  let value: T | undefined;
  let loaded = false;
  const listeners = new Set<() => void>();

  const get = (): T => {
    if (!loaded) {
      value = init();
      loaded = true;
    }
    return value as T;
  };
  const set = (next: T) => {
    value = next;
    loaded = true;
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  const use = (): T => useSyncExternalStore(subscribe, get, () => serverValue);

  return { get, set, subscribe, use };
}

const noop = () => () => {};
/** true erst nach der Hydrierung – für Inhalte, die vom Gerät abhängen. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
