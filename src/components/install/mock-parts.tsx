/* eslint-disable @next/next/no-img-element -- Mockup nutzt kleine lokale Bilder, kein Optimierer */
import type { CSSProperties } from 'react';
import type { Dict } from '@/lib/i18n';
import type { FingerMode } from './timeline';
import s from './phone.module.css';

export const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** Signal, WLAN, Akku – selbst gezeichnet */
export function StatusIcons({ android = false }: { android?: boolean }) {
  return (
    <span className={s.statusIcons} aria-hidden="true">
      <svg width={android ? 16 : 19} height="12" viewBox="0 0 19 12" fill="currentColor">
        <rect x="0" y="8" width="3.2" height="4" rx="1" />
        <rect x="5" y="5.5" width="3.2" height="6.5" rx="1" />
        <rect x="10" y="3" width="3.2" height="9" rx="1" />
        <rect x="15" y="0" width="3.2" height="12" rx="1" />
      </svg>
      <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
        <path d="M8.5 2.2c2.5 0 4.8 1 6.5 2.6l1.3-1.4A10.9 10.9 0 0 0 8.5.3 10.9 10.9 0 0 0 .7 3.4L2 4.8a9 9 0 0 1 6.5-2.6Z" />
        <path d="M8.5 5.8c1.5 0 2.9.6 4 1.6l1.3-1.4a7.6 7.6 0 0 0-10.6 0l1.3 1.4c1.1-1 2.5-1.6 4-1.6Z" />
        <path d="M8.5 9.2c.6 0 1.1.2 1.5.6L8.5 11.5 7 9.8c.4-.4.9-.6 1.5-.6Z" />
      </svg>
      {android ? (
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <rect x="3" y="0" width="4" height="2" rx="0.5" />
          <rect x="0" y="1.5" width="10" height="14.5" rx="2" />
        </svg>
      ) : (
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="18" height="9" rx="2.4" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" fillOpacity="0.45" />
        </svg>
      )}
    </span>
  );
}

export function StatusBar({ light, android = false }: { light: boolean; android?: boolean }) {
  const content = (
    <>
      <span>9:41</span>
      <StatusIcons android={android} />
    </>
  );
  return (
    <>
      <div className={cx(s.status, android && s.statusAndroid)} style={{ opacity: light ? 0 : 1 }}>
        {content}
      </div>
      <div className={cx(s.status, android && s.statusAndroid, s.statusLight)} style={{ opacity: light ? 1 : 0 }}>
        {content}
      </div>
    </>
  );
}

export function Finger({
  x,
  y,
  mode,
  ringKey,
}: {
  x: number;
  y: number;
  mode: FingerMode;
  ringKey: string;
}) {
  return (
    <div
      className={s.finger}
      data-visible={String(mode !== 'hidden')}
      data-mode={mode}
      style={{ transform: `translate(${x - 23}px, ${y - 23}px)` }}
    >
      <span className={s.fingerDot} />
      {mode === 'tap' && <span key={ringKey} className={s.fingerRing} />}
    </div>
  );
}

/** Miniatur der echten Installationsseite (im Browser des Mockups) */
export function PageMini({ t, android = false, button }: { t: Dict['mock']; android?: boolean; button?: string }) {
  return (
    <div className={cx(s.page, android && s.pageAndroid)}>
      <img className={s.pageLogo} src="/brand/monogramm-gold.png" alt="" />
      <p className={s.pageTitle}>{t.pageTitle}</p>
      <p className={s.pageLead}>{t.pageLead}</p>
      {button ? (
        <div className={s.pageBtn}>{button}</div>
      ) : (
        <div className={s.pageLines}>
          <div className={s.pageLine} style={{ width: '80%', margin: '0 auto' }} />
          <div className={s.pageLine} style={{ width: '64%', margin: '0 auto' }} />
        </div>
      )}
      <img className={s.pagePhoto} src="/photos/nails.webp" alt="" />
    </div>
  );
}

export function Splash({ on, origin, round = false }: { on: boolean; origin: [number, number]; round?: boolean }) {
  return (
    <div className={s.splash} data-on={String(on)} style={{ transformOrigin: `${origin[0]}px ${origin[1]}px` }}>
      <img
        src={round ? '/icons/icon-maskable-192.png' : '/brand/monogramm-gold.png'}
        alt=""
        width={round ? 132 : 128}
        height={round ? 132 : 128}
        style={round ? { borderRadius: '50%' } : undefined}
      />
    </div>
  );
}

const tabGlyph = (d: string) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export function AppMini({ on, t }: { on: boolean; t: Dict['mock'] }) {
  return (
    <div className={s.appMini} data-on={String(on)}>
      <img src="/brand/logo-quer-gold.png" alt="" width={150} height={33} />
      <p className={s.appMiniHello}>{t.appHello}</p>
      <p className={s.appMiniLabel}>{t.appNext}</p>
      <div className={s.appMiniCard}>
        <div className={s.appMiniDate}>14:30</div>
        <div className={s.appMiniService}>{t.appService}</div>
        <div className={s.appMiniWhen}>{t.appWhen}</div>
      </div>
      <div className={s.appMiniTabs}>
        <span>{tabGlyph('M3.5 10.5 12 3.5l8.5 7M5.5 9v10.5h4.5v-6h4v6h4.5V9')}</span>
        <span>{tabGlyph('M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4')}</span>
        <span>{tabGlyph('M12 3.25a8.75 8.75 0 1 0 0 17.5 8.75 8.75 0 0 0 0-17.5zM12 8v8M8 12h8')}</span>
        <span>{tabGlyph('M12 4.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5')}</span>
      </div>
    </div>
  );
}

/** Neutrale App-Symbole für den Home-Bildschirm (keine fremden Marken) */
const glyphs = [
  'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
  'M4 18l5-6 4 4 3-3 4 5M15 8.5a1.5 1.5 0 1 0 0-.01',
  'M4 8h3l2-2.5h6L17 8h3v11H4zM12 10.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  'M12 5v1.5M12 17.5V19M5 12h1.5M17.5 12H19M7.2 7.2l1 1M15.8 15.8l1 1M7.2 16.8l1-1M15.8 8.2l1-1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  'M12 20s-5.5-4.8-5.5-9.5a5.5 5.5 0 0 1 11 0C17.5 15.2 12 20 12 20zM12 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  'M6 4h12v16H6zM9 9h6M9 13h6M9 17h3',
  'M10 17V6l9-2v11M10 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  'M5 5.5A1.5 1.5 0 0 1 6.5 4H12v16H6.5A1.5 1.5 0 0 1 5 18.5zM12 4h5.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12',
  'M6 4h12v16H6zM8.5 7h7v3h-7zM9 13h.01M12 13h.01M15 13h.01M9 16.5h.01M12 16.5h.01M15 16.5h.01',
];
const TONES = 10; // Farben: --m-tone-1 … --m-tone-10 in src/styles/tokens.css

export function Glyph({ i, size = 30 }: { i: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={glyphs[i % glyphs.length]} />
    </svg>
  );
}

export const toneOf = (i: number): CSSProperties => ({ background: `var(--m-tone-${(i % TONES) + 1})` });
