'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconChevronLeft } from '@/components/icons';
import { LangSwitch } from '@/components/lang-switch';
import { LogoWide } from '@/components/logo';
import { useSession } from '@/lib/auth/use-session';
import { useHydrated } from '@/lib/client-store';
import { useI18n } from '@/lib/i18n/use-i18n';
import { legalUrl } from '@/lib/salon';
import st from './app.module.css';

/**
 * Rahmen für Begrüßung, Anmeldung und Registrierung. Mit Sitzung geht es direkt in die App –
 * außer mit `stay` (Seite „Neues Passwort“: dort entsteht die Sitzung schon beim Öffnen des Links).
 */
export function AuthFrame({ back, stay, children }: { back?: string; stay?: boolean; children: React.ReactNode }) {
  const { t, lang } = useI18n();
  const hydrated = useHydrated();
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!stay && session.status === 'in') router.replace('/app');
  }, [stay, session.status, router]);

  return (
    <div className={st.auth}>
      <div className={st.authTop}>
        {back ? (
          <Link href={back} className="btn btn-ghost" style={{ paddingLeft: 0 }}>
            <IconChevronLeft size={22} />
            {t.common.back}
          </Link>
        ) : (
          <LogoWide priority />
        )}
        {hydrated && <LangSwitch />}
      </div>
      <main className={st.authMain}>{children}</main>
      <nav className={st.legalLinks} aria-label={t.profile.legal}>
        <a href={legalUrl('imprint', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.imprint}
        </a>
        <a href={legalUrl('privacy', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.privacy}
        </a>
      </nav>
    </div>
  );
}
