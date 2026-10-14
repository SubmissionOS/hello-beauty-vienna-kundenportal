/**
 * Mock-Anmeldung (Demo/Test ohne Server): Konten mit Passwort im localStorage des Geräts.
 * Passwörter nur als PBKDF2-Hash mit Salz – auch im Testbetrieb nie im Klartext.
 * „Passwort vergessen“ versendet keine E-Mail, sondern zeigt den Link direkt an.
 */
import { getData } from '../data';
import { env } from '../env';
import { DEMO_CUSTOMER_ID, DEMO_EMAIL, ensureDemoCustomer, loadDb, saveDb } from '../data/mock/db';
import { AuthError, PASSWORD_MIN, type AuthAdapter, type Registration, type Session } from './types';

const SESSION_KEY = 'hb-mock-session';
const PASSWORDS_KEY = 'hb-mock-passwords';
const RECOVERY_KEY = 'hb-mock-recovery';
const RECOVERY_TTL_MS = 60 * 60_000;
const TOKEN_HOURS = 1;

interface PasswordHash {
  salt: string;
  hash: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
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

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 },
    key,
    256,
  );
  return hex(bits);
}

async function setPassword(email: string, password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const all = read<Record<string, PasswordHash>>(PASSWORDS_KEY) ?? {};
  all[email] = { salt, hash: await derive(password, salt) };
  write(PASSWORDS_KEY, all);
}

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const stored = read<Record<string, PasswordHash>>(PASSWORDS_KEY)?.[email];
  // auch ohne Konto rechnen, damit die Antwortzeit nichts verrät
  const hash = await derive(password, stored?.salt ?? 'kein-konto');
  return !!stored && hash === stored.hash;
}

const norm = (email: string) => email.trim().toLowerCase();

export class MockAuthAdapter implements AuthAdapter {
  private listeners = new Set<(s: Session | null) => void>();

  private emit(session: Session | null) {
    this.listeners.forEach((l) => l(session));
  }

  private startSession(customerId: string, email: string, isDemo: boolean): Session {
    const session: Session = {
      customerId,
      email,
      isDemo,
      expiresAt: new Date(Date.now() + TOKEN_HOURS * 3_600_000).toISOString(),
    };
    write(SESSION_KEY, session);
    this.emit(session);
    return session;
  }

  /** Sitzung gilt bis zum Abmelden (wie bei Supabase mit Refresh-Token) */
  async getSession() {
    const s = read<Session>(SESSION_KEY);
    if (!s) return null;
    if (!loadDb().customers[s.customerId]) {
      write(SESSION_KEY, null);
      return null;
    }
    return s;
  }

  onChange(listener: (s: Session | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async register(input: Registration) {
    await wait(350);
    if (input.password.length < PASSWORD_MIN) throw new AuthError('weak_password');
    const email = norm(input.email);
    if (await getData().findCustomerIdByEmail(email)) throw new AuthError('email_taken');
    const { password, ...data } = input;
    const profile = await getData().createCustomer({ ...data, email });
    await setPassword(email, password);
    return { status: 'signed_in' as const, session: this.startSession(profile.id, email, false) };
  }

  async signIn(rawEmail: string, password: string) {
    await wait(350);
    const email = norm(rawEmail);
    const customerId = await getData().findCustomerIdByEmail(email);
    if (!(await passwordMatches(email, password)) || !customerId) throw new AuthError('invalid_credentials');
    return this.startSession(customerId, email, customerId === DEMO_CUSTOMER_ID);
  }

  async requestPasswordReset(rawEmail: string) {
    await wait(350);
    const email = norm(rawEmail);
    if (await getData().findCustomerIdByEmail(email)) write(RECOVERY_KEY, { email, expiresAt: Date.now() + RECOVERY_TTL_MS });
    // gleiche Antwort mit oder ohne Konto
    return { mockLink: '/app/passwort-neu' };
  }

  async beginPasswordReset() {
    const r = read<{ email: string; expiresAt: number }>(RECOVERY_KEY);
    if (r && r.expiresAt > Date.now()) return r.email;
    return (await this.getSession())?.email ?? null;
  }

  async updatePassword(password: string) {
    await wait(300);
    if (password.length < PASSWORD_MIN) throw new AuthError('weak_password');
    const r = read<{ email: string; expiresAt: number }>(RECOVERY_KEY);
    const email = r && r.expiresAt > Date.now() ? r.email : (await this.getSession())?.email;
    const customerId = email ? await getData().findCustomerIdByEmail(email) : null;
    if (!email || !customerId) throw new AuthError('reset_invalid');
    await setPassword(email, password);
    write(RECOVERY_KEY, null);
    return this.startSession(customerId, email, customerId === DEMO_CUSTOMER_ID);
  }

  async signInDemo() {
    if (!env.demoMode) throw new AuthError('unknown');
    saveDb(ensureDemoCustomer(loadDb()));
    return this.startSession(DEMO_CUSTOMER_ID, DEMO_EMAIL, true);
  }

  async signOut() {
    write(SESSION_KEY, null);
    this.emit(null);
  }
}
