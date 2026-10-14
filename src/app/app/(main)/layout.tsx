'use client';

import { useEffect, ViewTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageSkeleton } from '@/components/app/app-page';
import { TabBar } from '@/components/app/tab-bar';
import { useSession } from '@/lib/auth/use-session';
import { syncPush } from '@/lib/push';
import { refreshUnread } from '@/lib/unread';

/** Bereich mit Tab-Leiste: nur mit Sitzung, sonst weiter zur Begrüßung. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const path = usePathname();
  const signedIn = session.status === 'in';

  useEffect(() => {
    if (session.status === 'out') router.replace('/app/willkommen');
  }, [session.status, router]);

  // Ungelesen-Zähler: bei jedem Seitenwechsel, beim Zurückkehren in die App und jede Minute
  useEffect(() => {
    if (signedIn) refreshUnread();
  }, [signedIn, path]);
  useEffect(() => {
    if (signedIn) syncPush();
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    const onVisible = () => document.visibilityState === 'visible' && refreshUnread();
    document.addEventListener('visibilitychange', onVisible);
    const id = window.setInterval(refreshUnread, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(id);
    };
  }, [signedIn]);

  return (
    <>
      {signedIn ? <ViewTransition>{children}</ViewTransition> : <PageSkeleton />}
      <TabBar />
    </>
  );
}
