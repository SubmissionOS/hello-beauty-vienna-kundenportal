'use client';

import { useEffect, useRef, useState } from 'react';

type LoadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' };
type Result<T> = { key: string; ok: true; data: T } | { key: string; ok: false };

/**
 * Lädt Daten über lib/data. `key` beschreibt die Abfrage – ändert er sich, wird neu geladen
 * (bis dahin „loading“). `reload` lädt im Hintergrund neu, die alten Daten bleiben sichtbar.
 */
export function useLoad<T>(load: (() => Promise<T>) | null, key: string) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) return;
    let alive = true;
    fn()
      .then((data) => alive && setResult({ key, ok: true, data }))
      .catch(() => alive && setResult({ key, ok: false }));
    return () => {
      alive = false;
    };
  }, [key, tick, load === null]); // eslint-disable-line react-hooks/exhaustive-deps -- `load` wird über die Ref gelesen

  const state: LoadState<T> =
    result && result.key === key ? (result.ok ? { status: 'ready', data: result.data } : { status: 'error' }) : { status: 'loading' };

  return { state, reload: () => setTick((n) => n + 1) };
}
