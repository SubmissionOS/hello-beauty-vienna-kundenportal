'use client';

import { createClientStore } from './client-store';
import { getData, type UnreadCounts } from './data';

/**
 * Ungelesen-Zähler für Tab-Leiste und Startseite (Chat, Neuigkeiten, offene Wartelisten-Angebote).
 * Wird beim Seitenwechsel, beim Zurückkehren in die App und jede Minute aufgefrischt.
 */
const zero: UnreadCounts = { chat: 0, news: 0, offers: 0 };
const store = createClientStore<UnreadCounts>(() => zero, zero);

let inflight: Promise<void> | null = null;
export function refreshUnread(): Promise<void> {
  inflight ??= getData()
    .getUnreadCounts()
    .then(store.set)
    .catch(() => {
      /* offline: alte Zähler bleiben */
    })
    .finally(() => (inflight = null));
  return inflight;
}

export const useUnread = store.use;
