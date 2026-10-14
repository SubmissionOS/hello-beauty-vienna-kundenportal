'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthFrame } from '@/components/app/auth-frame';
import { CodeStep, emailOk } from '@/components/app/code-step';
import st from '@/components/app/app.module.css';
import { AuthError, getAuth, type CodeRequest } from '@/lib/auth';
import { useI18n } from '@/lib/i18n/use-i18n';

export default function LoginPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState<CodeRequest | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOk(email)) {
      setError(t.errors.email);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRequest(await getAuth().requestCode(email));
    } catch (err) {
      setError(t.errors[err instanceof AuthError ? err.code : 'unknown']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame back="/app/willkommen">
      <div className={st.authBody}>
        {request ? (
          <CodeStep request={request} onChangeEmail={() => setRequest(null)} />
        ) : (
          <form className={st.form} onSubmit={submit} noValidate>
            <h1 className={st.title}>{t.login.title}</h1>
            <p className="muted">{t.login.lead}</p>
            <div className="field">
              <label className="label" htmlFor="email">
                {t.register.email}
              </label>
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
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
                  {error === t.errors.unknown_email && (
                    <>
                      {' '}
                      <Link href="/app/registrieren">{t.login.toRegister}</Link>
                    </>
                  )}
                </p>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {t.login.submit}
            </button>
            <p className={st.switchLine}>
              {t.login.noAccount} <Link href="/app/registrieren">{t.login.toRegister}</Link>
            </p>
          </form>
        )}
      </div>
    </AuthFrame>
  );
}
