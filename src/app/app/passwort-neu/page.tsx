'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthFrame } from '@/components/app/auth-frame';
import { PasswordField } from '@/components/app/password-field';
import st from '@/components/app/app.module.css';
import { AuthError, getAuth, PASSWORD_MIN } from '@/lib/auth';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * Ziel des Links aus der Mail „Passwort zurücksetzen“ (redirectTo <Origin>/app/passwort-neu).
 * Das versteckte Feld mit der E-Mail sorgt dafür, dass der Passwortmanager den richtigen Eintrag aktualisiert.
 */
export default function NewPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAuth()
      .beginPasswordReset()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setError(t.errors.password_short);
      document.getElementById('new-password')?.focus();
      return;
    }
    setError(null);
    setFormError(null);
    setBusy(true);
    try {
      await getAuth().updatePassword(password);
      router.replace('/app');
    } catch (err) {
      const code = err instanceof AuthError ? err.code : 'unknown';
      if (code === 'reset_invalid') setAccount(null);
      else setFormError(t.errors[code]);
      setBusy(false);
    }
  };

  return (
    <AuthFrame back="/app/anmelden" stay>
      <div className={st.authBody}>
        {account === undefined ? (
          <p className="muted" role="status">
            <span className="spinner" aria-hidden="true" /> {t.reset.checking}
          </p>
        ) : account === null ? (
          <div className={st.form} role="alert">
            <h1 className={st.title}>{t.reset.invalidTitle}</h1>
            <p className="muted">{t.reset.invalidText}</p>
            <Link href="/app/passwort-vergessen" className="btn btn-primary btn-lg btn-block">
              {t.reset.again}
            </Link>
          </div>
        ) : (
          <form className={st.form} onSubmit={submit} noValidate>
            <h1 className={st.title}>{t.reset.newTitle}</h1>
            <p className="muted">{t.reset.newLead}</p>
            <input type="email" name="email" autoComplete="username" value={account} readOnly hidden />
            <PasswordField
              id="new-password"
              label={t.reset.newPassword}
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              error={error}
              hint={t.register.passwordHint}
            />
            {formError && (
              <p className="alert alert-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t.reset.save}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
