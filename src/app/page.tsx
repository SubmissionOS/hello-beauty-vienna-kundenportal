'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Monogram } from '@/components/logo';

/** Einstieg: installierte App → /app, Browser → /installieren. */
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    router.replace(standalone ? '/app' : '/installieren');
  }, [router]);

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Monogram size={96} alt="Hello Beauty" />
    </main>
  );
}
