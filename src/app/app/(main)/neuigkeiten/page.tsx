'use client';

/* eslint-disable @next/next/no-img-element -- Bilder aus Supabase Storage bzw. vorab skalierte Fotos */
import { Suspense, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import st from '@/components/app/app.module.css';
import { LoadError } from '@/components/app/load-state';
import { useLoad } from '@/components/app/use-load';
import { getData, type NewsItem } from '@/lib/data';
import { formatDateLong, instantToWall } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { refreshUnread } from '@/lib/unread';

export default function NewsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <News />
    </Suspense>
  );
}

function News() {
  const { t } = useI18n();
  const focus = useSearchParams().get('id');
  const { state, reload } = useLoad(() => getData().listNews(), 'news');
  const marked = useRef(false);

  // Beim Öffnen gelten alle angezeigten Beiträge als gelesen („Neu“ bleibt für diesen Besuch sichtbar)
  useEffect(() => {
    if (state.status !== 'ready' || marked.current) return;
    marked.current = true;
    const unread = state.data.filter((n) => !n.read);
    if (!unread.length) return;
    Promise.all(unread.map((n) => getData().markNewsRead(n.id)))
      .then(() => refreshUnread())
      .catch(() => {});
  }, [state]);

  useEffect(() => {
    if (state.status === 'ready' && focus) document.getElementById(`news-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [state.status, focus]);

  return (
    <AppPage title={t.news.title}>
      {state.status === 'error' ? (
        <LoadError onRetry={reload} />
      ) : state.status !== 'ready' ? (
        <div className="skeleton" style={{ height: 220, borderRadius: 16 }} />
      ) : state.data.length === 0 ? (
        <div className={`card ${st.empty}`}>
          <p className="muted">{t.news.empty}</p>
        </div>
      ) : (
        <div className={st.apptList}>
          {state.data.map((n) => (
            <NewsCard key={n.id} item={n} highlight={n.id === focus} />
          ))}
        </div>
      )}
    </AppPage>
  );
}

function NewsCard({ item, highlight }: { item: NewsItem; highlight: boolean }) {
  const { t, lang } = useI18n();
  return (
    <article id={`news-${item.id}`} className={`card ${st.news}`} data-kind={item.kind} data-highlight={highlight} data-testid="news-item">
      {item.imageUrl && <img className={st.newsImg} src={item.imageUrl} alt="" width={640} height={360} loading="lazy" />}
      <div className={st.newsBody}>
        <div className={st.chips}>
          <span className={st.status} data-news={item.kind}>
            {t.news.kinds[item.kind]}
          </span>
          {!item.read && <span className={st.status} data-status="new">{t.news.unread}</span>}
        </div>
        <h2 className={st.apptService}>{item.title}</h2>
        <p className={st.newsText}>{item.body}</p>
        <p className="hint">
          {formatDateLong(instantToWall(Date.parse(item.publishedAt)), lang)}
          {item.validUntil && ` · ${fmt(t.news.validUntil, { date: formatDateLong(instantToWall(Date.parse(item.validUntil)), lang) })}`}
        </p>
        {item.kind !== 'news' && (
          <Link href="/app/buchen" className="btn btn-secondary" style={{ justifySelf: 'start' }}>
            {t.news.book}
          </Link>
        )}
      </div>
    </article>
  );
}
