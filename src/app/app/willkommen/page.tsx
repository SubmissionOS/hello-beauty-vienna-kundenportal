'use client';

/* eslint-disable @next/next/no-img-element -- vorab skaliertes Foto */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthFrame } from '@/components/app/auth-frame';
import st from '@/components/app/app.module.css';
import { getAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { useI18n } from '@/lib/i18n/use-i18n';

export default function WelcomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const demo = async () => {
    setBusy(true);
    await getAuth().signInDemo();
    router.replace('/app');
  };

  return (
    <AuthFrame>
      <div className={st.welcome}>
        <img className={st.welcomePhoto} src="/photos/nails.webp" alt="" width={640} height={480} fetchPriority="high" />
        <h1 className={st.title}>{t.welcome.title}</h1>
        <p className="muted" style={{ maxWidth: 340 }}>
          {t.welcome.lead}
        </p>
      </div>
      <div className={st.welcomeActions}>
        <Link href="/app/registrieren" className="btn btn-primary btn-lg btn-block">
          {t.welcome.register}
        </Link>
        <Link href="/app/anmelden" className="btn btn-secondary btn-lg btn-block">
          {t.welcome.login}
        </Link>
        {env.demoMode && (
          <button type="button" className="btn btn-ghost btn-block" onClick={demo} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t.welcome.demo}
          </button>
        )}
      </div>
    </AuthFrame>
  );
}
