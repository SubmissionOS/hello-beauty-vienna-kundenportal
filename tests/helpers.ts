import { createHash, createHmac, randomBytes } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

/** Gemeinsame Helfer für die Supabase-Tests (Werte aus .env.local, nie ausgegeben). */
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

export const BASE = 'http://localhost:3200';
export const DEMO_EMAIL = 'lena.musterfrau@example.com';

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function demoIds() {
  const db = admin();
  const { data: t } = await db.from('tenants').select('id').eq('slug', 'hello-beauty').single();
  const { data: c } = await db.from('customers').select('id').eq('tenant_id', t!.id).eq('email', DEMO_EMAIL).single();
  return { tenantId: t!.id as string, lenaId: c!.id as string };
}

/** Signierte Anfrage an die CRM-Schnittstelle (wie das CRM sie stellt) */
export async function crm(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  opts: { secret?: string; key?: string; ts?: number; nonce?: string; tamper?: boolean } = {},
) {
  const secret = opts.secret ?? process.env.CRM_BRIDGE_SECRET!;
  const raw = body === undefined ? '' : JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomBytes(16).toString('hex');
  const url = new URL(`/api/crm/v1/${path}`, BASE);
  const qs = new URLSearchParams(url.search);
  qs.sort();
  const canonPath = qs.toString() ? `${url.pathname}?${qs}` : url.pathname;
  const canon = `${ts}\n${nonce}\n${method}\n${canonPath}\n${createHash('sha256').update(raw).digest('hex')}`;
  let sig = createHmac('sha256', secret).update(canon).digest('hex');
  if (opts.tamper) sig = sig.replace(/^./, (c) => (c === '0' ? '1' : '0'));
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-HB-Key': opts.key ?? 'hello-beauty-crm',
      'X-HB-Timestamp': ts,
      'X-HB-Nonce': nonce,
      'X-HB-Signature': sig,
    },
    body: method === 'POST' ? raw : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, nonce, ts };
}

/** Simuliertes Stripe-Ereignis mit gültiger (oder absichtlich falscher) Signatur */
export async function stripeEvent(event: unknown, opts: { secret?: string; ts?: number; unsigned?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const secret = opts.secret ?? process.env.E2E_WEBHOOK_SECRET!;
  const sig = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  const res = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.unsigned ? {} : { 'Stripe-Signature': `t=${ts},v1=${sig}` }) },
    body: payload,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as { outcome?: string; error?: string } | null };
}

export async function worker(secret = process.env.NOTIFY_WORKER_SECRET) {
  const res = await fetch(`${BASE}/api/notifications/process`, {
    method: 'POST',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, number> | null };
}
