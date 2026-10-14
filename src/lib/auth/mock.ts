/**
 * Mock-Anmeldung für Teil 1: Code wird lokal erzeugt und in der Oberfläche angezeigt (kein E-Mail-Versand).
 * Regeln wie später in Produktion: 6 Ziffern, 10 Minuten gültig, 5 Versuche, 30 s bis zum erneuten Senden.
 */
import { getData } from '../data';
import { env } from '../env';
import type { NewCustomer } from '../data/types';
import { DEMO_CUSTOMER_ID, DEMO_EMAIL, ensureDemoCustomer, loadDb, saveDb } from '../data/mock/db';
import { AuthError, type AuthAdapter, type CodeRequest, type Session } from './types';

const SESSION_KEY = 'hb-mock-session';
const PENDING_KEY = 'hb-mock-pending';
const CODE_TTL_MS = 10 * 60_000;
const RESEND_S = 30;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = 90;

interface Pending {
  email: string;
  code: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
  registration?: NewCustomer;
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

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, '0');
}

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
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
    };
    write(SESSION_KEY, session);
    this.emit(session);
    return session;
  }

  private send(email: string, registration?: NewCustomer): CodeRequest {
    const prev = read<Pending>(PENDING_KEY);
    if (prev && prev.email === email && Date.now() - prev.sentAt < RESEND_S * 1000) {
      throw new AuthError('rate_limited');
    }
    const pending: Pending = {
      email,
      code: sixDigits(),
      expiresAt: Date.now() + CODE_TTL_MS,
      sentAt: Date.now(),
      attempts: 0,
      registration: registration ?? (prev?.email === email ? prev.registration : undefined),
    };
    write(PENDING_KEY, pending);
    return { email, resendAfterSeconds: RESEND_S, mockCode: pending.code };
  }

  async getSession() {
    const s = read<Session>(SESSION_KEY);
    if (!s) return null;
    if (Date.parse(s.expiresAt) < Date.now() || !loadDb().customers[s.customerId]) {
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

  async register(input: NewCustomer) {
    await wait(350);
    const email = input.email.trim().toLowerCase();
    if (await getData().findCustomerIdByEmail(email)) throw new AuthError('email_taken');
    return this.send(email, { ...input, email });
  }

  async requestCode(rawEmail: string) {
    await wait(350);
    const email = rawEmail.trim().toLowerCase();
    const pending = read<Pending>(PENDING_KEY);
    const known = await getData().findCustomerIdByEmail(email);
    if (!known && !(pending?.email === email && pending.registration)) throw new AuthError('unknown_email');
    return this.send(email);
  }

  async verifyCode(rawEmail: string, code: string) {
    await wait(400);
    const email = rawEmail.trim().toLowerCase();
    const pending = read<Pending>(PENDING_KEY);
    if (!pending || pending.email !== email) throw new AuthError('expired');
    if (Date.now() > pending.expiresAt) throw new AuthError('expired');
    if (pending.attempts >= MAX_ATTEMPTS) throw new AuthError('too_many_attempts');
    if (pending.code !== code) {
      write(PENDING_KEY, { ...pending, attempts: pending.attempts + 1 });
      throw new AuthError(pending.attempts + 1 >= MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid_code');
    }
    write(PENDING_KEY, null);
    let customerId = await getData().findCustomerIdByEmail(email);
    if (!customerId) {
      if (!pending.registration) throw new AuthError('unknown_email');
      customerId = (await getData().createCustomer(pending.registration)).id;
    }
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
