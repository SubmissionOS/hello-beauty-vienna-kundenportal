import type { NewCustomer } from '../data/types';

export interface Session {
  customerId: string;
  email: string;
  isDemo: boolean;
  /** ISO-Zeitpunkt des aktuellen Zugangstokens; die Sitzung selbst erneuert sich bis zum Abmelden */
  expiresAt: string;
}

/** Mindestlänge für neue Passwörter (die Oberfläche prüft vor dem Absenden) */
export const PASSWORD_MIN = 10;

export interface Registration extends NewCustomer {
  password: string;
}

/**
 * signed_in: Konto angelegt und angemeldet.
 * confirm_email: Konto angelegt, Supabase verlangt erst die Bestätigung per E-Mail (falls „Confirm email“ wieder AN ist).
 */
export type RegisterResult = { status: 'signed_in'; session: Session } | { status: 'confirm_email'; email: string };

export interface ResetRequest {
  /** Nur Mock-Adapter: Link zur Seite „Neues Passwort“, weil keine E-Mail versendet wird */
  mockLink?: string;
}

export type AuthErrorCode =
  | 'email_taken'
  /** bewusst neutral: falsche E-Mail ODER falsches Passwort – verrät nie, ob ein Konto existiert */
  | 'invalid_credentials'
  | 'weak_password'
  | 'reset_invalid'
  | 'rate_limited'
  | 'unknown';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

/**
 * Anmeldung mit E-Mail und Passwort, wie in jeder App – ohne Code-Eingabe und ohne Magic Link.
 * Passwortmanager (iCloud-Schlüsselbund, Google) erkennen die Formulare über autocomplete/name.
 * Supabase: signUp / signInWithPassword / resetPasswordForEmail / updateUser({ password }).
 */
export interface AuthAdapter {
  getSession(): Promise<Session | null>;
  /** Benachrichtigt bei An-/Abmeldung; gibt eine Abmeldefunktion zurück */
  onChange(listener: (session: Session | null) => void): () => void;
  register(input: Registration): Promise<RegisterResult>;
  /** remember = „Angemeldet bleiben“ (Standard AN) */
  signIn(email: string, password: string, remember?: boolean): Promise<Session>;
  /** Sendet den Link zum Zurücksetzen; antwortet immer gleich, egal ob es das Konto gibt */
  requestPasswordReset(email: string): Promise<ResetRequest>;
  /** Auf /app/passwort-neu: übernimmt die Wiederherstellungs-Sitzung aus dem Link; E-Mail des Kontos oder null (Link ungültig) */
  beginPasswordReset(): Promise<string | null>;
  /** Setzt das neue Passwort und meldet an */
  updatePassword(password: string): Promise<Session>;
  /** Nur bei NEXT_PUBLIC_DEMO_MODE=true */
  signInDemo(): Promise<Session>;
  signOut(): Promise<void>;
}
