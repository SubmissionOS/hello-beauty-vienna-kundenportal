'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthFrame } from '@/components/app/auth-frame';
import { emailOk } from '@/components/app/validate';
import st from '@/components/app/app.module.css';
import { AuthError, getAuth, type ResetRequest } from '@/lib/auth';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';

/** Link zum Zurücksetzen anfordern. Antwort ist immer gleich – verrät nicht, ob es das Konto gibt. */
export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ResetRequest | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOk(email)) {
      setError(t.errors.email);
      document.getElementById('email')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSent(await getAuth().requestPasswordReset(email));
    } catch (err) {
      setError(t.errors[err instanceof AuthError ? err.code : 'unknown']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame back="/app/anmelden">
      <div className={st.authBody}>
        {sent ? (
          <div className={st.form} role="status">
            <h1 className={st.title}>{t.reset.sentTitle}</h1>
            <p className="muted">{fmt(t.reset.sent, { email: email.trim().toLowerCase() })}</p>
            {sent.mockLink && (
              <p className="alert alert-info" data-testid="mock-reset">
                {t.reset.mockNotice} <Link href={sent.mockLink}>{t.reset.mockLink}</Link>
              </p>
            )}
            <Link href="/app/anmelden" className="btn btn-secondary btn-lg btn-block">
              {t.reset.backToLogin}
            </Link>
          </div>
        ) : (
          <form className={st.form} onSubmit={submit} noValidate>
            <h1 className={st.title}>{t.reset.title}</h1>
            <p className="muted">{t.reset.lead}</p>
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
                aria-invalid={!!error}
                aria-describedby={error ? 'email-error' : undefined}
                required
              />
              {error && (
                <p id="email-error" className="error-text" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t.reset.submit}
            </button>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
