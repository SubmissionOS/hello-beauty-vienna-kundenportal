import type { NewCustomer } from '../data/types';

export interface Session {
  customerId: string;
  email: string;
  isDemo: boolean;
  /** ISO-Zeitpunkt */
  expiresAt: string;
}

export interface CodeRequest {
  email: string;
  /** Sekunden bis „Code erneut senden“ möglich ist */
  resendAfterSeconds: number;
  /** Nur Mock-Adapter: der Code wird angezeigt, weil keine E-Mail versendet wird */
  mockCode?: string;
}

export type AuthErrorCode =
  | 'email_taken'
  | 'unknown_email'
  | 'invalid_code'
  | 'expired'
  | 'too_many_attempts'
  | 'rate_limited'
  | 'unknown';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

/**
 * Anmeldung ausschließlich per 6-stelligem E-Mail-Code (OTP), keine Magic Links:
 * ein Link aus der Mail öffnet auf iOS Safari statt der installierten App (getrennter Speicher).
 * Teil 2: SupabaseAuthAdapter mit signInWithOtp({ email, options: { shouldCreateUser } }) + verifyOtp({ type: 'email' }).
 */
export interface AuthAdapter {
  getSession(): Promise<Session | null>;
  /** Benachrichtigt bei An-/Abmeldung; gibt eine Abmeldefunktion zurück */
  onChange(listener: (session: Session | null) => void): () => void;
  /** Registrierung: merkt die Angaben vor und sendet den Code. Konto entsteht erst nach verifyCode. */
  register(input: NewCustomer): Promise<CodeRequest>;
  /** Anmeldung bestehender Kundin: sendet den Code */
  requestCode(email: string): Promise<CodeRequest>;
  verifyCode(email: string, code: string): Promise<Session>;
  /** Nur bei NEXT_PUBLIC_DEMO_MODE=true */
  signInDemo(): Promise<Session>;
  signOut(): Promise<void>;
}
