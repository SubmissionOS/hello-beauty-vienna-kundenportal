/**
 * „Angemeldet bleiben“: AN (Standard) → Sitzung im localStorage, bleibt auch nach Neustart des Handys.
 * AUS → Sitzung im sessionStorage, endet beim Schließen der App. Die Wahl gilt ab der nächsten Anmeldung.
 */
const KEY = 'hb-remember';

export function remembered(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/** Vor der Anmeldung setzen; vorhandene Sitzungsdaten werden in den passenden Speicher verschoben */
export function setRemember(on: boolean, keys: string[]) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
    const [from, to] = on ? [sessionStorage, localStorage] : [localStorage, sessionStorage];
    for (const k of keys) {
      const v = from.getItem(k);
      if (v !== null) to.setItem(k, v);
      from.removeItem(k);
    }
  } catch {
    /* privater Modus: Sitzung bleibt, wo sie ist */
  }
}

/** Speicher-Adapter für supabase-js und die Mock-Sitzung */
export const sessionStore = {
  getItem: (k: string): string | null => {
    try {
      return (remembered() ? localStorage : sessionStorage).getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      (remembered() ? localStorage : sessionStorage).setItem(k, v);
    } catch {
      /* privater Modus */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* privater Modus */
    }
  },
};
