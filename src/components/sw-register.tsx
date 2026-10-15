'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/use-i18n';
import { watchSystemTheme } from '@/lib/theme';

/**
 * Globale Client-Aufgaben: Service Worker registrieren (nur Produktions-Build, damit die Entwicklung
 * nicht aus dem Cache läuft), auf neue Versionen prüfen und bei Darstellung „Automatisch“ dem System folgen.
 *
 * Update wie in nativen Apps: Jede Auslieferung hat eine eigene SW-URL (/sw.js?v=<Build>). Eine neue Version
 * wartet, bis „Jetzt aktualisieren“ getippt wird → SKIP_WAITING → controllerchange → einmal neu laden.
 * Geprüft wird beim Öffnen und wenn die App wieder in den Vordergrund kommt.
 */
const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'}`;
const RELOAD_FLAG = 'hb-sw-reloading';

/** Ungespeicherte Eingaben seit dem letzten Absenden/Seitenwechsel (vor dem Neuladen warnen) */
let dirty = false;
/** Nur nach Tipp auf „Jetzt aktualisieren“ neu laden – nicht, wenn die erste Installation die Seite übernimmt */
let updateRequested = false;

export function SwRegister() {
  const { t } = useI18n();
  const path = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => watchSystemTheme(), []);

  useEffect(() => {
    dirty = false;
  }, [path]);

  useEffect(() => {
    const onInput = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest('form')) dirty = true;
    };
    const onSubmit = () => {
      dirty = false;
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // nach dem Neuladen durch ein Update: Merker zurücksetzen (verhindert Endlos-Schleifen)
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* privater Modus */
    }
    let reg: ServiceWorkerRegistration | null = null;

    /**
     * Nur eine ECHTE neue Version meldet sich: Es läuft schon eine (controller) und die wartende hat eine andere
     * Versionsnummer im Skript-Pfad (?v=…). Safari meldet gelegentlich auch dieselbe Version als „wartend“ –
     * die wird still übernommen (ohne Hinweis, ohne Neuladen), die allererste Installation ebenso.
     */
    const offer = (sw: ServiceWorker) => {
      const current = navigator.serviceWorker.controller;
      if (!current) return;
      if (current.scriptURL !== sw.scriptURL) setWaiting(sw);
      else sw.postMessage({ type: 'SKIP_WAITING' });
    };
    const watch = (r: ServiceWorkerRegistration) => {
      // schon eine wartende Version (z. B. aus einem früheren Besuch)
      if (r.waiting) offer(r.waiting);
      r.addEventListener('updatefound', () => {
        const sw = r.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed') offer(sw);
        });
      });
    };

    const register = () =>
      navigator.serviceWorker
        .register(SW_URL, { scope: '/', updateViaCache: 'none' })
        .then((r) => {
          reg = r;
          watch(r);
        })
        .catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    const check = () => {
      if (document.visibilityState === 'visible') reg?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);

    const onControllerChange = () => {
      if (!updateRequested) return;
      try {
        if (sessionStorage.getItem(RELOAD_FLAG)) return;
        sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch {
        /* ohne Speicher trotzdem genau einmal: der Listener entfernt sich selbst */
      }
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      document.removeEventListener('visibilitychange', check);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  const update = () => {
    if (dirty && !window.confirm(t.update.unsaved)) return;
    setUpdating(true);
    updateRequested = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <div className="update-bar" role="status" data-testid="update-bar">
      {updating ? (
        <span>
          <span className="spinner" aria-hidden="true" /> {t.update.updating}
        </span>
      ) : (
        <>
          <span>{t.update.available}</span>
          <button type="button" className="btn btn-primary" onClick={update}>
            {t.update.action}
          </button>
        </>
      )}
    </div>
  );
}
