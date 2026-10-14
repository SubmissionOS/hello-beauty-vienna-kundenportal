'use client';

import { useEffect, useState } from 'react';

/**
 * Zeitleisten der Anleitungen. Jede Phase setzt Ebenen (sichtbare Bildschirmteile), Fingerposition und
 * den Schritt der Textanzeige. Zeiten orientieren sich an echten Geräten (Sheet ≈ 0,5 s, Tipp ≈ 0,25 s).
 */
export type FingerMode = 'hidden' | 'move' | 'tap' | 'hold';

export interface Phase<T extends string = string, L extends string = string> {
  dur: number;
  /** 1…n = Schritt, n+1 = fertig */
  step: number;
  layers: L[];
  finger: FingerMode;
  at: T;
  /** Standbild für diesen Schritt (reduzierte Bewegung) */
  still?: boolean;
  /** Ohne Übergänge (Zurücksetzen am Schleifenanfang) */
  instant?: boolean;
}

export type IosTarget = 'rest' | 'more' | 'menuShare' | 'barShare' | 'swipeStart' | 'swipeEnd' | 'a2hs' | 'addBtn' | 'icon';
export type IosLayer = 'menu' | 'dim' | 'share' | 'scrolled' | 'add' | 'home' | 'icon' | 'splash' | 'app';

/** Koordinaten im iPhone-Bildschirm (393 × 852 pt) */
export const iosTargets: Record<IosTarget, [number, number]> = {
  rest: [440, 930],
  more: [357, 796],
  menuShare: [250, 509],
  barShare: [196, 803],
  swipeStart: [205, 790],
  swipeEnd: [205, 590],
  a2hs: [165, 618],
  addBtn: [330, 88],
  icon: [243, 307],
};

type IP = Phase<IosTarget, IosLayer>;

const sharePart = (step: number): IP[] => [
  { dur: 800, step, layers: ['dim', 'share'], finger: 'move', at: 'swipeStart' },
  { dur: 180, step, layers: ['dim', 'share'], finger: 'hold', at: 'swipeStart' },
  { dur: 700, step, layers: ['dim', 'share', 'scrolled'], finger: 'hold', at: 'swipeEnd' },
  { dur: 250, step, layers: ['dim', 'share', 'scrolled'], finger: 'move', at: 'swipeEnd' },
  { dur: 600, step, layers: ['dim', 'share', 'scrolled'], finger: 'move', at: 'a2hs', still: true },
  { dur: 260, step, layers: ['dim', 'share', 'scrolled'], finger: 'tap', at: 'a2hs' },
  { dur: 900, step: step + 1, layers: ['dim', 'share', 'scrolled', 'add'], finger: 'move', at: 'a2hs' },
  { dur: 650, step: step + 1, layers: ['dim', 'share', 'scrolled', 'add'], finger: 'move', at: 'addBtn', still: true },
  { dur: 260, step: step + 1, layers: ['dim', 'share', 'scrolled', 'add'], finger: 'tap', at: 'addBtn' },
];

/** Sheets bleiben „an“, während Safari zum Home-Bildschirm wegzoomt (kein Zurückfahren sichtbar). */
const keep: IosLayer[] = ['dim', 'share', 'scrolled', 'add'];

const homePart = (done: number): IP[] => [
  { dur: 650, step: done, layers: [...keep, 'home'], finger: 'hidden', at: 'addBtn' },
  { dur: 900, step: done, layers: [...keep, 'home', 'icon'], finger: 'hidden', at: 'addBtn' },
  { dur: 650, step: done, layers: [...keep, 'home', 'icon'], finger: 'move', at: 'icon', still: true },
  { dur: 260, step: done, layers: [...keep, 'home', 'icon'], finger: 'tap', at: 'icon' },
  { dur: 1000, step: done, layers: [...keep, 'home', 'icon', 'splash'], finger: 'hidden', at: 'icon' },
  { dur: 2600, step: done, layers: [...keep, 'home', 'icon', 'splash', 'app'], finger: 'hidden', at: 'icon' },
];

/** iOS 26: ••• → Teilen → Zum Home-Bildschirm → Hinzufügen */
export const ios26Phases: IP[] = [
  { dur: 60, step: 1, layers: [], finger: 'hidden', at: 'rest', instant: true },
  { dur: 900, step: 1, layers: [], finger: 'hidden', at: 'rest' },
  { dur: 700, step: 1, layers: [], finger: 'move', at: 'more', still: true },
  { dur: 260, step: 1, layers: [], finger: 'tap', at: 'more' },
  { dur: 650, step: 2, layers: ['menu'], finger: 'move', at: 'more' },
  { dur: 600, step: 2, layers: ['menu'], finger: 'move', at: 'menuShare', still: true },
  { dur: 260, step: 2, layers: ['menu'], finger: 'tap', at: 'menuShare' },
  ...sharePart(3),
  ...homePart(5),
];

/** iOS bis 18 (bzw. „klassische“ Leiste): Teilen-Symbol → Zum Home-Bildschirm → Hinzufügen */
export const iosLegacyPhases: IP[] = [
  { dur: 60, step: 1, layers: [], finger: 'hidden', at: 'rest', instant: true },
  { dur: 900, step: 1, layers: [], finger: 'hidden', at: 'rest' },
  { dur: 700, step: 1, layers: [], finger: 'move', at: 'barShare', still: true },
  { dur: 260, step: 1, layers: [], finger: 'tap', at: 'barShare' },
  ...sharePart(2),
  ...homePart(4),
];

export type AndroidTarget = 'rest' | 'installBtn' | 'installConfirm' | 'icon';
export type AndroidLayer = 'dialog' | 'home' | 'icon' | 'splash' | 'app';

/** Koordinaten im Android-Bildschirm (412 × 915 dp) */
export const androidTargets: Record<AndroidTarget, [number, number]> = {
  rest: [460, 980],
  installBtn: [206, 610],
  installConfirm: [283, 511],
  icon: [345, 640],
};

type AP = Phase<AndroidTarget, AndroidLayer>;

/** Chrome: „App hinzufügen“ → Dialog „Installieren“ → Symbol */
export const androidPhases: AP[] = [
  { dur: 60, step: 1, layers: [], finger: 'hidden', at: 'rest', instant: true },
  { dur: 900, step: 1, layers: [], finger: 'hidden', at: 'rest' },
  { dur: 700, step: 1, layers: [], finger: 'move', at: 'installBtn', still: true },
  { dur: 260, step: 1, layers: [], finger: 'tap', at: 'installBtn' },
  { dur: 700, step: 2, layers: ['dialog'], finger: 'move', at: 'installBtn' },
  { dur: 600, step: 2, layers: ['dialog'], finger: 'move', at: 'installConfirm', still: true },
  { dur: 260, step: 2, layers: ['dialog'], finger: 'tap', at: 'installConfirm' },
  { dur: 700, step: 3, layers: ['home'], finger: 'hidden', at: 'installConfirm' },
  { dur: 900, step: 3, layers: ['home', 'icon'], finger: 'hidden', at: 'installConfirm' },
  { dur: 650, step: 3, layers: ['home', 'icon'], finger: 'move', at: 'icon', still: true },
  { dur: 260, step: 3, layers: ['home', 'icon'], finger: 'tap', at: 'icon' },
  { dur: 1000, step: 3, layers: ['home', 'icon', 'splash'], finger: 'hidden', at: 'icon' },
  { dur: 2600, step: 3, layers: ['home', 'icon', 'splash', 'app'], finger: 'hidden', at: 'icon' },
];

/** Index der Standbild-Phase je Schritt (für reduzierte Bewegung und Schritt-Sprünge). */
export function stillIndex(phases: Phase[], step: number): number {
  const i = phases.findIndex((p) => p.step === step && p.still);
  return i === -1 ? Math.max(0, phases.findIndex((p) => p.step === step)) : i;
}

export interface TimelineState {
  index: number;
  /** zählt Durchläufe – startet Tipp-Animationen neu */
  cycle: number;
}

/** Spielt die Phasen in einer Endlosschleife ab; pausierbar. */
export function useTimeline(phases: Phase[], playing: boolean) {
  const [state, setState] = useState<TimelineState>({ index: 0, cycle: 0 });
  useEffect(() => {
    if (!playing) return;
    const phase = phases[state.index];
    if (!phase) return;
    const id = window.setTimeout(() => {
      setState((s) => (s.index + 1 >= phases.length ? { index: 0, cycle: s.cycle + 1 } : { index: s.index + 1, cycle: s.cycle }));
    }, phase.dur);
    return () => window.clearTimeout(id);
  }, [playing, state, phases]);
  return [state, setState] as const;
}
