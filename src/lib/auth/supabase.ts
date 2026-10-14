import type { AuthError as SbAuthError, Session as SbSession } from '@supabase/supabase-js';
import { getData } from '../data';
import type { NewCustomer } from '../data/types';
import { env } from '../env';
import { supabaseBrowser } from '../supabase/client';
import { AuthError, PASSWORD_MIN, type AuthAdapter, type Registration, type Session } from './types';

/**
 * Supabase Auth mit E-Mail und Passwort (signUp / signInWithPassword), keine Codes, keine Magic Links.
 * Registrierung: Angaben werden bis zur ersten Sitzung lokal gemerkt und dann per register_customer gespeichert –
 * bei „Confirm email“ AUS sofort, bei AN nach der Bestätigung beim ersten Anmelden.
 * Die Sitzung liegt im localStorage und erneuert sich selbst; sie endet erst mit dem Abmelden.
 */
const PENDING_KEY = 'hb-pending-registration';
/** Zuordnung Auth-Nutzerin → Kundin, damit ein Start ohne Netz nicht als „abgemeldet“ erscheint */
const CUSTOMER_KEY = 'hb-customer';

interface Pending {
  email: string;
  data: NewCustomer;
  at: number;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privater Modus */
  }
}
function readPending(): Pending | null {
  const p = read<Pending>(PENDING_KEY);
  return p && Date.now() - p.at < 7 * 86_400_000 ? p : null;
}

function mapError(e: SbAuthError | null, fallback: AuthError['code'] = 'unknown'): AuthError {
  if (!e) return new AuthError(fallback);
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') {
    return new AuthError('rate_limited');
  }
  if (e.code === 'weak_password' || e.code === 'same_password') return new AuthError('weak_password');
  if (e.code === 'user_already_exists' || e.code === 'email_exists') return new AuthError('email_taken');
  return new AuthError(fallback);
}

const norm = (email: string) => email.trim().toLowerCase();

export class SupabaseAuthAdapter implements AuthAdapter {
  private creating: Promise<string> | null = null;

  private get sb() {
    return supabaseBrowser();
  }

  /** Verknüpft die Auth-Sitzung mit der Kundin im aktuellen Tenant (legt sie nach der Registrierung an). */
  private async toSession(s: SbSession | null): Promise<Session | null> {
    if (!s?.user.email) return null;
    const email = s.user.email.toLowerCase();
    let customerId: string | null;
    try {
      customerId = await getData().findCustomerIdByEmail(email);
    } catch (e) {
      const cached = read<{ userId: string; customerId: string }>(CUSTOMER_KEY);
      if (cached?.userId !== s.user.id) throw e;
      customerId = cached.customerId;
    }
    if (!customerId) {
      const pending = readPending();
      if (pending?.email !== email) return null;
      // signUp löst zusätzlich onAuthStateChange aus – die Kundin nur einmal anlegen
      this.creating ??= getData()
        .createCustomer(pending.data)
        .then((c) => c.id)
        .finally(() => (this.creating = null));
      customerId = await this.creating;
      write(PENDING_KEY, null);
    }
    write(CUSTOMER_KEY, { userId: s.user.id, customerId });
    return {
      customerId,
      email,
      isDemo: s.user.app_metadata?.demo === true,
      expiresAt: new Date((s.expires_at ?? 0) * 1000).toISOString(),
    };
  }

  /** Auth-Konto ohne Kundin in diesem Salon: wieder abmelden und neutral antworten */
  private async sessionOrFail(s: SbSession | null, code: AuthError['code']): Promise<Session> {
    let session: Session | null = null;
    try {
      session = await this.toSession(s);
    } catch (e) {
      await this.sb.auth.signOut({ scope: 'local' });
      throw new AuthError((e as { code?: string }).code === 'email_taken' ? 'email_taken' : 'unknown');
    }
    if (!session) {
      await this.sb.auth.signOut({ scope: 'local' });
      throw new AuthError(code);
    }
    return session;
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

  async register(input: Registration) {
    if (input.password.length < PASSWORD_MIN) throw new AuthError('weak_password');
    const email = norm(input.email);
    const { password, ...data } = input;
    write(PENDING_KEY, { email, data: { ...data, email }, at: Date.now() } satisfies Pending);
    const { data: res, error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { language: input.language }, emailRedirectTo: `${location.origin}/app/anmelden` },
    });
    if (error) {
      const mapped = mapError(error);
      if (mapped.code !== 'email_taken') throw mapped;
      // Konto gibt es schon (z. B. aus einem anderen Salon): mit dem eingegebenen Passwort anmelden versuchen
      const retry = await this.sb.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data.session) throw new AuthError('email_taken');
      return { status: 'signed_in' as const, session: await this.sessionOrFail(retry.data.session, 'email_taken') };
    }
    if (!res.session) return { status: 'confirm_email' as const, email };
    return { status: 'signed_in' as const, session: await this.sessionOrFail(res.session, 'unknown') };
  }

  async signIn(raw: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: norm(raw), password });
    if (error || !data.session) {
      // nie unterscheiden zwischen „kein Konto“, „falsches Passwort“ und „nicht bestätigt“
      throw error?.status === 429 ? new AuthError('rate_limited') : new AuthError('invalid_credentials');
    }
    return this.sessionOrFail(data.session, 'invalid_credentials');
  }

  async requestPasswordReset(raw: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(norm(raw), {
      redirectTo: `${location.origin}/app/passwort-neu`,
    });
    if (error) {
      const mapped = mapError(error);
      if (mapped.code === 'rate_limited') throw mapped;
      // Fehler wegen unbekannter Adresse o. Ä. nicht verraten
      if (!error.status || error.status >= 500) throw new AuthError('unknown');
    }
    return {};
  }

  /** Link aus der Mail: #access_token=…&refresh_token=…&type=recovery (impliziter Ablauf, klappt in jedem Browser) */
  async beginPasswordReset() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('error') || hash.get('error_code')) {
      history.replaceState(null, '', location.pathname);
      return null;
    }
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (access_token && refresh_token) {
      history.replaceState(null, '', location.pathname);
      const { data, error } = await this.sb.auth.setSession({ access_token, refresh_token });
      return error ? null : (data.session?.user.email ?? null);
    }
    const { data } = await this.sb.auth.getSession();
    return data.session?.user.email ?? null;
  }

  async updatePassword(password: string) {
    if (password.length < PASSWORD_MIN) throw new AuthError('weak_password');
    const { data: current } = await this.sb.auth.getSession();
    if (!current.session) throw new AuthError('reset_invalid');
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error.code === 'reauthentication_needed' ? new AuthError('reset_invalid') : mapError(error);
    const { data } = await this.sb.auth.getSession();
    return this.sessionOrFail(data.session, 'reset_invalid');
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
    write(CUSTOMER_KEY, null);
    await this.sb.auth.signOut({ scope: 'local' });
  }
}
