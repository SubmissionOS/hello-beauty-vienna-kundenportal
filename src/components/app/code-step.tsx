'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, getAuth, type CodeRequest } from '@/lib/auth';
import { fmt } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

/** Eingabe des 6-stelligen Codes. iOS schlägt den Code aus Mail/Nachrichten vor (autocomplete="one-time-code"). */
export function CodeStep({ request, onChangeEmail }: { request: CodeRequest; onChangeEmail: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [req, setReq] = useState(request);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(request.resendAfterSeconds);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await getAuth().verifyCode(req.email, value);
      router.replace('/app');
    } catch (e) {
      setError(t.errors[e instanceof AuthError ? e.code : 'unknown']);
      setCode('');
      setBusy(false);
      input.current?.focus();
    }
  };

  const resend = async () => {
    setError(null);
    try {
      const next = await getAuth().requestCode(req.email);
      setReq(next);
      setLeft(next.resendAfterSeconds);
      setInfo(t.code.resent);
    } catch (e) {
      setError(t.errors[e instanceof AuthError ? e.code : 'unknown']);
    }
  };

  return (
    <form
      className={st.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) verify(code);
      }}
    >
      <h1 className={st.title}>{t.code.title}</h1>
      <p className="muted">{fmt(t.code.lead, { email: req.email })}</p>
      {req.mockCode && (
        <p className="alert alert-info" data-testid="mock-code">
          {fmt(t.code.mockNotice, { code: req.mockCode })}
        </p>
      )}
      <label className="label" htmlFor="otp">
        {t.code.label}
      </label>
      <div className={st.code} data-error={String(!!error)}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={st.codeBox} data-active={String(i === Math.min(code.length, 5))} aria-hidden="true">
            {code[i] ?? ''}
          </span>
        ))}
        <input
          ref={input}
          id="otp"
          className={st.codeInput}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          disabled={busy}
          aria-invalid={!!error}
          aria-describedby={error ? 'otp-error' : undefined}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(v);
            if (v.length === 6) verify(v);
          }}
        />
      </div>
      {error && (
        <p id="otp-error" className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {info && !error && (
        <p className="hint" role="status">
          {info}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || code.length < 6}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {t.code.submit}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onChangeEmail} style={{ paddingLeft: 0 }}>
          {t.code.changeEmail}
        </button>
        <button type="button" className="btn btn-ghost" onClick={resend} disabled={left > 0}>
          {left > 0 ? fmt(t.code.resendIn, { s: left }) : t.code.resend}
        </button>
      </div>
    </form>
  );
}

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const phoneOk = (v: string) => /^\+?[0-9][0-9 ()/-]{5,19}$/.test(v.trim());
