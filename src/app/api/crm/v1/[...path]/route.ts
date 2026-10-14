import { NextResponse } from 'next/server';
import { verifyCrmRequest, type CrmAuthError } from '@/lib/server/crm-auth';
import { supabaseAdmin } from '@/lib/server/supabase';

/**
 * CRM-Schnittstelle v1 (Anleitung: docs/crm-integration.md). Alle Antworten JSON, keine Cookies, kein CORS.
 *
 *   GET  customers?q=…                         Kundinnen suchen (Name, E-Mail, Telefon, Kundennummer)
 *   GET  customers/suggestions?email=…&phone=…  Verknüpfungsvorschläge (keine automatische Verknüpfung)
 *   GET  customers/:id                          eine Kundin
 *   POST customers/:id/link    { crmRef, actor } verknüpfen (protokolliert)
 *   POST customers/:id/unlink  { actor }         trennen (protokolliert)
 *   GET  customers/:id/appointments             Termine lesen
 *   GET  chat/threads                           Chat-Verläufe mit Ungelesen-Zähler
 *   GET  chat/:customerId/messages              Nachrichten lesen
 *   POST chat/:customerId/messages { body, actor } Nachricht senden (Push/E-Mail an die Kundin)
 *   POST chat/:customerId/read     { actor }     als gelesen markieren
 *   POST news { kind, title, body, validUntil?, publish, actor } Neuigkeit anlegen (optional sofort veröffentlichen)
 *   GET  waitlist                               Warteliste lesen
 */

const MAX_BODY = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const authStatus: Record<CrmAuthError, number> = {
  unauthorized: 401,
  stale: 401,
  bad_signature: 401,
  replay: 409,
  rate_limited: 429,
  not_configured: 503,
};

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Fehlertexte der DB-Funktionen → HTTP-Status */
function dbError(message: string) {
  const status = message === 'not_found' ? 404 : message === 'already_linked' || message === 'ref_in_use' ? 409 : /^invalid|check|violates/.test(message) ? 400 : 500;
  return json({ error: status === 500 ? 'internal' : message }, status);
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  // Abgeschaltet, seit das CRM direkt auf die gemeinsame DB zugreift (docs/crm-zusammenfuehrung.md). Code bleibt.
  if (process.env.CRM_API_ENABLED !== 'true') return json({ error: 'disabled' }, 404);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
  const auth = await verifyCrmRequest(req, raw);
  if (!auth.ok) return json({ error: auth.error }, authStatus[auth.error]);

  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
  }
  const { path } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const db = supabaseAdmin();
  const tenant = auth.tenantId;
  const actor = str(body.actor, 80) ?? 'crm';
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, { p_tenant: tenant, ...args });
    return error ? dbError(error.message) : json(data);
  };
  const route = `${req.method} ${path.map((p, i) => (i > 0 && UUID.test(p) ? ':id' : p)).join('/')}`;
  const id = path[1] && UUID.test(path[1]) ? path[1] : null;

  switch (route) {
    case 'GET customers':
      return call('svc_crm_search', { p_query: q.get('q') ?? '' });
    case 'GET customers/suggestions':
      return call('svc_crm_link_suggestions', { p_email: q.get('email'), p_phone: q.get('phone') });
    case 'GET customers/:id':
      return call('svc_crm_customer', { p_customer: id });
    case 'POST customers/:id/link': {
      const ref = str(body.crmRef, 120);
      if (!ref) return json({ error: 'crmRef_required' }, 400);
      return call('svc_crm_link', { p_customer: id, p_ref: ref, p_actor: actor });
    }
    case 'POST customers/:id/unlink':
      return call('svc_crm_unlink', { p_customer: id, p_actor: actor });
    case 'GET customers/:id/appointments':
      return call('svc_crm_appointments', { p_customer: id });
    case 'GET chat/threads':
      return call('svc_crm_chat_threads', {});
    case 'GET chat/:id/messages':
      return call('svc_crm_chat_messages', { p_customer: id });
    case 'POST chat/:id/messages': {
      const text = str(body.body, 2000);
      if (!text) return json({ error: 'body_required' }, 400);
      return call('svc_crm_chat_send', { p_customer: id, p_body: text, p_actor: actor });
    }
    case 'POST chat/:id/read':
      return call('svc_crm_chat_read', { p_customer: id, p_actor: actor });
    case 'POST news': {
      const kind = body.kind;
      const title = str(body.title, 120);
      const text = str(body.body, 2000);
      const validUntil = typeof body.validUntil === 'string' && !Number.isNaN(Date.parse(body.validUntil)) ? body.validUntil : null;
      if ((kind !== 'news' && kind !== 'offer' && kind !== 'free_slot') || !title || !text) return json({ error: 'invalid_news' }, 400);
      if (kind === 'offer' && !validUntil) return json({ error: 'validUntil_required' }, 400);
      return call('svc_crm_news_create', {
        p_kind: kind,
        p_title: title,
        p_body: text,
        p_valid_until: validUntil,
        p_publish: body.publish === true,
        p_actor: actor,
      });
    }
    case 'GET waitlist':
      return call('svc_crm_waitlist', {});
    default:
      return json({ error: 'not_found' }, 404);
  }
}

export const GET = handle;
export const POST = handle;
