'use client';

/* eslint-disable @next/next/no-img-element -- Profilbild als signierte URL bzw. data:-URL */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import st from '@/components/app/app.module.css';
import { prepareAvatar } from '@/components/app/avatar';
import { LoadError } from '@/components/app/load-state';
import { phoneOk } from '@/components/app/validate';
import { useLoad } from '@/components/app/use-load';
import {
  IconBell,
  IconCamera,
  IconChat,
  IconChevronRight,
  IconDownload,
  IconExternal,
  IconHourglass,
  IconLogout,
  IconQr,
  IconTrash,
} from '@/components/icons';
import { LangSwitch } from '@/components/lang-switch';
import { QrCode } from '@/components/qr-code';
import { getAuth } from '@/lib/auth';
import { useSession } from '@/lib/auth/use-session';
import {
  getData,
  type Account,
  type Channel,
  type Consents,
  type CustomerProfile,
  type MarketingChannel,
  type NotificationPrefs,
  type NotifyKind,
  type ProfilePatch,
} from '@/lib/data';
import { formatDateShort, formatTime, instantToWall } from '@/lib/format';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { pushState, type PushState } from '@/lib/push';
import { legalUrl } from '@/lib/salon';
import { setTheme, useThemePref, type ThemePref } from '@/lib/theme';

interface ProfileData {
  profile: CustomerProfile;
  account: Account;
  consents: Consents;
  prefs: NotificationPrefs;
}

export default function ProfilePage() {
  const { t } = useI18n();
  const session = useSession();
  const id = session.status === 'in' ? session.session.customerId : null;
  const { state, reload } = useLoad(
    id
      ? async (): Promise<ProfileData | null> => {
          const data = getData();
          const [profile, account, consents, prefs] = await Promise.all([
            data.getProfile(id),
            data.getAccount(),
            data.getConsents(),
            data.getNotificationPrefs(),
          ]);
          return profile ? { profile, account, consents, prefs } : null;
        }
      : null,
    `profile-${id}`,
  );
  if (state.status === 'error') {
    return (
      <AppPage title={t.profile.title}>
        <LoadError onRetry={reload} />
      </AppPage>
    );
  }
  if (state.status !== 'ready' || !state.data || session.status !== 'in') return <PageSkeleton />;
  return <Profile initial={state.data} isDemo={session.session.isDemo} />;
}

const KINDS: NotifyKind[] = ['reminder', 'chat', 'waitlist', 'payment', 'news', 'offer'];
const CHANNELS: Channel[] = ['inapp', 'email', 'sms', 'push'];
const MARKETING: MarketingChannel[] = ['email', 'sms', 'push'];

function Profile({ initial, isDemo }: { initial: ProfileData; isDemo: boolean }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const theme = useThemePref();
  const [profile, setProfile] = useState(initial.profile);
  const [account, setAccount] = useState(initial.account);
  const [consents, setConsents] = useState(initial.consents);
  const [prefs, setPrefs] = useState(initial.prefs);
  const [push, setPush] = useState<PushState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone ?? '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const qrDialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pushState()
      .then(setPush)
      .catch(() => setPush('unsupported'));
  }, []);

  const patch = async (p: ProfilePatch) => {
    setProfile((cur) => ({ ...cur, ...p }));
    setProfile(await getData().updateProfile(profile.id, p));
  };

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.firstName.trim() || !draft.lastName.trim()) return setFormError(t.errors.required);
    if (draft.phone.trim() && !phoneOk(draft.phone)) return setFormError(t.errors.phone);
    setFormError(null);
    await patch({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), phone: draft.phone.trim() || null });
    setEditing(false);
    setNotice(t.common.saved);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      setAccount(await getData().uploadAvatar(await prepareAvatar(file)));
    } catch {
      setPhotoError(t.account.photoError);
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      setAccount(await getData().removeAvatar());
    } finally {
      setPhotoBusy(false);
    }
  };

  const setPref = async (kind: NotifyKind, channel: Channel, enabled: boolean) => {
    setPrefs((cur) => ({ ...cur, [kind]: { ...cur[kind], [channel]: enabled } }));
    setPrefs(await getData().setNotificationPref(kind, channel, enabled));
    // Erinnerungen per E-Mail/SMS: Spalten aus Teil 2 synchron halten
    if (kind === 'reminder' && channel === 'email') await patch({ notifyEmail: enabled });
    if (kind === 'reminder' && channel === 'sms') await patch({ notifySms: enabled });
  };

  const setConsent = async (channel: MarketingChannel, granted: boolean) => {
    setConsents((cur) => ({ ...cur, [channel]: { granted, changedAt: new Date().toISOString() } }));
    setConsents(await getData().setConsent(channel, granted));
  };

  const exportData = async () => {
    const data = await getData().exportCustomerData(profile.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hello-beauty-daten-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const deleteAccount = async () => {
    setBusy(true);
    await getData().deleteCustomer(profile.id);
    await getAuth().signOut();
    router.replace('/app/willkommen');
  };

  const logout = async () => {
    await getAuth().signOut();
    router.replace('/app/willkommen');
  };

  const themes: [ThemePref, string][] = [
    ['system', t.profile.themeSystem],
    ['light', t.profile.themeLight],
    ['dark', t.profile.themeDark],
  ];
  const when = (iso: string) => {
    const w = instantToWall(Date.parse(iso));
    return `${formatDateShort(w, lang)}, ${formatTime(w, lang)}`;
  };

  return (
    <AppPage title={t.profile.title}>
      <div className={st.profileHead}>
        <span className={st.profileAvatar} aria-hidden={!account.avatarUrl}>
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt={t.account.photo} width={64} height={64} data-testid="avatar-img" />
          ) : (
            <>
              {profile.firstName.charAt(0)}
              {profile.lastName.charAt(0)}
            </>
          )}
        </span>
        <div>
          <p className={st.profileName}>
            {profile.firstName} {profile.lastName}
          </p>
          <p className="muted">{profile.email}</p>
        </div>
      </div>
      <div className={st.actionsRow}>
        <label className={`btn btn-secondary ${st.fileBtn}`} aria-disabled={photoBusy}>
          {photoBusy ? <span className="spinner" aria-hidden="true" /> : <IconCamera size={20} />}
          {account.avatarUrl ? t.account.photoChange : t.account.photoAdd}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="visually-hidden"
            onChange={(e) => pickPhoto(e.target.files?.[0])}
            disabled={photoBusy}
          />
        </label>
        {account.avatarUrl && (
          <button type="button" className="btn btn-ghost" onClick={removePhoto} disabled={photoBusy}>
            {t.account.photoRemove}
          </button>
        )}
      </div>
      <p className="hint">{t.account.photoHint}</p>
      {photoError && (
        <p className="alert alert-error" role="alert">
          {photoError}
        </p>
      )}
      {isDemo && <p className="alert alert-info">{t.profile.demoAccount}</p>}
      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}

      <section className={st.section} aria-labelledby="p-number">
        <h2 id="p-number" className="section-title">
          {t.account.number}
        </h2>
        <div className="group">
          <div className="row">
            <span className="row-main">
              <span className={st.customerNumber} data-testid="customer-number">
                {account.customerNumber}
              </span>
              <span className="row-sub" style={{ display: 'block' }}>
                {account.crmLinked ? t.account.crmLinked : t.account.numberHint}
              </span>
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => qrDialog.current?.showModal()}>
              <IconQr size={20} />
              {t.account.showQr}
            </button>
          </div>
        </div>
      </section>

      <section className={st.section} aria-labelledby="p-personal">
        <h2 id="p-personal" className="section-title">
          {t.profile.personal}
        </h2>
        {editing ? (
          <form className={`card ${st.form}`} style={{ padding: 16 }} onSubmit={saveDetails} noValidate>
            <div className="field">
              <label className="label" htmlFor="p-first">
                {t.register.firstName}
              </label>
              <input id="p-first" className="input" autoComplete="given-name" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="p-last">
                {t.register.lastName}
              </label>
              <input id="p-last" className="input" autoComplete="family-name" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label className="label" htmlFor="p-phone">
                {t.register.phone} <small>({t.register.optional})</small>
              </label>
              <input id="p-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            {formError && (
              <p className="error-text" role="alert">
                {formError}
              </p>
            )}
            <div className={st.actionsRow}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                {t.common.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {t.common.save}
              </button>
            </div>
          </form>
        ) : (
          <div className="group">
            <div className="row">
              <span className="row-main">
                <span className="row-sub" style={{ display: 'block' }}>
                  {t.register.email}
                </span>
                {profile.email}
              </span>
            </div>
            <div className="row">
              <span className="row-main">
                <span className="row-sub" style={{ display: 'block' }}>
                  {t.register.phone}
                </span>
                {profile.phone ?? '–'}
              </span>
            </div>
            <button
              type="button"
              className="row"
              style={{ color: 'var(--link)', fontWeight: 600 }}
              onClick={() => {
                setDraft({ firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone ?? '' });
                setNotice(null);
                setEditing(true);
              }}
            >
              {t.profile.edit}
            </button>
          </div>
        )}
      </section>

      <div className="group">
        <Link className="row" href="/app/nachrichten">
          <span className="row-icon">
            <IconChat />
          </span>
          <span className="row-main">{t.account.messages}</span>
          <IconChevronRight className="row-chevron" />
        </Link>
        <Link className="row" href="/app/warteliste">
          <span className="row-icon">
            <IconHourglass />
          </span>
          <span className="row-main">{t.account.waitlist}</span>
          <IconChevronRight className="row-chevron" />
        </Link>
        <Link className="row" href="/app/push">
          <span className="row-icon">
            <IconBell />
          </span>
          <span className="row-main">{t.account.push}</span>
          <span className="row-value">{push === 'on' ? t.account.on : t.account.off}</span>
          <IconChevronRight className="row-chevron" />
        </Link>
      </div>

      <section className={st.section} aria-labelledby="p-lang">
        <h2 id="p-lang" className="section-title">
          {t.profile.language}
        </h2>
        <LangSwitch onChange={(l) => patch({ language: l })} />
      </section>

      <section className={st.section} aria-labelledby="p-theme">
        <h2 id="p-theme" className="section-title">
          {t.profile.appearance}
        </h2>
        <div className="segmented" role="group" aria-labelledby="p-theme">
          {themes.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={st.section} aria-labelledby="p-notify">
        <h2 id="p-notify" className="section-title">
          {t.account.notifyTitle}
        </h2>
        <p className="hint">{t.account.notifyHint}</p>
        <div className="group" data-testid="notify-grid">
          {KINDS.map((kind) => (
            <div key={kind} className={`row ${st.prefRow}`}>
              <span className="row-main">
                {t.account.kinds[kind]}
                {(kind === 'offer' || kind === 'news') && (
                  <span className="row-sub" style={{ display: 'block' }}>
                    {t.account.needsConsent}
                  </span>
                )}
              </span>
              <div className={st.prefChannels}>
                {CHANNELS.map((ch) => {
                  const noPhone = ch === 'sms' && !profile.phone;
                  // Werbung nur mit Einwilligung für diesen Kanal; Mitteilungen nur, wenn sie am Handy eingeschaltet sind
                  const noConsent = (kind === 'offer' || kind === 'news') && ch !== 'inapp' && !consents[ch as MarketingChannel]?.granted;
                  const noPush = ch === 'push' && push !== null && push !== 'on';
                  const blocked = noPhone || noConsent || noPush;
                  return (
                    <label key={ch} className={st.prefChannel}>
                      <input
                        type="checkbox"
                        role="switch"
                        className="switch"
                        aria-label={fmt(t.account.switchLabel, { kind: t.account.kinds[kind], channel: t.account.channels[ch] })}
                        checked={prefs[kind][ch] && !blocked}
                        disabled={blocked}
                        onChange={(e) => setPref(kind, ch, e.target.checked)}
                      />
                      <span aria-hidden="true">{t.account.channels[ch]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {!profile.phone && <p className="hint">{t.account.smsNeedsPhone}</p>}
        {push !== null && push !== 'on' && <p className="hint">{t.account.pushNeedsOn}</p>}
      </section>

      <section className={st.section} aria-labelledby="p-consent">
        <h2 id="p-consent" className="section-title">
          {t.account.consentTitle}
        </h2>
        <p className="hint">{t.account.consentHint}</p>
        <div className="group">
          {MARKETING.map((ch) => {
            const c = consents[ch];
            const noPhone = ch === 'sms' && !profile.phone;
            return (
              <label key={ch} className="row">
                <span className="row-main">
                  {t.account.consentChannels[ch]}
                  <span className="row-sub" style={{ display: 'block' }} data-testid={`consent-${ch}-at`}>
                    {c.changedAt
                      ? fmt(c.granted ? t.account.consentSince : t.account.consentRevoked, { date: when(c.changedAt) })
                      : t.account.consentNever}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={c.granted}
                  disabled={noPhone && !c.granted}
                  onChange={(e) => setConsent(ch, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      </section>

      <section className={st.section} aria-labelledby="p-data">
        <h2 id="p-data" className="section-title">
          {t.profile.data}
        </h2>
        <div className="group">
          <button type="button" className="row" onClick={exportData}>
            <span className="row-icon">
              <IconDownload />
            </span>
            <span className="row-main">
              {t.profile.export}
              <span className="row-sub" style={{ display: 'block' }}>
                {t.profile.exportHint}
              </span>
            </span>
          </button>
          <button type="button" className={`row ${st.danger}`} onClick={() => dialog.current?.showModal()}>
            <span className="row-icon" style={{ color: 'var(--error)' }}>
              <IconTrash />
            </span>
            <span className="row-main">{t.profile.delete}</span>
          </button>
          <button type="button" className="row" onClick={logout}>
            <span className="row-icon">
              <IconLogout />
            </span>
            <span className="row-main">{t.profile.logout}</span>
          </button>
        </div>
      </section>

      <section className={st.section} aria-labelledby="p-legal">
        <h2 id="p-legal" className="section-title">
          {t.profile.legal}
        </h2>
        <div className="group">
          <a className="row" href={legalUrl('imprint', lang)} target="_blank" rel="noopener noreferrer">
            <span className="row-main">{t.common.imprint}</span>
            <IconExternal className="row-chevron" />
            <span className="visually-hidden">{t.common.newWindow}</span>
          </a>
          <a className="row" href={legalUrl('privacy', lang)} target="_blank" rel="noopener noreferrer">
            <span className="row-main">{t.common.privacy}</span>
            <IconExternal className="row-chevron" />
            <span className="visually-hidden">{t.common.newWindow}</span>
          </a>
        </div>
      </section>
      <p className={st.version}>Hello Beauty · 0.2.0</p>

      <dialog ref={qrDialog} className="sheet" aria-labelledby="qr-title" onClick={(e) => e.target === qrDialog.current && qrDialog.current?.close()}>
        <div className="sheet-grip" />
        <div className={st.qrSheet}>
          <h2 id="qr-title" className={st.stepTitle}>
            {t.account.qrTitle}
          </h2>
          <QrCode value={account.customerNumber} size={220} label={`${t.account.number} ${account.customerNumber}`} />
          <p className={st.customerNumber}>{account.customerNumber}</p>
          <p className="muted">{t.account.qrText}</p>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => qrDialog.current?.close()}>
            {t.common.close}
          </button>
        </div>
      </dialog>

      <dialog ref={dialog} className="sheet" aria-labelledby="del-title" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="sheet-grip" />
        <div className={st.form}>
          <h2 id="del-title" className={st.stepTitle}>
            {t.profile.deleteTitle}
          </h2>
          <p className="muted">{t.account.deleteText}</p>
          <button type="button" className="btn btn-danger btn-lg btn-block" onClick={deleteAccount} disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t.profile.deleteConfirm}
          </button>
          <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => dialog.current?.close()}>
            {t.common.cancel}
          </button>
        </div>
      </dialog>
    </AppPage>
  );
}
