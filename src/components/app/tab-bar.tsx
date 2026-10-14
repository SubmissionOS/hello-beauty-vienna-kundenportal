'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconBell, IconCalendar, IconHome, IconPlusCircle, IconUser } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useUnread } from '@/lib/unread';
import st from './app.module.css';

export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const unread = useUnread();
  const tabs = [
    { href: '/app', label: t.nav.start, Icon: IconHome, badge: unread.offers + unread.chat },
    { href: '/app/termine', label: t.nav.appointments, Icon: IconCalendar, badge: 0 },
    { href: '/app/buchen', label: t.nav.book, Icon: IconPlusCircle, badge: 0 },
    { href: '/app/neuigkeiten', label: t.nav.news, Icon: IconBell, badge: unread.news },
    { href: '/app/profil', label: t.nav.profile, Icon: IconUser, badge: 0 },
  ];
  return (
    <nav className={st.tabbar} aria-label={t.nav.label}>
      {tabs.map(({ href, label, Icon, badge }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={st.tab}
            aria-current={active ? 'page' : undefined}
            aria-describedby={badge > 0 ? `tab-badge-${label}` : undefined}
            prefetch
          >
            <span className={st.tabIcon}>
              <Icon size={26} />
              {badge > 0 && (
                <span className={st.badge} aria-hidden="true" data-testid={`badge-${href.split('/').pop()}`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span>{label}</span>
            {badge > 0 && (
              <span id={`tab-badge-${label}`} hidden>
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
