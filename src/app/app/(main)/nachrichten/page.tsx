'use client';

import { useEffect, useRef, useState } from 'react';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import st from '@/components/app/app.module.css';
import { LoadError } from '@/components/app/load-state';
import { useLoad } from '@/components/app/use-load';
import { IconSend } from '@/components/icons';
import { DataError, getData, type ChatMessage } from '@/lib/data';
import { formatDateShort, formatTime, instantToWall } from '@/lib/format';
import { useI18n } from '@/lib/i18n/use-i18n';
import { refreshUnread } from '@/lib/unread';

const MAX = 2000;

/** Chat mit dem Salon. Antworten kommen über /salon oder das CRM; neu geladen alle 15 s und beim Zurückkehren. */
export default function MessagesPage() {
  const { t, lang } = useI18n();
  const { state, reload } = useLoad(() => getData().listChat(), 'chat');
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(reload, 15_000);
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const unreadSalon = state.status === 'ready' ? state.data.filter((m) => m.sender === 'salon' && !m.readByCustomerAt).length : 0;
  useEffect(() => {
    if (unreadSalon > 0)
      getData()
        .markChatRead()
        .then(() => refreshUnread())
        .catch(() => {});
  }, [unreadSalon]);

  const messages = state.status === 'ready' ? [...state.data, ...sent.filter((s) => !state.data.some((m) => m.id === s.id))] : [];
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (body.length > MAX) return setError(t.chat.tooLong);
    setBusy(true);
    setError(null);
    try {
      const m = await getData().sendChat(body);
      setSent((cur) => [...cur, m]);
      setText('');
    } catch (err) {
      setError(err instanceof DataError && err.code === 'offline' ? t.state.offlineText : t.chat.sendError);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <PageSkeleton />;

  return (
    <AppPage title={t.chat.title}>
      <p className="muted">{t.chat.lead}</p>
      {state.status === 'error' ? (
        <LoadError onRetry={reload} />
      ) : messages.length === 0 ? (
        <div className={`card ${st.empty}`}>
          <p className="muted">{t.chat.empty}</p>
        </div>
      ) : (
        <ol className={st.chat} aria-live="polite" data-testid="chat-list">
          {messages.map((m, i) => {
            const wall = instantToWall(Date.parse(m.createdAt));
            const prev = messages[i - 1];
            const newDay = !prev || instantToWall(Date.parse(prev.createdAt)).slice(0, 10) !== wall.slice(0, 10);
            return (
              <li key={m.id} className={st.chatItem} data-sender={m.sender}>
                {newDay && <p className={st.chatDay}>{formatDateShort(wall, lang)}</p>}
                <div className={st.bubble}>
                  <span className="visually-hidden">{m.sender === 'salon' ? m.senderName ?? t.chat.salon : t.chat.you}: </span>
                  {m.body}
                </div>
                <p className={st.chatMeta}>
                  {m.sender === 'salon' && `${m.senderName ?? t.chat.salon} · `}
                  {formatTime(wall, lang)}
                  {m.sender === 'customer' && m.readBySalonAt && ` · ${t.chat.read}`}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={end} />
      <form className={st.composer} onSubmit={send}>
        <label className="visually-hidden" htmlFor="chat-input">
          {t.chat.label}
        </label>
        <textarea
          id="chat-input"
          className={`input ${st.composerInput}`}
          rows={1}
          maxLength={MAX}
          placeholder={t.chat.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className={`btn btn-primary ${st.composerSend}`} disabled={busy || !text.trim()} aria-label={t.chat.send}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconSend size={22} />}
        </button>
      </form>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
    </AppPage>
  );
}
