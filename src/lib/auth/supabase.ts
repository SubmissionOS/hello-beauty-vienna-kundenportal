import type { AuthError as SbAuthError, Session as SbSession } from '@supabase/supabase-js';
import { getData } from '../data';
import type { NewCustomer } from '../data/types';
import { env } from '../env';
import { supabaseBrowser } from '../supabase/client';
import { AuthError, type AuthAdapter, type CodeRequest, type Session } from './types';

/**
 * Supabase Auth mit 6-stelligem E-Mail-Code (signInWithOtp + verifyOtp type 'email'), keine Magic Links.
 * Registrierung: shouldCreateUser true, Angaben werden bis zur Code-Bestätigung lokal gemerkt und danach per
 * register_customer gespeichert. Anmeldung: shouldCreateUser false.
 */
const PENDING_KEY = 'hb-pending-registration';
const RESEND_S = 60; // Supabase erlaubt pro Adresse einen Code je 60 s

interface Pending {
  email: string;
  data: NewCustomer;
  at: number;
}

function readPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as Pending | null;
    return p && Date.now() - p.at < 24 * 3600_000 ? p : null;
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* privater Modus */
  }
}

function mapError(e: SbAuthError | null, fallback: AuthError['code'] = 'unknown'): AuthError {
  if (!e) return new AuthError(fallback);
  if (e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit') {
    return new AuthError('rate_limited');
  }
  if (e.code === 'otp_disabled' || e.code === 'user_not_found' || /signups not allowed/i.test(e.message)) {
    return new AuthError('unknown_email');
  }
  if (e.code === 'otp_expired') return new AuthError('invalid_code');
  return new AuthError(fallback);
}

export class SupabaseAuthAdapter implements AuthAdapter {
  private creating: Promise<string> | null = null;
  private createdFor: { email: string; id: string } | null = null;

  private sessionFor(s: SbSession, email: string, customerId: string): Session {
    return {
      customerId,
      email,
      isDemo: s.user.app_metadata?.demo === true,
      expiresAt: new Date((s.expires_at ?? 0) * 1000).toISOString(),
    };
  }

  private get sb() {
    return supabaseBrowser();
  }

  /** Verknüpft die Auth-Sitzung mit der Kundin im aktuellen Tenant (legt sie nach der Registrierung an). */
  private async toSession(s: SbSession | null): Promise<Session | null> {
    if (!s?.user.email) return null;
    const email = s.user.email.toLowerCase();
    let customerId = await getData().findCustomerIdByEmail(email);
    if (!customerId) {
      const pending = readPending();
      // parallel gerade angelegt (Angaben schon gelöscht) → dieselbe Kundin
      if (pending?.email !== email) return this.createdFor?.email === email ? this.sessionFor(s, email, this.createdFor.id) : null;
      // Anmeldung löst zusätzlich onAuthStateChange aus – die Kundin nur einmal anlegen (gleich wie Hotfix auf main)
      this.creating ??= getData()
        .createCustomer(pending.data)
        .then((c) => c.id)
        .finally(() => (this.creating = null));
      customerId = await this.creating;
      this.createdFor = { email, id: customerId };
      writePending(null);
    }
    return {
      customerId,
      email,
      isDemo: s.user.app_metadata?.demo === true,
      expiresAt: new Date((s.expires_at ?? 0) * 1000).toISOString(),
    };
  }

  async getSession() {
    const { data } = await this.sb.auth.getSession();
    try {
      return await this.toSession(data.session);
    } catch {
      return null;
    }
  }

  onChange(listener: (s: Session | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      // Supabase empfiehlt, im Callback keine weiteren Supabase-Aufrufe abzuwarten
      setTimeout(() => {
        this.toSession(session)
          .then(listener)
          .catch(() => listener(null));
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async register(input: NewCustomer): Promise<CodeRequest> {
    const email = input.email.trim().toLowerCase();
    writePending({ email, data: { ...input, email }, at: Date.now() });
    const { error } = await this.sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { language: input.language } },
    });
    if (error) throw mapError(error);
    return { email, resendAfterSeconds: RESEND_S };
  }

  async requestCode(raw: string): Promise<CodeRequest> {
    const email = raw.trim().toLowerCase();
    // Während einer laufenden Registrierung darf der Code erneut gesendet werden
    const registering = readPending()?.email === email;
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: registering } });
    if (error) throw mapError(error);
    return { email, resendAfterSeconds: RESEND_S };
  }

  async verifyCode(raw: string, code: string): Promise<Session> {
    const email = raw.trim().toLowerCase();
    const { data, error } = await this.sb.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw mapError(error, 'invalid_code');
    let session: Session | null = null;
    try {
      session = await this.toSession(data.session);
    } catch (e) {
      const code = (e as { code?: string }).code;
      await this.sb.auth.signOut({ scope: 'local' });
      throw new AuthError(code === 'email_taken' ? 'email_taken' : 'unknown');
    }
    if (!session) {
      // Auth-Konto existiert, aber nicht als Kundin dieses Salons
      await this.sb.auth.signOut({ scope: 'local' });
      throw new AuthError('unknown_email');
    }
    return session;
  }

  async signInDemo(): Promise<Session> {
    if (!env.demoMode) throw new AuthError('unknown');
    const res = await fetch('/api/demo-login', { method: 'POST' });
    if (!res.ok) throw new AuthError('unknown');
    const tokens = (await res.json()) as { access_token: string; refresh_token: string };
    const { data, error } = await this.sb.auth.setSession(tokens);
    if (error) throw mapError(error);
    const session = await this.toSession(data.session);
    if (!session) throw new AuthError('unknown');
    return session;
  }

  async signOut() {
    await this.sb.auth.signOut({ scope: 'local' });
  }
}
