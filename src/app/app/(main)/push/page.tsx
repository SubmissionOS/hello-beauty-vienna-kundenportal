'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { BackLink } from '@/components/app/back-link';
import st from '@/components/app/app.module.css';
import { IconBell, IconCheck } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

/**
 * Erklär-Screen vor der Mitteilungs-Erlaubnis. Erst der Tipp auf „Erlauben“ löst die Systemabfrage aus –
 * nie beim ersten Laden, und nur in der installierten App (iOS erlaubt Web-Push nur dort).
 */
export default function PushPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);

  if (!state) return <PageSkeleton />;

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    setError(false);
    try {
      setState(await fn());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const blocked: Partial<Record<PushState, string>> = {
    unsupported: t.push.unsupported,
    'not-installed': t.push.installFirst,
    'not-configured': t.push.notConfigured,
    denied: t.push.denied,
  };

  return (
    <AppPage title={t.push.title} action={<BackLink href="/app/profil" />}>
      <div className={`card ${st.pushCard}`}>
        <span className={st.doneIcon} aria-hidden="true">
          <IconBell size={34} />
        </span>
        <p>{t.push.lead}</p>
        <ul className={st.checkList}>
          {t.push.points.map((p) => (
            <li key={p}>
              <IconCheck size={20} aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
        <p className="hint">{t.push.note}</p>
      </div>

      {state === 'on' ? (
        <>
          <p className="alert alert-success" role="status">
            {t.push.enabled}
          </p>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => run(disablePush)} disabled={busy}>
            {t.push.disable}
          </button>
        </>
      ) : blocked[state] ? (
        <>
          <p className="alert alert-info" role="status" data-testid="push-blocked">
            {blocked[state]}
          </p>
          {state === 'not-installed' && (
            <Link href="/installieren" className="btn btn-secondary btn-lg btn-block">
              {t.push.toInstall}
            </Link>
          )}
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => run(enablePush)} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t.push.allow}
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => router.back()}>
            {t.push.later}
          </button>
        </>
      )}
      {error && (
        <p className="alert alert-error" role="alert">
          {t.push.error}
        </p>
      )}
    </AppPage>
  );
}
