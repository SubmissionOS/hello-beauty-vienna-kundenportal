'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { AllLangs } from '@/components/all-langs';
import { IconArrowDown, IconCheck, IconCopy, IconExternal } from '@/components/icons';
import { LangSwitch } from '@/components/lang-switch';
import { LogoWide, Monogram } from '@/components/logo';
import { useHydrated } from '@/lib/client-store';
import { appOrigin } from '@/lib/env';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { legalUrl } from '@/lib/salon';
import { detectPlatform, type PlatformInfo } from './platform';
import { withIcons } from './with-icons';
import st from './install.module.css';

/** Erst nach dem ersten Paint geladen: Animationen und QR-Bibliothek gehören nicht ins Start-Bundle. */
const Guide = dynamic(() => import('./guide').then((m) => m.Guide), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 360 }} aria-hidden="true" />,
});
const QrCode = dynamic(() => import('@/components/qr-code').then((m) => m.QrCode), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ width: 260, height: 260 }} aria-hidden="true" />,
});

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
declare global {
  interface Window {
    __hbInstallPrompt?: BeforeInstallPromptEvent | null;
    __hbInstalled?: boolean;
  }
}

/** Ziel des QR-Codes. Erkennt das Gerät und zeigt den passenden Weg. Fragt nie nach einem Login. */
export function InstallPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const info = useMemo(() => (hydrated ? detectPlatform(navigator.userAgent, window.location.search) : null), [hydrated]);
  const host = useMemo(() => (hydrated ? new URL(appOrigin()).host : ''), [hydrated]);

  useEffect(() => {
    if (info?.kind === 'standalone') router.replace('/app');
  }, [info, router]);

  if (!info || info.kind === 'standalone') return <Shell standalone={info?.kind === 'standalone'} />;
  if (info.kind === 'desktop') return <DesktopShow host={host} />;

  return (
    <Shell>
      {info.kind === 'ios' && <IosSection info={info} host={host} />}
      {info.kind === 'android' && <AndroidSection host={host} />}
      {info.kind === 'inapp' && <InAppSection info={info} />}
    </Shell>
  );
}

function Shell({ children, standalone }: { children?: React.ReactNode; standalone?: boolean }) {
  const { t, lang } = useI18n();
  const hydrated = useHydrated();
  return (
    <div className={st.page}>
      <header className={st.top}>
        <LogoWide priority />
        {hydrated && <LangSwitch />}
      </header>
      <main className={st.main}>
        <div className={st.hero}>
          <p className="eyebrow">
            <AllLangs pick={(d) => d.install.desktop.kicker} />
          </p>
          <h1 className={st.h1}>
            <AllLangs pick={(d) => d.install.title} />
          </h1>
          <p className={st.lead}>{standalone ? t.install.standalone : <AllLangs pick={(d) => d.install.lead} />}</p>
        </div>
        {children ?? (
          <div className={st.skeletonWrap} aria-hidden="true">
            <div className="skeleton" style={{ height: 52 }} />
            <div className="skeleton" style={{ height: 320 }} />
          </div>
        )}
      </main>
      <footer className={st.footer}>
        <a href={legalUrl('imprint', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.imprint}
        </a>
        <a href={legalUrl('privacy', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.privacy}
        </a>
      </footer>
    </div>
  );
}

function Benefits() {
  const { t } = useI18n();
  return (
    <ul className={st.benefits}>
      {t.install.benefits.map((b) => (
        <li key={b}>
          <IconCheck size={18} />
          {b}
        </li>
      ))}
    </ul>
  );
}

function IosSection({ info, host }: { info: PlatformInfo; host: string }) {
  const { t } = useI18n();
  return (
    <>
      {info.iosOtherBrowser && <p className="alert alert-info">{t.install.ios.otherBrowser}</p>}
      <Guide kind="ios" host={host} ios26={info.ios26} width={160} />
      <p className="hint">{t.install.ios.intro}</p>
      <div className={st.arrow} aria-hidden="true">
        <span>{t.install.ios.arrow}</span>
        <IconArrowDown size={22} />
      </div>
    </>
  );
}

function AndroidSection({ host }: { host: string }) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(() => window.__hbInstallPrompt ?? null);
  const [installed, setInstalled] = useState<boolean>(() => !!window.__hbInstalled);
  const [slow, setSlow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = () => setPrompt(window.__hbInstallPrompt ?? null);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('hb:installprompt', onPrompt);
    window.addEventListener('hb:installed', onInstalled);
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => {
      window.removeEventListener('hb:installprompt', onPrompt);
      window.removeEventListener('hb:installed', onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    setDismissed(false);
    // prompt() muss direkt im Klick-Handler aufgerufen werden (Nutzergeste)
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    window.__hbInstallPrompt = null;
    setPrompt(null);
    if (outcome === 'accepted') setInstalled(true);
    else setDismissed(true);
  };

  if (installed) {
    return (
      <div className={st.success} role="status">
        <div className={st.successIcon}>
          <Monogram size={64} />
          <span className={st.successCheck}>
            <IconCheck size={18} />
          </span>
        </div>
        <h2 className={st.h2}>{t.install.android.successTitle}</h2>
        <p className={st.lead}>{t.install.android.successText}</p>
      </div>
    );
  }

  return (
    <>
      <Benefits />
      <button type="button" className={`btn btn-primary btn-lg btn-block ${st.cta}`} onClick={install} disabled={!prompt} aria-busy={!prompt}>
        {prompt ? (
          t.install.android.button
        ) : (
          <>
            <span className="spinner" aria-hidden="true" />
            {t.install.android.preparing}
          </>
        )}
      </button>
      {dismissed && <p className="hint">{t.install.android.dismissed}</p>}
      {slow && !prompt && (
        <div className={st.fallback}>
          <p className={st.intro}>
            <strong>{t.install.android.slowHint}</strong> {t.install.android.manual}
          </p>
          <Guide kind="android" host={host} width={168} />
        </div>
      )}
    </>
  );
}

function InAppSection({ info }: { info: PlatformInfo }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = `${appOrigin()}/installieren`;
  const bare = url.replace(/^https?:\/\//, '');
  const isIos = info.os === 'ios';
  const openHref = isIos
    ? `x-safari-${url}`
    : `intent://${bare}#Intent;scheme=${url.startsWith('https') ? 'https' : 'http'};package=com.android.chrome;end`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <div className={st.inapp}>
      <h2 className={st.h2}>{t.install.inapp.title}</h2>
      <p>{fmt(t.install.inapp.text, { app: info.inAppName ?? t.install.inapp.genericApp })}</p>
      <p className="muted">{withIcons(isIos ? t.install.inapp.howIos : t.install.inapp.howAndroid)}</p>
      <a className="btn btn-primary btn-lg btn-block" href={openHref}>
        <IconExternal size={20} />
        {isIos ? t.install.inapp.openSafari : t.install.inapp.openChrome}
      </a>
      <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={copy}>
        {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
        {copied ? t.install.inapp.copied : t.install.inapp.copy}
      </button>
      <p className={st.url}>{url}</p>
      <span className="visually-hidden" role="status">
        {copied ? t.install.inapp.copied : ''}
      </span>
    </div>
  );
}

/** Laptop beim Kundentermin: QR groß, iOS und Android nebeneinander in Endlosschleife. */
function DesktopShow({ host }: { host: string }) {
  const { t, lang } = useI18n();
  const url = `${appOrigin()}/installieren`;
  return (
    <div className={st.show}>
      <header className={st.showTop}>
        <LogoWide priority />
        <LangSwitch />
      </header>
      <main className={st.showMain}>
        <section className={st.showIntro}>
          <p className="eyebrow">{t.install.desktop.kicker}</p>
          <h1 className={st.showH1}>{t.install.desktop.title}</h1>
          <p className={st.lead}>{t.install.desktop.text}</p>
          <figure className={st.qrCard}>
            <QrCode value={url} size={260} label={`QR-Code: ${url}`} />
            <figcaption>
              <strong>{t.install.desktop.scan}</strong>
              <span className={st.url}>{url.replace(/^https?:\/\//, '')}</span>
            </figcaption>
          </figure>
        </section>
        <section className={st.showPhones} aria-label={t.install.guide.mockupLabel}>
          <div className={st.showCol}>
            <p className={st.showLabel}>{t.install.desktop.iphone}</p>
            <Guide kind="ios" host={host} ios26 width={215} show />
          </div>
          <div className={st.showCol}>
            <p className={st.showLabel}>{t.install.desktop.android}</p>
            <Guide kind="android" host={host} width={215} show />
          </div>
        </section>
      </main>
      <footer className={st.footer}>
        <a href={legalUrl('imprint', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.imprint}
        </a>
        <a href={legalUrl('privacy', lang)} target="_blank" rel="noopener noreferrer">
          {t.common.privacy}
        </a>
      </footer>
    </div>
  );
}
