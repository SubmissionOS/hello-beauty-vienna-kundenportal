'use client';

import Link from 'next/link';
import { IconChevronLeft } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';

/** „Zurück“ oben rechts im Seitenkopf – für Unterseiten ohne eigenen Reiter (in der installierten App gibt es keine Browser-Zurück-Taste). */
export function BackLink({ href = '/app' }: { href?: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="btn btn-ghost" style={{ paddingRight: 0 }}>
      <IconChevronLeft size={22} />
      {t.common.back}
    </Link>
  );
}
