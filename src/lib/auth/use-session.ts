'use client';

import { createClientStore } from '../client-store';
import { getAuth } from './index';
import type { Session } from './types';

export type SessionState = { status: 'loading' } | { status: 'in'; session: Session } | { status: 'out' };

const store = createClientStore<SessionState>(
  () => {
    const auth = getAuth();
    auth.onChange((s) => store.set(s ? { status: 'in', session: s } : { status: 'out' }));
    auth
      .getSession()
      .then((s) => store.set(s ? { status: 'in', session: s } : { status: 'out' }))
      .catch(() => store.set({ status: 'out' }));
    return { status: 'loading' };
  },
  { status: 'loading' },
);

export const useSession = store.use;
