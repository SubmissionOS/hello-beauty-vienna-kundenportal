/* eslint-disable @next/next/no-img-element -- kleine lokale Bilder im Mockup */
import type { CSSProperties } from 'react';
import type { Dict } from '@/lib/i18n';
import { AppMini, cx, Finger, Glyph, PageMini, Splash, StatusBar, toneOf } from './mock-parts';
import { iosTargets, type IosLayer, type Phase, type IosTarget } from './timeline';
import s from './phone.module.css';

/** Mittelpunkte der Home-Bildschirm-Raster (4 Spalten) */
const colX = [58, 150.33, 242.67, 335];
const rowY = (r: number) => 72 + r * 102;

const keyRows = ['QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNM'];

interface Props {
  variant: 'ios26' | 'legacy';
  phase: Phase<IosTarget, IosLayer>;
  ringKey: string;
  host: string;
  t: Dict['mock'];
  width: number;
  still?: boolean;
}

/** iPhone mit Safari – spielt „Zum Home-Bildschirm“ nach. Nicht bedienbar (aria-hidden, pointer-events: none). */
export function IosMockup({ variant, phase, ringKey, host, t, width, still }: Props) {
  const on = (l: IosLayer) => String(phase.layers.includes(l));
  const home = phase.layers.includes('home');
  const splash = phase.layers.includes('splash');
  const [fx, fy] = iosTargets[phase.at];
  const icon = iosTargets.icon;

  return (
    <div
      className={s.device}
      style={{ '--pw': width } as CSSProperties}
      data-instant={String(!!phase.instant)}
      data-still={String(!!still)}
      aria-hidden="true"
    >
      <div className={s.scaler}>
        <div className={s.iphone}>
          <span className={s.sideBtn} style={{ left: -3, top: 150, height: 30 }} />
          <span className={s.sideBtn} style={{ left: -3, top: 210, height: 58 }} />
          <span className={s.sideBtn} style={{ left: -3, top: 282, height: 58 }} />
          <span className={s.sideBtn} style={{ right: -3, top: 230, height: 92 }} />
          <div className={s.screen}>
            {/* Home-Bildschirm (unter Safari) */}
            <div className={s.home} data-on={String(home)}>
              <div className={s.wallpaper} />
              {t.apps.map((label, i) => (
                <div key={label} className={s.appIcon} style={{ left: colX[i % 4]! - 31, top: rowY(Math.floor(i / 4)) }}>
                  <span className={s.appIconImg} style={toneOf(i)}>
                    <Glyph i={i} />
                  </span>
                  {label}
                </div>
              ))}
              <div className={cx(s.appIcon, s.newIcon)} data-on={on('icon')} style={{ left: icon[0] - 31, top: icon[1] - 31 }}>
                <span className={s.appIconImg}>
                  <img src="/icons/apple-touch-icon.png" alt="" width={62} height={62} />
                </span>
                Hello Beauty
              </div>
              <div className={s.searchPill}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.5 15.5 5 5" />
                </svg>
                {t.search}
              </div>
              <div className={s.dock}>
                {[0, 3, 6, 7].map((i) => (
                  <span key={i} className={s.appIconImg} style={toneOf(i + 2)}>
                    <Glyph i={i + 4} />
                  </span>
                ))}
              </div>
            </div>

            {/* Safari mit allen Sheets */}
            <div className={s.browserApp} data-out={String(home)}>
              <PageMini t={t} />
              {variant === 'ios26' ? (
                <div className={s.bar26}>
                  <span className={cx(s.glass, s.glassBtn)}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 5-7 7 7 7" />
                    </svg>
                  </span>
                  <span className={cx(s.glass, s.glassPill)}>
                    <svg className={s.lockIcon} width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                      <path d="M3 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 11 7.5v5A1.5 1.5 0 0 1 9.5 14h-7A1.5 1.5 0 0 1 1 12.5v-5A1.5 1.5 0 0 1 2.5 6H3Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
                    </svg>
                    {host}
                  </span>
                  <span className={cx(s.glass, s.glassBtn)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5.5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="18.5" cy="12" r="2" />
                    </svg>
                  </span>
                </div>
              ) : (
                <div className={s.legacyBars}>
                  <div className={s.legacyAddress}>
                    <span className={s.aa}>AA</span>
                    <svg className={s.lockIcon} width="11" height="13" viewBox="0 0 12 14" fill="currentColor">
                      <path d="M3 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 11 7.5v5A1.5 1.5 0 0 1 9.5 14h-7A1.5 1.5 0 0 1 1 12.5v-5A1.5 1.5 0 0 1 2.5 6H3Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
                    </svg>
                    {host}
                  </div>
                  <div className={s.legacyTools}>
                    <ToolIcon d="m15 5-7 7 7 7" />
                    <ToolIcon d="m9 5 7 7-7 7" disabled />
                    <ToolIcon d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
                    <ToolIcon d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5ZM12 6.5V20" />
                    <ToolIcon d="M7.5 7.5h11v11h-11zM5.5 15.5v-10h10" />
                  </div>
                </div>
              )}

              {variant === 'ios26' && (
                <div className={s.menu} data-on={on('menu')}>
                  <MenuItem label={t.share} d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
                  <MenuItem label={t.addBookmark} d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5ZM12 6.5V20" />
                  <MenuItem label={t.addFavorites} d="m12 4 2.4 5 5.3.6-4 3.7 1.1 5.3L12 16l-4.8 2.6 1.1-5.3-4-3.7 5.3-.6Z" />
                  <MenuItem label={t.findOnPage} d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.5 15.5l5 5" />
                  <MenuItem label={t.desktopSite} d="M3.5 5h17v11h-17zM9 20h6M12 16v4" />
                  <MenuItem label={t.newTab} d="M12 5v14M5 12h14" />
                </div>
              )}

              <div className={s.dim} data-on={on('dim')} />

              <div className={s.share} data-on={on('share')} data-back={on('add')}>
                <div className={s.shareInner} data-scrolled={on('scrolled')}>
                  <div className={s.shareHead}>
                    <span className={s.shareIcon}>
                      <img src="/icons/apple-touch-icon.png" alt="" width={52} height={52} />
                    </span>
                    <span>
                      <div className={s.shareTitle}>Hello Beauty</div>
                      <div className={s.shareSub}>
                        {host} · {t.options} ›
                      </div>
                    </span>
                    <span className={s.shareClose}>
                      <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </span>
                  </div>
                  <div className={s.shareApps}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={s.shareApp}>
                        <span className={s.shareAppIcon} style={toneOf(i + 3)}>
                          <Glyph i={i + 6} size={28} />
                        </span>
                        {t.apps[(i + 6) % t.apps.length]}
                      </span>
                    ))}
                  </div>
                  <div className={s.shareList}>
                    <ShareRow label={t.copy} d="M8.5 8.5h11v11h-11zM15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
                    <ShareRow label={t.readingList} d="M6.5 13a3.5 3.5 0 1 0 0 .01M17.5 13a3.5 3.5 0 1 0 0 .01M10 13h4" />
                    <ShareRow label={t.addBookmark} d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5ZM12 6.5V20" />
                    <ShareRow label={t.addFavorites} d="m12 4 2.4 5 5.3.6-4 3.7 1.1 5.3L12 16l-4.8 2.6 1.1-5.3-4-3.7 5.3-.6Z" />
                    <ShareRow label={t.quickNote} d="M5 4.5h14v15H5zM8.5 9h7M8.5 13h7M8.5 17h4" />
                    <ShareRow label={t.findOnPage} d="M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM15.5 15.5l5 5" />
                    <ShareRow label={t.addToHome} d="M5 5h14v14H5zM12 8.5v7M8.5 12h7" />
                    <ShareRow label={t.print} d="M7 9V4h10v5M7 17H5v-8h14v8h-2M7 14h10v6H7z" />
                  </div>
                </div>
              </div>

              <div className={s.add} data-on={on('add')}>
                <div className={s.addNav}>
                  <span style={{ color: 'var(--m-ios-blue)' }}>
                    {t.cancel}
                  </span>
                  <span style={{ fontWeight: 600 }}>{t.addToHome}</span>
                  <span style={{ justifySelf: 'end', color: 'var(--m-ios-blue)', fontWeight: 600 }}>{t.add}</span>
                </div>
                <div className={s.addCard}>
                  <span className={s.addIcon}>
                    <img src="/icons/apple-touch-icon.png" alt="" width={62} height={62} />
                  </span>
                  <span className={s.addFields}>
                    <span className={s.addName}>
                      Hello Beauty
                      <span className={s.caret} />
                    </span>
                    <span className={s.addUrl} style={{ display: 'block' }}>
                      https://{host}/app
                    </span>
                  </span>
                </div>
                <p className={s.addNote}>{t.a2hsNote}</p>
                <div className={s.addToggleRow}>
                  {t.webApp}
                  <span className={s.iosSwitch} />
                </div>
              </div>
              <div className={s.keyboard} data-on={on('add')}>
                {keyRows.map((row, r) => (
                  <div key={row} className={s.keyRow}>
                    {r === 2 && <span className={cx(s.key, s.keyDark)} style={{ width: 44 }} />}
                    {[...row].map((k) => (
                      <span key={k} className={s.key}>
                        {k.toLowerCase()}
                      </span>
                    ))}
                    {r === 2 && <span className={cx(s.key, s.keyDark)} style={{ width: 44 }} />}
                  </div>
                ))}
                <div className={s.keyRow}>
                  <span className={cx(s.key, s.keyDark)}>123</span>
                  <span className={cx(s.key, s.keyWide)} />
                  <span className={cx(s.key, s.keyDark)}>⏎</span>
                </div>
              </div>
            </div>

            <Splash on={splash} origin={icon} />
            <AppMini on={phase.layers.includes('app')} t={t} />

            <StatusBar light={home && !splash} />
            <div className={s.island} />
            <div className={cx(s.homeIndicator, home && !splash && s.homeIndicatorLight)} />
            <Finger x={fx} y={fy} mode={phase.finger} ringKey={ringKey} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolIcon({ d, disabled }: { d: string; disabled?: boolean }) {
  return (
    <svg className={disabled ? 'disabled' : undefined} style={disabled ? { color: 'var(--m-ios-disabled)' } : undefined} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function MenuItem({ label, d }: { label: string; d: string }) {
  return (
    <div className={s.menuItem}>
      {label}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  );
}

function ShareRow({ label, d }: { label: string; d: string }) {
  return (
    <div className={s.shareRow}>
      {label}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  );
}
