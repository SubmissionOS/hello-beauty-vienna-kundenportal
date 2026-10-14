'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppPage, PageSkeleton } from '@/components/app/app-page';
import st from '@/components/app/app.module.css';
import { phoneOk } from '@/components/app/validate';
import { useLoad } from '@/components/app/use-load';
import { IconDownload, IconExternal, IconLogout, IconTrash } from '@/components/icons';
import { LangSwitch } from '@/components/lang-switch';
import { getAuth } from '@/lib/auth';
import { useSession } from '@/lib/auth/use-session';
import { getData, type CustomerProfile, type ProfilePatch } from '@/lib/data';
import { useI18n } from '@/lib/i18n/use-i18n';
import { legalUrl } from '@/lib/salon';
import { setTheme, useThemePref, type ThemePref } from '@/lib/theme';

export default function ProfilePage() {
  const session = useSession();
  const id = session.status === 'in' ? session.session.customerId : null;
  const { state } = useLoad(id ? () => getData().getProfile(id) : null, `profile-${id}`);
  if (state.status !== 'ready' || !state.data || session.status !== 'in') return <PageSkeleton />;
  return <Profile initial={state.data} isDemo={session.session.isDemo} />;
}

function Profile({ initial, isDemo }: { initial: CustomerProfile; isDemo: boolean }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const theme = useThemePref();
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ firstName: initial.firstName, lastName: initial.lastName, phone: initial.phone ?? '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

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

  return (
    <AppPage title={t.profile.title}>
      <div className={st.profileHead}>
        <span className={st.profileAvatar} aria-hidden="true">
          {profile.firstName.charAt(0)}
          {profile.lastName.charAt(0)}
        </span>
        <div>
          <p className={st.profileName}>
            {profile.firstName} {profile.lastName}
          </p>
          <p className="muted">{profile.email}</p>
        </div>
      </div>
      {isDemo && <p className="alert alert-info">{t.profile.demoAccount}</p>}
      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}

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
          {t.profile.notifications}
        </h2>
        <div className="group">
          <label className="row">
            <span className="row-main">{t.profile.notifyEmail}</span>
            <input type="checkbox" role="switch" className="switch" checked={profile.notifyEmail} onChange={(e) => patch({ notifyEmail: e.target.checked })} />
          </label>
          <label className="row">
            <span className="row-main">
              {t.profile.notifySms}
              {!profile.phone && (
                <span className="row-sub" style={{ display: 'block' }}>
                  {t.profile.smsNeedsPhone}
                </span>
              )}
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={profile.notifySms}
              disabled={!profile.phone}
              onChange={(e) => patch({ notifySms: e.target.checked })}
            />
          </label>
          <label className="row">
            <span className="row-main">
              {t.profile.marketing}
              <span className="row-sub" style={{ display: 'block' }}>
                {t.profile.marketingHint}
              </span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={profile.marketingConsent} onChange={(e) => patch({ marketingConsent: e.target.checked })} />
          </label>
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
      <p className={st.version}>Hello Beauty · 0.1.0</p>

      <dialog ref={dialog} className="sheet" aria-labelledby="del-title" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
        <div className="sheet-grip" />
        <div className={st.form}>
          <h2 id="del-title" className={st.stepTitle}>
            {t.profile.deleteTitle}
          </h2>
          <p className="muted">{t.profile.deleteText}</p>
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
