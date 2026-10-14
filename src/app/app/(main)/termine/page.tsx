'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import { ApptCard } from '@/components/app/appt-card';
import st from '@/components/app/app.module.css';
import { useLoad } from '@/components/app/use-load';
import { IconPhone } from '@/components/icons';
import { useSession } from '@/lib/auth/use-session';
import { getData } from '@/lib/data';
import { nowWall } from '@/lib/format';
import { useI18n } from '@/lib/i18n/use-i18n';
import { salon } from '@/lib/salon';

export default function AppointmentsPage() {
  const { t } = useI18n();
  const session = useSession();
  const id = session.status === 'in' ? session.session.customerId : null;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const { state } = useLoad(
    id ? async () => Promise.all([getData().listAppointments(id), getData().listServices()]) : null,
    `appts-${id}`,
  );

  if (state.status !== 'ready') return <PageSkeleton />;
  const [appts, services] = state.data;
  const now = nowWall();
  const upcoming = appts.filter((a) => a.start >= now && a.status !== 'completed');
  const past = appts.filter((a) => !(a.start >= now && a.status !== 'completed')).reverse();
  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <AppPage title={t.appointments.title}>
      <div className="segmented" role="tablist" aria-label={t.appointments.title}>
        <button type="button" role="tab" aria-selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
          {t.appointments.upcoming} ({upcoming.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'past'} onClick={() => setTab('past')}>
          {t.appointments.past} ({past.length})
        </button>
      </div>
      <div className={st.apptList} role="tabpanel" key={tab}>
        {list.length === 0 ? (
          <div className={`card ${st.empty}`}>
            <p className="muted">{tab === 'upcoming' ? t.appointments.emptyUpcoming : t.appointments.emptyPast}</p>
            {tab === 'upcoming' && (
              <Link href="/app/buchen" className="btn btn-primary">
                {t.home.book}
              </Link>
            )}
          </div>
        ) : (
          list.map((a) => <ApptCard key={a.id} appt={a} services={services} />)
        )}
      </div>
      {tab === 'upcoming' && upcoming.length > 0 && (
        <a className="row card" href={`tel:${salon.phoneE164}`}>
          <IconPhone size={22} className="muted" />
          <span className="row-main">
            {t.appointments.change}
            <span className="row-sub" style={{ display: 'block' }}>
              {salon.phone}
            </span>
          </span>
        </a>
      )}
    </AppPage>
  );
}
