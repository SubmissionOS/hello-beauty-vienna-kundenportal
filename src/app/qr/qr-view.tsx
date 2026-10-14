'use client';

import { LogoWide } from '@/components/logo';
import { QrCode } from '@/components/qr-code';
import { useHydrated } from '@/lib/client-store';
import { appOrigin } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './qr.module.css';

/** Druckbarer QR-Code auf <Origin>/installieren. Origin zur Laufzeit, überschreibbar mit NEXT_PUBLIC_APP_URL. */
export function QrView() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const url = hydrated ? `${appOrigin()}/installieren` : '';

  return (
    <main className={st.page}>
      <div className={st.sheet}>
        <LogoWide priority />
        <h1 className={st.title}>{t.qr.title}</h1>
        <p className={st.text}>{t.qr.text}</p>
        <div className={st.code}>{url ? <QrCode value={url} size={320} label={`QR-Code: ${url}`} /> : <div className="skeleton" style={{ width: 320, height: 320 }} />}</div>
        <p className={st.url}>{url.replace(/^https?:\/\//, '')}</p>
      </div>
      <div className={st.actions}>
        <p className="hint">{t.qr.hint}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!url}>
          {t.qr.print}
        </button>
      </div>
    </main>
  );
}
