'use client';

import { IconWifiOff } from '@/components/icons';
import { Monogram } from '@/components/logo';
import { useI18n } from '@/lib/i18n/use-i18n';

/** Wird vom Service Worker ohne Netz ausgeliefert. Enthält bewusst keine persönlichen Daten. */
export default function OfflinePage() {
  const { t } = useI18n();
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'center',
        gap: 16,
        padding: '32px 24px calc(32px + var(--safe-bottom))',
        textAlign: 'center',
      }}
    >
      {/* Monogramm wie das App-Symbol (helle Kachel mit Rundung) – im Dunkelmodus bewusst als Kachel, nicht als Fleck */}
      <span style={{ display: 'grid', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-cells)' }}>
        <Monogram size={72} />
      </span>
      <IconWifiOff size={28} className="muted" />
      <h1>{t.offline.title}</h1>
      <p className="muted" style={{ maxWidth: 340 }}>
        {t.offline.text}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        {t.common.retry}
      </button>
    </main>
  );
}
