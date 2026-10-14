import 'server-only';

import { serverEnv } from './env';
import { supabaseAdmin } from './supabase';
import { sendPush } from './webpush';

/**
 * Versand der Benachrichtigungs-Warteschlange (notification_queue).
 * Die Regeln (Einstellungen je Typ/Kanal, Werbe-Einwilligung je Kanal nach § 174 TKG, SMS nur mit Nummer)
 * prüft schon die DB beim Einreihen – hier wird nur noch zugestellt.
 *   push   → Web-Push an alle Geräte der Kundin; abgelaufene Abos (404/410) werden gelöscht
 *   email  → Resend-API, sobald RESEND_API_KEY und NOTIFY_FROM_EMAIL gesetzt sind, sonst „skipped“
 *   sms    → [PLATZHALTER: Anbieter offen] „skipped“
 *   inapp  → nichts zu tun (Feed/Zähler in der App)
 */

interface Job {
  id: number;
  channel: 'inapp' | 'email' | 'sms' | 'push';
  kind: string;
  payload: { title?: string; body?: string; url?: string; expiresAt?: string };
  customer: { email: string; phone: string | null; language: string; firstName: string } | null;
  push: { endpoint: string; p256dh: string; auth: string }[] | null;
}

export interface ProcessResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  pushRemoved: number;
}

type Outcome = { status: 'sent' | 'skipped' | 'failed' | 'retry'; error?: string; removed?: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function deliverPush(job: Job): Promise<Outcome> {
  const keys = serverEnv.vapid();
  if (!keys) return { status: 'skipped', error: 'vapid_not_configured' };
  const subs = job.push ?? [];
  if (!subs.length) return { status: 'skipped', error: 'no_subscription' };
  const db = supabaseAdmin();
  let ok = 0;
  let removed = 0;
  for (const s of subs) {
    let result = { ok: false, gone: false };
    try {
      result = await sendPush(
        s,
        { title: job.payload.title ?? 'Hello Beauty', body: job.payload.body ?? '', url: job.payload.url ?? '/app', tag: job.kind },
        keys,
        // Wartelisten-Angebote: sofort zustellen, nach Ablauf des Angebots verwerfen
        job.kind === 'waitlist' && job.payload.expiresAt
          ? { urgency: 'high', ttlSeconds: Math.max(60, Math.floor((Date.parse(job.payload.expiresAt) - Date.now()) / 1000)) }
          : {},
      );
    } catch {
      /* Netzfehler: zählt als Fehlversuch */
    }
    await db.rpc('svc_push_result', { p_endpoint: s.endpoint, p_ok: result.ok, p_gone: result.gone });
    if (result.ok) ok++;
    if (result.gone) removed++;
  }
  if (ok) return { status: 'sent', removed };
  return removed === subs.length ? { status: 'skipped', error: 'subscriptions_gone', removed } : { status: 'retry', error: 'push_failed', removed };
}

async function deliverEmail(job: Job, origin: string): Promise<Outcome> {
  const resend = serverEnv.resend();
  if (!resend) return { status: 'skipped', error: 'email_not_configured' };
  if (!job.customer?.email) return { status: 'skipped', error: 'no_email' };
  const link = new URL(job.payload.url ?? '/app', origin).href;
  const settings = new URL('/app/profil', origin).href;
  const title = job.payload.title ?? 'Hello Beauty';
  const body = job.payload.body ?? '';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resend.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `queue-${job.id}` },
    body: JSON.stringify({
      from: resend.from,
      to: [job.customer.email],
      subject: title,
      text: `${body}\n\n${link}\n\n—\nHello Beauty · Barnabitengasse 7, 1060 Wien\nBenachrichtigungen und Einwilligungen ändern: ${settings}`,
      html: `<p>${esc(body)}</p><p><a href="${esc(link)}">${esc(link)}</a></p><hr><p><small>Hello Beauty · Barnabitengasse 7, 1060 Wien<br><a href="${esc(settings)}">Benachrichtigungen und Einwilligungen ändern</a></small></p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) return { status: 'sent' };
  return res.status >= 500 || res.status === 429 ? { status: 'retry', error: `resend_${res.status}` } : { status: 'failed', error: `resend_${res.status}` };
}

async function deliver(job: Job, origin: string): Promise<Outcome> {
  // abgelaufene Wartelisten-Angebote nicht mehr zustellen
  if (job.payload.expiresAt && Date.parse(job.payload.expiresAt) <= Date.now()) return { status: 'skipped', error: 'expired' };
  switch (job.channel) {
    case 'push':
      return deliverPush(job);
    case 'email':
      return deliverEmail(job, origin);
    case 'sms':
      return { status: 'skipped', error: 'sms_not_configured' };
    default:
      return { status: 'sent' };
  }
}

export async function processQueue(origin: string, limit = 50): Promise<ProcessResult> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('svc_queue_claim', { p_limit: limit });
  if (error) throw new Error('queue_claim_failed');
  const jobs = (data ?? []) as Job[];
  const result: ProcessResult = { claimed: jobs.length, sent: 0, skipped: 0, failed: 0, retried: 0, pushRemoved: 0 };
  for (const job of jobs) {
    let out: Outcome;
    try {
      out = await deliver(job, origin);
    } catch {
      out = { status: 'retry', error: 'exception' };
    }
    await db.rpc('svc_queue_done', { p_id: job.id, p_status: out.status, p_error: out.error ?? null });
    result.pushRemoved += out.removed ?? 0;
    if (out.status === 'sent') result.sent++;
    else if (out.status === 'skipped') result.skipped++;
    else if (out.status === 'failed') result.failed++;
    else result.retried++;
  }
  return result;
}
