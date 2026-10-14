'use client';

import { createClientStore } from '../client-store';
import { defaultLang, detectLang, type Lang } from './config';
import { dicts } from './index';

const langStore = createClientStore<Lang>(() => {
  const l = detectLang();
  document.documentElement.lang = l;
  return l;
}, defaultLang);

export function setLang(lang: Lang) {
  try {
    localStorage.setItem('hb-lang', lang);
  } catch {
    /* privater Modus */
  }
  document.documentElement.lang = lang;
  langStore.set(lang);
}

export function useI18n() {
  const lang = langStore.use();
  return { lang, t: dicts[lang], setLang };
}
