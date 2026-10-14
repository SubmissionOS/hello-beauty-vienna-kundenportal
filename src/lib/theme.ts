'use client';

import { createClientStore } from './client-store';

export type ThemePref = 'system' | 'light' | 'dark';

const themeColors = { light: '#fbf9f4', dark: '#15130e' } as const;

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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', themeColors[mode]);
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
