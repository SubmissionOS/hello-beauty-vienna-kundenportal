'use client';

import { useState } from 'react';
import { IconEye, IconEyeOff } from '@/components/icons';
import { useI18n } from '@/lib/i18n/use-i18n';
import st from './app.module.css';

/**
 * Passwortfeld mit Anzeigen/Verbergen. autocomplete + name/id sind so gesetzt, dass iCloud-Schlüsselbund und
 * Google-Passwortmanager vorschlagen (new-password) bzw. ausfüllen (current-password) und danach speichern.
 */
export function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  autoComplete: 'new-password' | 'current-password';
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className={st.pw}>
        <input
          id={id}
          name={id}
          className={`input ${st.pwInput}`}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={autoComplete === 'new-password' ? 10 : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={described}
          required
        />
        <button
          type="button"
          className={st.pwToggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.password.hide : t.password.show}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <IconEyeOff size={22} /> : <IconEye size={22} />}
        </button>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
