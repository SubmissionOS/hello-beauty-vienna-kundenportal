'use client';

import { useEffect } from 'react';
import { watchSystemTheme } from '@/lib/theme';

/**
 * Globale Client-Aufgaben: Service Worker registrieren (nur Produktions-Build, damit die Entwicklung
 * nicht aus dem Cache läuft) und bei Darstellung „Automatisch“ dem System folgen.
 */
export function SwRegister() {
  useEffect(() => watchSystemTheme(), []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
