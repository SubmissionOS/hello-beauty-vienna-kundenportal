/* eslint-disable @next/next/no-img-element -- kleine lokale Bilder im Mockup */
import type { CSSProperties } from 'react';
import type { Dict } from '@/lib/i18n';
import { AppMini, cx, Finger, Glyph, PageMini, Splash, StatusBar, toneOf } from './mock-parts';
import { androidTargets, type AndroidLayer, type AndroidTarget, type Phase } from './timeline';
import s from './phone.module.css';

const colX = [66.5, 159.5, 252.5, 345.5];

interface Props {
  phase: Phase<AndroidTarget, AndroidLayer>;
  ringKey: string;
  host: string;
  t: Dict['mock'];
  buttonLabel: string;
  dateLabel: string;
  width: number;
  still?: boolean;
}

/** Android-Gerät mit Chrome – „App hinzufügen“ → „Installieren“ → Symbol. Nicht bedienbar. */
export function AndroidMockup({ phase, ringKey, host, t, buttonLabel, dateLabel, width, still }: Props) {
  const on = (l: AndroidLayer) => String(phase.layers.includes(l));
  const home = phase.layers.includes('home');
  const splash = phase.layers.includes('splash');
  const [fx, fy] = androidTargets[phase.at];
  const icon = androidTargets.icon;

  return (
    <div
      className={cx(s.device, s.deviceAndroid)}
      style={{ '--pw': width } as CSSProperties}
      data-instant={String(!!phase.instant)}
      data-still={String(!!still)}
      aria-hidden="true"
    >
      <div className={s.scaler}>
        <div className={s.pixel}>
          <span className={s.sideBtn} style={{ right: -3, top: 190, height: 60 }} />
          <span className={s.sideBtn} style={{ right: -3, top: 290, height: 110 }} />
          <div className={s.screenAndroid}>
            <div className={s.home} data-on={String(home)}>
              <div className={cx(s.wallpaper, s.wallpaperAndroid)} />
              <div className={s.glance}>{dateLabel}</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className={s.droidIcon} style={{ left: colX[i]! - 40, top: icon[1] - 28 }}>
                  <span className={s.droidIconImg} style={toneOf(i + 1)}>
                    <Glyph i={i + 1} size={26} />
                  </span>
                  {t.apps[i + 1]}
                </div>
              ))}
              <div className={cx(s.droidIcon, s.newIcon)} data-on={on('icon')} style={{ left: icon[0] - 40, top: icon[1] - 28 }}>
                <span className={s.droidIconImg}>
                  <img src="/icons/icon-maskable-192.png" alt="" width={56} height={56} />
                </span>
                Hello Beauty
              </div>
              {[4, 5, 6, 7].map((i, c) => (
                <div key={i} className={s.droidIcon} style={{ left: colX[c]! - 40, top: 752 }}>
                  <span className={s.droidIconImg} style={toneOf(i)}>
                    <Glyph i={i} size={26} />
                  </span>
                </div>
              ))}
              <div className={s.droidSearch}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.5 15.5 5 5" />
                </svg>
                {t.search}
              </div>
            </div>

            <div className={s.browserApp} data-out={String(home)}>
              <PageMini t={t} android button={buttonLabel} />
              <div className={s.chromeBar}>
                <span className={s.omnibox}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
                    <circle cx="16" cy="8" r="2" />
                    <circle cx="8" cy="16" r="2" />
                  </svg>
                  {host}
                </span>
                <span className={s.tabCount}>1</span>
                <span className={s.chromeMenu}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5.5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="18.5" r="2" />
                  </svg>
                </span>
              </div>
              <div className={s.scrim} data-on={on('dialog')} />
              <div className={s.dialog} data-on={on('dialog')}>
                <div className={s.dialogTitle}>{t.installTitle}</div>
                <div className={s.dialogApp}>
                  <span className={s.dialogIcon}>
                    <img src="/icons/icon-maskable-192.png" alt="" width={44} height={44} />
                  </span>
                  <span>
                    <div className={s.dialogName}>Hello Beauty</div>
                    <div className={s.dialogUrl}>{host}</div>
                  </span>
                </div>
                <div className={s.dialogBtns}>
                  <span className={s.dialogBtn}>{t.cancel}</span>
                  <span className={s.dialogBtn}>{t.install}</span>
                </div>
              </div>
            </div>

            <Splash on={splash} origin={icon} round />
            <AppMini on={phase.layers.includes('app')} t={t} />

            <StatusBar light={home && !splash} android />
            <div className={s.punchHole} />
            <div className={cx(s.gestureBar, home && !splash && s.gestureBarLight)} />
            <Finger x={fx} y={fy} mode={phase.finger} ringKey={ringKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
