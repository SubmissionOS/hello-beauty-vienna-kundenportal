'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { IconAlert, IconWifiOff } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** true, solange das Gerät online ist (Server-Rendering: online) */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Fehler- bzw. Offline-Zustand eines Bildschirms; lädt automatisch neu, sobald das Netz zurück ist. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const online = useOnline();
  useEffect(() => {
    if (!online) {
      const again = () => onRetry();
      window.addEventListener('online', again, { once: true });
      return () => window.removeEventListener('online', again);
    }
  }, [online, onRetry]);
  return (
    <div className={`card ${st.empty}`} role="alert" data-testid="load-error">
      <span className={st.stateIcon} aria-hidden="true">
        {online ? <IconAlert size={28} /> : <IconWifiOff size={28} />}
      </span>
      <p className={st.stateTitle}>{online ? t.state.errorTitle : t.state.offlineTitle}</p>
      <p className="muted">{online ? t.state.errorText : t.state.offlineText}</p>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>
        {t.state.retry}
      </button>
    </div>
  );
}
