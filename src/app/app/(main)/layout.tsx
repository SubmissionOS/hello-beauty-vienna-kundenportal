'use client';

import { useEffect, ViewTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageSkeleton } from '@/components/app/app-page';
import { TabBar } from '@/components/app/tab-bar';
import { useSession } from '@/lib/auth/use-session';

/** Bereich mit Tab-Leiste: nur mit Sitzung, sonst weiter zur Begrüßung. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'out') router.replace('/app/willkommen');
  }, [session.status, router]);

  return (
    <>
      {session.status === 'in' ? <ViewTransition>{children}</ViewTransition> : <PageSkeleton />}
      <TabBar />
    </>
  );
}
