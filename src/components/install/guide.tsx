'use client';

import { useState, useSyncExternalStore } from 'react';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPause, IconPlay, IconReplay } from '@/components/icons';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { formatDateShort, nowWall } from '@/lib/format';
import { AndroidMockup } from './android-mockup';
import { IosMockup } from './ios-mockup';
import { cx } from './mock-parts';
import { withIcons } from './with-icons';
import {
  androidPhases,
  ios26Phases,
  iosLegacyPhases,
  stillIndex,
  useTimeline,
  type AndroidLayer,
  type AndroidTarget,
  type IosLayer,
  type IosTarget,
  type Phase,
} from './timeline';
import g from './guide.module.css';

const reducedQuery = '(prefers-reduced-motion: reduce)';
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(reducedQuery);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

type Kind = 'ios' | 'android';

interface GuideProps {
  kind: Kind;
  host: string;
  /** Startvariante iOS (aus der Erkennung) */
  ios26?: boolean;
  /** Breite des Gehäuses in px */
  width: number;
  /** Vorführmodus: ohne Bedienelemente, große Darstellung */
  show?: boolean;
  /** Überschrift ausblenden (Vorführmodus setzt eigene) */
  hideTitle?: boolean;
}

/** Animierte Anleitung: Handy-Mockup links, Schritte rechts – synchron. */
export function Guide({ kind, host, ios26 = true, width, show = false, hideTitle = false }: GuideProps) {
  const { t } = useI18n();
  const [variant, setVariant] = useState<'ios26' | 'legacy'>(ios26 ? 'ios26' : 'legacy');

  const title =
    kind === 'android' ? t.install.guide.titleAndroid : variant === 'ios26' ? t.install.guide.titleIos : t.install.guide.titleIosLegacy;

  return (
    <section className={cx(g.guide, show && g.show)} aria-labelledby={`guide-${kind}`}>
      <div className={g.head}>
        <h2 id={`guide-${kind}`} className={cx(g.title, hideTitle && 'visually-hidden')}>
          {title}
        </h2>
      </div>
      {kind === 'ios' ? (
        <Player key={variant} kind="ios" variant={variant} host={host} width={width} show={show} />
      ) : (
        <Player key="android" kind="android" variant="ios26" host={host} width={width} show={show} />
      )}
        {kind === 'ios' && !show && (
          <div className={cx('segmented', g.toggle)} role="group" aria-label={t.install.guide.version}>
            <button type="button" aria-pressed={variant === 'ios26'} onClick={() => setVariant('ios26')}>
              {t.install.guide.ios26}
            </button>
            <button type="button" aria-pressed={variant === 'legacy'} onClick={() => setVariant('legacy')}>
              {t.install.guide.iosLegacy}
            </button>
          </div>
        )}
    </section>
  );
}

function Player({
  kind,
  variant,
  host,
  width,
  show,
}: {
  kind: Kind;
  variant: 'ios26' | 'legacy';
  host: string;
  width: number;
  show: boolean;
}) {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const phases: Phase[] = kind === 'android' ? androidPhases : variant === 'ios26' ? ios26Phases : iosLegacyPhases;
  const steps =
    kind === 'android' ? t.install.guide.stepsAndroid : variant === 'ios26' ? t.install.guide.stepsIos : t.install.guide.stepsIosLegacy;
  const doneText = kind === 'android' ? t.install.guide.doneAndroid : t.install.guide.doneIos;
  const total = steps.length;

  const [tl, setTl] = useTimeline(phases, playing && !reduced);
  // Reduzierte Bewegung: Standbild pro Schritt, Wechsel nur per Knopf
  const [manualStep, setManualStep] = useState(1);
  const index = reduced ? stillIndex(phases, manualStep) : tl.index;
  const phase = phases[index]!;
  const current = phase.step;
  const ringKey = `${tl.cycle}-${index}`;

  const jump = (step: number) => {
    if (reduced) setManualStep(step);
    else setTl((s) => ({ index: stillIndex(phases, step), cycle: s.cycle + 1 }));
  };

  const mockup =
    kind === 'android' ? (
      <AndroidMockup
        phase={phase as Phase<AndroidTarget, AndroidLayer>}
        ringKey={ringKey}
        host={host}
        t={t.mock}
        buttonLabel={t.install.android.button}
        dateLabel={formatDateShort(nowWall(), lang)}
        width={width}
        still={reduced}
      />
    ) : (
      <IosMockup
        variant={variant}
        phase={phase as Phase<IosTarget, IosLayer>}
        ringKey={ringKey}
        host={host}
        t={t.mock}
        width={width}
        still={reduced}
      />
    );

  return (
    <>
      <div className={g.stage}>
        <figure className={g.figure} aria-label={t.install.guide.mockupLabel}>
          {mockup}
        </figure>
        <ol className={g.steps} aria-live={reduced ? 'polite' : 'off'}>
          {steps.map((text, i) => {
            const n = i + 1;
            const state = current > n ? 'done' : current === n ? 'current' : 'todo';
            return (
              <li key={n} className={g.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                <button type="button" className={g.stepBtn} onClick={() => jump(n)} tabIndex={show ? -1 : 0}>
                  <span className={g.stepNum} aria-hidden="true">
                    {state === 'done' ? <IconCheck size={16} /> : n}
                  </span>
                  <span className={g.stepText}>
                    <span className="visually-hidden">{fmt(t.install.guide.stepOf, { n, total })}: </span>
                    {withIcons(text)}
                  </span>
                </button>
              </li>
            );
          })}
          <li className={g.step} data-state={current > total ? 'current' : 'todo'} data-final="true">
            <span className={g.stepBtn}>
              <span className={g.stepNum} aria-hidden="true">
                <IconCheck size={16} />
              </span>
              <span className={g.stepText}>{doneText}</span>
            </span>
          </li>
        </ol>
      </div>
      {!show && (
        <div className={g.controls}>
          {reduced ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setManualStep((s) => Math.max(1, s - 1))}
                disabled={manualStep <= 1}
              >
                <IconChevronLeft size={20} />
                {t.install.guide.prev}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setManualStep((s) => Math.min(total + 1, s + 1))}
                disabled={manualStep > total}
              >
                {t.install.guide.next}
                <IconChevronRight size={20} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
                {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
                {playing ? t.install.guide.pause : t.install.guide.play}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setTl((s) => ({ index: 0, cycle: s.cycle + 1 }));
                  setPlaying(true);
                }}
              >
                <IconReplay size={18} />
                {t.install.guide.replay}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

