'use client';

/* eslint-disable @next/next/no-img-element -- Bilder aus Supabase Storage bzw. lokale Vorschau */
import { useCallback, useEffect, useState } from 'react';
import st from '@/components/app/app.module.css';
import { prepareNewsImage } from '@/components/app/avatar';
import { IconSend } from '@/components/icons';
import { LogoWide } from '@/components/logo';
import type { ChatMessage } from '@/lib/data/types';
import { env } from '@/lib/env';
import { formatDateLong, formatDateShort, formatTime, instantToWall } from '@/lib/format';
import {
  cancelBySalon,
  currentMember,
  listMessages,
  listNews,
  listThreads,
  listUpcoming,
  listWaitlist,
  markRead,
  newsImageUrl,
  publishNews,
  releaseSlot,
  saveNews,
  salonAvailable,
  salonDemoSignIn,
  salonSignIn,
  salonSignOut,
  sendMessage,
  uploadNewsImage,
  type Member,
  type SalonNews,
  type Thread,
} from '@/lib/salon-client';

/**
 * Salon-Bereich (nur Deutsch, nur mit Supabase): Nachrichten beantworten, Neuigkeiten mit Vorschau anlegen,
 * Warteliste einsehen, Termine freigeben oder absagen. Zugriff nur für salon_members (DB prüft jede Funktion).
 */
type Tab = 'chat' | 'news' | 'waitlist' | 'appointments';
const when = (iso: string) => {
  const w = instantToWall(Date.parse(iso));
  return `${formatDateShort(w, 'de')}, ${formatTime(w, 'de')}`;
};

export default function SalonPage() {
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('chat');

  useEffect(() => {
    if (!salonAvailable()) return;
    currentMember()
      .then(setMember)
      .catch(() => setMember(null));
  }, []);

  if (!salonAvailable()) {
    return (
      <main className={st.screen}>
        <SalonHeader />
        <p className="alert alert-info">Der Salon-Bereich braucht die Supabase-Anbindung (NEXT_PUBLIC_DATA_ADAPTER=supabase).</p>
      </main>
    );
  }
  if (member === undefined) return <main className={st.screen} aria-busy="true" />;
  if (!member) return <Login onIn={setMember} />;

  const tabs: [Tab, string][] = [
    ['chat', 'Nachrichten'],
    ['news', 'Neuigkeiten'],
    ['waitlist', 'Warteliste'],
    ['appointments', 'Termine'],
  ];
  return (
    <main className={st.screen} style={{ paddingBottom: 'var(--s-6)' }}>
      <SalonHeader>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await salonSignOut();
            setMember(null);
          }}
        >
          Abmelden
        </button>
      </SalonHeader>
      <div className={st.content}>
        <h1 className={st.title}>Salon</h1>
        <p className="muted">Angemeldet als {member.displayName}</p>
        <div className="segmented" role="tablist" aria-label="Bereiche">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'chat' && <Inbox />}
          {tab === 'news' && <NewsEditor tenantId={member.tenantId} />}
          {tab === 'waitlist' && <Waitlist />}
          {tab === 'appointments' && <Appointments />}
        </div>
      </div>
    </main>
  );
}

function SalonHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className={st.header}>
      <LogoWide />
      {children}
    </header>
  );
}

function Login({ onIn }: { onIn: (m: Member) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Member | null>) => {
    setBusy(true);
    setError(null);
    try {
      const m = await fn();
      if (m) onIn(m);
      else setError('Dieses Konto hat keinen Zugang zum Salon-Bereich.');
    } catch {
      setError('E-Mail-Adresse oder Passwort stimmen nicht.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className={st.screen}>
      <SalonHeader />
      <form
        className={`card ${st.form}`}
        style={{ padding: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => salonSignIn(email, password));
        }}
      >
        <h1 className={st.stepTitle}>Salon-Anmeldung</h1>
        <div className="field">
          <label className="label" htmlFor="s-email">
            E-Mail
          </label>
          <input id="s-email" name="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="s-password">
            Passwort
          </label>
          <input id="s-password" name="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          Anmelden
        </button>
        {env.demoMode && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => run(salonDemoSignIn)} disabled={busy}>
            Salon-Demo ansehen
          </button>
        )}
      </form>
    </main>
  );
}

function Failed({ retry }: { retry: () => void }) {
  return (
    <div className={`card ${st.empty}`} role="alert">
      <p className="muted">Konnte nicht geladen werden.</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        Erneut laden
      </button>
    </div>
  );
}

/** Lädt Daten; `reload` holt sie neu (alte Daten bleiben bis dahin sichtbar) */
function useData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, failed, reload };
}

// ---------------------------------------------------------------- Nachrichten
function Inbox() {
  const threads = useData(listThreads);
  const [open, setOpen] = useState<Thread | null>(null);
  if (open) return <Conversation thread={open} onBack={() => (setOpen(null), threads.reload())} />;
  if (threads.failed) return <Failed retry={threads.reload} />;
  if (!threads.data) return <div className="skeleton" style={{ height: 160 }} />;
  if (!threads.data.length) return <p className="muted">Noch keine Nachrichten.</p>;
  return (
    <div className="group" data-testid="salon-threads">
      {threads.data.map((th) => (
        <button key={th.customerId} type="button" className="row" onClick={() => setOpen(th)}>
          <span className="row-main">
            {th.name}
            <span className="row-sub" style={{ display: 'block' }}>
              {when(th.lastAt)} · {th.lastBody.slice(0, 80)}
            </span>
          </span>
          {th.unread > 0 && <span className={st.badge} style={{ position: 'static' }}>{th.unread}</span>}
        </button>
      ))}
    </div>
  );
}

function Conversation({ thread, onBack }: { thread: Thread; onBack: () => void }) {
  const load = useCallback(() => listMessages(thread.customerId), [thread.customerId]);
  const msgs = useData<ChatMessage[]>(load);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    markRead(thread.customerId).catch(() => {});
  }, [thread.customerId]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendMessage(thread.customerId, text.trim());
      setText('');
      setError(null);
      msgs.reload();
    } catch {
      setError('Nicht gesendet. Bitte erneut versuchen.');
    }
  };
  return (
    <div className={st.form}>
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ justifySelf: 'start', paddingLeft: 0 }}>
        ← Alle Nachrichten
      </button>
      <h2 className={st.stepTitle}>{thread.name}</h2>
      {msgs.failed ? (
        <Failed retry={msgs.reload} />
      ) : (
        <ol className={st.chat}>
          {(msgs.data ?? []).map((m) => (
            // Sicht des Salons: eigene Antworten rechts
            <li key={m.id} className={st.chatItem} data-sender={m.sender === 'salon' ? 'customer' : 'salon'}>
              <div className={st.bubble}>{m.body}</div>
              <p className={st.chatMeta}>
                {m.sender === 'salon' ? `${m.senderName ?? 'Salon'} · ` : ''}
                {when(m.createdAt)}
                {m.sender === 'salon' && m.readByCustomerAt ? ' · gelesen' : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
      <form className={st.composer} onSubmit={send} style={{ bottom: 'var(--s-3)' }}>
        <label className="visually-hidden" htmlFor="salon-msg">
          Antwort
        </label>
        <textarea id="salon-msg" className={`input ${st.composerInput}`} rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwort schreiben …" />
        <button type="submit" className={`btn btn-primary ${st.composerSend}`} aria-label="Senden" disabled={!text.trim()}>
          <IconSend size={22} />
        </button>
      </form>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Neuigkeiten
const kindLabel: Record<SalonNews['kind'], string> = { news: 'Neuigkeit', offer: 'Angebot', free_slot: 'Termin frei' };

function NewsEditor({ tenantId }: { tenantId: string }) {
  const list = useData(listNews);
  const [kind, setKind] = useState<SalonNews['kind']>('news');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [image, setImage] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await prepareNewsImage(file);
      setImage({ blob, preview: URL.createObjectURL(blob) });
    } catch {
      setMsg({ ok: false, text: 'Das Bild ließ sich nicht verwenden (JPG, PNG oder WebP).' });
    }
  };

  const submit = async (publish: boolean) => {
    if (!title.trim() || !body.trim()) return setMsg({ ok: false, text: 'Bitte Titel und Text ausfüllen.' });
    if (kind === 'offer' && !validUntil) return setMsg({ ok: false, text: 'Angebote brauchen ein „Gültig bis“.' });
    setBusy(true);
    setMsg(null);
    try {
      const imagePath = image ? await uploadNewsImage(tenantId, image.blob) : null;
      const saved = await saveNews({
        id: null,
        kind,
        title: title.trim(),
        body: body.trim(),
        imagePath,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:00`).toISOString() : null,
      });
      if (publish) await publishNews(saved.id);
      setMsg({
        ok: true,
        text: publish
          ? 'Veröffentlicht. In der App sehen es alle Kundinnen; Mitteilung/E-Mail/SMS nur an Kundinnen mit Werbe-Einwilligung für den Kanal.'
          : 'Als Entwurf gespeichert.',
      });
      setTitle('');
      setBody('');
      setValidUntil('');
      setImage(null);
      list.reload();
    } catch {
      setMsg({ ok: false, text: 'Speichern hat nicht geklappt.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={st.form}>
      <div className={`card ${st.form}`} style={{ padding: 16 }}>
        <h2 className={st.stepTitle}>Neuigkeit anlegen</h2>
        <div className={st.chipRow} role="group" aria-label="Art">
          {(Object.keys(kindLabel) as SalonNews['kind'][]).map((k) => (
            <button key={k} type="button" className={st.chipToggle} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {kindLabel[k]}
            </button>
          ))}
        </div>
        <div className="field">
          <label className="label" htmlFor="n-title">
            Titel
          </label>
          <input id="n-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="n-body">
            Text
          </label>
          <textarea id="n-body" className="input" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="n-valid">
            Gültig bis {kind === 'offer' ? '(Pflicht bei Angeboten)' : '(optional)'}
          </label>
          <input id="n-valid" className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <label className="btn btn-secondary">
          Bild wählen (optional)
          <input type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>

        <p className="section-title">Vorschau in der App</p>
        <article className={`card ${st.news}`} data-testid="news-preview">
          {image && <img className={st.newsImg} src={image.preview} alt="" />}
          <div className={st.newsBody}>
            <div className={st.chips}>
              <span className={st.status} data-news={kind}>
                {kindLabel[kind]}
              </span>
            </div>
            <h3 className={st.apptService}>{title || 'Titel'}</h3>
            <p className={st.newsText}>{body || 'Text der Neuigkeit'}</p>
            {validUntil && <p className="hint">Gültig bis {formatDateLong(`${validUntil}T12:00`, 'de')}</p>}
          </div>
        </article>

        {msg && (
          <p className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`} role="status">
            {msg.text}
          </p>
        )}
        <div className={st.actionsRow}>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => submit(false)}>
            Entwurf
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(true)}>
            Veröffentlichen
          </button>
        </div>
      </div>

      <h2 className="section-title">Bisher</h2>
      {list.failed ? (
        <Failed retry={list.reload} />
      ) : (
        <div className="group">
          {(list.data ?? []).map((n) => (
            <div key={n.id} className="row">
              {n.imagePath && <img src={newsImageUrl(n.imagePath)} alt="" width={48} height={48} style={{ objectFit: 'cover', borderRadius: 8 }} />}
              <span className="row-main">
                {n.title}
                <span className="row-sub" style={{ display: 'block' }}>
                  {kindLabel[n.kind]} · {n.status === 'published' ? `veröffentlicht ${n.publishedAt ? when(n.publishedAt) : ''}` : n.status === 'draft' ? 'Entwurf' : 'archiviert'}
                </span>
              </span>
              {n.status === 'draft' && (
                <button type="button" className="btn btn-secondary" onClick={async () => (await publishNews(n.id), list.reload())}>
                  Veröffentlichen
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Warteliste
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const offerStatus: Record<string, string> = {
  offered: 'angeboten',
  accepted: 'gebucht',
  declined: 'abgelehnt',
  expired: 'abgelaufen',
  withdrawn: 'zurückgezogen',
};

function Waitlist() {
  const wl = useData(listWaitlist);
  if (wl.failed) return <Failed retry={wl.reload} />;
  if (!wl.data) return <div className="skeleton" style={{ height: 160 }} />;
  return (
    <div className={st.form}>
      <h2 className="section-title">Einträge (Reihenfolge = wer zuerst gefragt wird)</h2>
      {wl.data.entries.length === 0 ? (
        <p className="muted">Niemand auf der Warteliste.</p>
      ) : (
        <ol className="group" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {wl.data.entries.map((e, i) => (
            <li key={e.id} className="row">
              <span className="row-main">
                {i + 1}. {e.name} · {e.customerNumber}
                <span className="row-sub" style={{ display: 'block' }}>
                  {e.serviceNames.join(', ')} · {e.staffName ?? 'egal wer'} · {e.dateFrom} – {e.dateTo} · {e.weekdays.map((d) => WD[d]).join(' ')} · {e.timeFrom}–{e.timeTo}
                  {e.shortNotice ? ' · kurzfristig' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <h2 className="section-title">Angebote der letzten 7 Tage</h2>
      <div className="group">
        {wl.data.offers.map((o) => (
          <div key={o.id} className="row">
            <span className="row-main">
              {o.serviceName} · {formatDateShort(o.start, 'de')} {formatTime(o.start, 'de')} · {o.staffName}
              <span className="row-sub" style={{ display: 'block' }}>
                {offerStatus[o.status] ?? o.status} · Antwort bis {when(o.expiresAt)}
              </span>
            </span>
          </div>
        ))}
        {wl.data.offers.length === 0 && (
          <div className="row">
            <span className="row-main muted">Keine Angebote.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Termine
function Appointments() {
  const appts = useData(listUpcoming);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, done: string, question: string) => {
    if (!window.confirm(question)) return;
    try {
      await fn();
      setMsg(done);
      appts.reload();
    } catch {
      setMsg('Das hat nicht geklappt.');
    }
  };
  if (appts.failed) return <Failed retry={appts.reload} />;
  if (!appts.data) return <div className="skeleton" style={{ height: 160 }} />;
  return (
    <div className={st.form}>
      {msg && (
        <p className="alert alert-info" role="status">
          {msg}
        </p>
      )}
      <p className="hint">
        „Freigeben“ macht den Termin frei und bietet ihn sofort der Warteliste an (eine Person nach der anderen). „Absagen“ tut dasselbe
        und erstattet eine Anzahlung vollständig.
      </p>
      {appts.data.length === 0 && <p className="muted">Keine kommenden Termine.</p>}
      {appts.data.map((a) => (
        <article key={a.id} className={`card ${st.appt}`}>
          <div className={st.apptMain} style={{ gridColumn: '1 / -1' }}>
            <h2 className={st.apptService}>
              {formatDateShort(a.start, 'de')} · {formatTime(a.start, 'de')} · {a.serviceName}
            </h2>
            <p className={st.apptMeta}>
              {a.customerName} · {a.customerNumber} · {a.staffName}
              {a.holdKind === 'waitlist_offer' ? ' · reserviert (Wartelisten-Angebot)' : a.holdKind === 'payment' ? ' · wartet auf Zahlung' : ''}
            </p>
            {!a.holdKind && (
              <div className={st.actionsRow}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => act(() => releaseSlot(a.id), 'Freigegeben – die Warteliste wird gefragt.', `${a.customerName}: Termin freigeben?`)}
                >
                  Freigeben
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => act(() => cancelBySalon(a.id), 'Abgesagt – Erstattung ist veranlasst.', `${a.customerName}: Termin absagen und erstatten?`)}
                >
                  Absagen
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
