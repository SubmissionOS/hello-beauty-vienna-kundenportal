'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthFrame } from '@/components/app/auth-frame';
import { PasswordField } from '@/components/app/password-field';
import { emailOk } from '@/components/app/validate';
import st from '@/components/app/app.module.css';
import { AuthError, getAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n/use-i18n';

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eErr = emailOk(email) ? null : t.errors.email;
    const pErr = password ? null : t.errors.required;
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    if (eErr || pErr) {
      document.getElementById(eErr ? 'email' : 'password')?.focus();
      return;
    }
    setBusy(true);
    try {
      await getAuth().signIn(email, password, remember);
      router.replace('/app');
    } catch (err) {
      setFormError(t.errors[err instanceof AuthError ? err.code : 'unknown']);
      setBusy(false);
    }
  };

  return (
    <AuthFrame back="/app/willkommen">
      <div className={st.authBody}>
        <form className={st.form} onSubmit={submit} noValidate>
          <h1 className={st.title}>{t.login.title}</h1>
          <p className="muted">{t.login.lead}</p>
          <div className="field">
            <label className="label" htmlFor="email">
              {t.register.email}
            </label>
            <input
              id="email"
              name="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'email-error' : undefined}
              required
            />
            {emailError && (
              <p id="email-error" className="error-text">
                {emailError}
              </p>
            )}
          </div>
          <PasswordField
            id="password"
            label={t.login.password}
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={passwordError}
          />
          <label className="check">
            <input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              {t.login.remember}
              {!remember && <span className="hint" style={{ display: 'block' }}>{t.login.rememberHint}</span>}
            </span>
          </label>
          {formError && (
            <p className="alert alert-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t.login.submit}
          </button>
          <p className={st.switchLine}>
            <Link href="/app/passwort-vergessen">{t.login.forgot}</Link>
          </p>
          <p className={st.switchLine}>
            {t.login.noAccount} <Link href="/app/registrieren">{t.login.toRegister}</Link>
          </p>
        </form>
      </div>
    </AuthFrame>
  );
}
