'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCalendar, IconHome, IconPlusCircle, IconUser } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const tabs = [
    { href: '/app', label: t.nav.start, Icon: IconHome },
    { href: '/app/termine', label: t.nav.appointments, Icon: IconCalendar },
    { href: '/app/buchen', label: t.nav.book, Icon: IconPlusCircle },
    { href: '/app/profil', label: t.nav.profile, Icon: IconUser },
  ];
  return (
    <nav className={st.tabbar} aria-label={t.nav.label}>
      {tabs.map(({ href, label, Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link key={href} href={href} className={st.tab} aria-current={active ? 'page' : undefined} prefetch>
            <Icon size={26} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
