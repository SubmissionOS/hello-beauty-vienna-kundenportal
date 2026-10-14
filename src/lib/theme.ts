'use client';

import { createClientStore } from './client-store';

export type ThemePref = 'system' | 'light' | 'dark';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem('hb-theme');
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* privater Modus */
  }
  return 'system';
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Setzt data-theme und die Statusleisten-Farbe (theme-color) passend zur Wahl. */
export function applyTheme(pref: ThemePref) {
  const mode = resolve(pref);
  document.documentElement.dataset.theme = mode;
  // Statusleisten-Farbe = Token --bg des gewählten Modus (keine eigene Farbangabe)
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (color) m.setAttribute('content', color);
  });
}

const themeStore = createClientStore<ThemePref>(readPref, 'system');

export function setTheme(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem('hb-theme');
    else localStorage.setItem('hb-theme', pref);
  } catch {
    /* privater Modus */
  }
  applyTheme(pref);
  themeStore.set(pref);
}

export const useThemePref = themeStore.use;

/** Folgt bei „Automatisch“ einem Wechsel der Systemdarstellung, während die App offen ist. */
export function watchSystemTheme(): () => void {
  const m = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (readPref() === 'system') applyTheme('system');
  };
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}
