'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthFrame } from '@/components/app/auth-frame';
import { PasswordField } from '@/components/app/password-field';
import { emailOk, phoneOk } from '@/components/app/validate';
import st from '@/components/app/app.module.css';
import { AuthError, getAuth, PASSWORD_MIN } from '@/lib/auth';
import { fmt } from '@/lib/i18n';
import { isLang, langs, type Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { legalUrl } from '@/lib/salon';

type Field = 'firstName' | 'lastName' | 'email' | 'password' | 'phone';

export default function RegisterPage() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '' });
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** E-Mail-Adresse, falls Supabase erst eine Bestätigung verlangt */
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!values.firstName.trim()) next.firstName = t.errors.required;
    if (!values.lastName.trim()) next.lastName = t.errors.required;
    if (!emailOk(values.email)) next.email = t.errors.email;
    if (values.password.length < PASSWORD_MIN) next.password = t.errors.password_short;
    if (values.phone.trim() && !phoneOk(values.phone)) next.phone = t.errors.phone;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0]!)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await getAuth().register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
        phone: values.phone.trim() || null,
        language: lang,
        marketingConsent: marketing,
      });
      if (res.status === 'signed_in') return router.replace('/app');
      setConfirmFor(res.email);
    } catch (err) {
      setFormError(t.errors[err instanceof AuthError ? err.code : 'unknown']);
    }
    setBusy(false);
  };

  const input = (k: Exclude<Field, 'password'>, label: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="field">
      <label className="label" htmlFor={k}>
        {label}
      </label>
      <input
        id={k}
        name={k}
        className="input"
        value={values[k]}
        onChange={set(k)}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? `${k}-error` : k === 'phone' ? 'phone-hint' : undefined}
        {...props}
      />
      {k === 'phone' && !errors[k] && (
        <p id="phone-hint" className="hint">
          {t.register.phoneHint}
        </p>
      )}
      {errors[k] && (
        <p id={`${k}-error`} className="error-text">
          {errors[k]}
        </p>
      )}
    </div>
  );

  return (
    <AuthFrame back="/app/willkommen">
      <div className={st.authBody}>
        {confirmFor ? (
          <div className={st.form} role="status">
            <h1 className={st.title}>{t.register.confirmTitle}</h1>
            <p className="muted">{fmt(t.register.confirmText, { email: confirmFor })}</p>
            <Link href="/app/anmelden" className="btn btn-primary btn-lg btn-block">
              {t.register.toLogin}
            </Link>
          </div>
        ) : (
          <form className={st.form} onSubmit={submit} noValidate>
            <h1 className={st.title}>{t.register.title}</h1>
            <p className="muted">{t.register.lead}</p>
            <div className={st.twoCols}>
              {input('firstName', t.register.firstName, { autoComplete: 'given-name', required: true })}
              {input('lastName', t.register.lastName, { autoComplete: 'family-name', required: true })}
            </div>
            {input('email', t.register.email, {
              type: 'email',
              inputMode: 'email',
              autoComplete: 'username',
              autoCapitalize: 'none',
              spellCheck: false,
              required: true,
            })}
            <PasswordField
              id="password"
              label={t.register.password}
              autoComplete="new-password"
              value={values.password}
              onChange={(v) => {
                setValues((x) => ({ ...x, password: v }));
                if (v.length >= PASSWORD_MIN) setErrors((x) => ({ ...x, password: undefined }));
              }}
              error={errors.password}
              hint={t.register.passwordHint}
            />
            {input(
              'phone',
              <>
                {t.register.phone} <small>({t.register.optional})</small>
              </>,
              { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
            )}
            <div className="field">
              <label className="label" htmlFor="language">
                {t.register.language}
              </label>
              <select
                id="language"
                className="select"
                value={lang}
                onChange={(e) => isLang(e.target.value) && setLang(e.target.value as Lang)}
              >
                {langs.map((l) => (
                  <option key={l} value={l}>
                    {t.common.langNames[l]}
                  </option>
                ))}
              </select>
            </div>
            <p className="hint">
              {t.register.privacy}{' '}
              <a href={legalUrl('privacy', lang)} target="_blank" rel="noopener noreferrer">
                {t.register.privacyLink}
              </a>
              .
            </p>
            <label className="check">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>{t.register.marketing}</span>
            </label>
            {formError && (
              <p className="alert alert-error" role="alert">
                {formError}{' '}
                {formError === t.errors.email_taken && <Link href="/app/anmelden">{t.register.toLogin}</Link>}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t.register.submit}
            </button>
            <p className={st.switchLine}>
              {t.register.haveAccount} <Link href="/app/anmelden">{t.register.toLogin}</Link>
            </p>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
