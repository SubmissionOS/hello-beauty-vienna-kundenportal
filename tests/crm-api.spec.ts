import { expect, test } from '@playwright/test';
import { admin, crm, demoIds } from './helpers';

/**
 * CRM-Schnittstelle /api/crm/v1 gegen die echte DB: Funktionen und Absicherung
 * (falsche/alte Signatur, Wiederholung, fremder Tenant, unbekannter Schlüssel).
 */
test.skip(process.env.E2E_BACKEND !== 'supabase', 'nur mit E2E_BACKEND=supabase');
test.describe.configure({ mode: 'serial' });

let ids: { tenantId: string; lenaId: string };
let foreign: { tenantId: string; customerId: string } | null = null;
const startedAt = new Date().toISOString();

test.beforeAll(async () => {
  ids = await demoIds();
  // fremder Tenant mit eigener Kundin (wird am Ende gelöscht)
  const db = admin();
  const { data: t } = await db.from('tenants').insert({ slug: `crm-fremd-${Date.now()}`, name: 'CRM-Test fremd' }).select('id').single();
  const { data: u } = await db.auth.admin.createUser({ email: `crm-fremd-${Date.now()}@example.com`, email_confirm: true });
  const { data: c } = await db
    .from('customers')
    .insert({ tenant_id: t!.id, user_id: u.user!.id, first_name: 'Fremd', last_name: 'Kundin', email: u.user!.email, language: 'de', privacy_notice_at: new Date().toISOString() })
    .select('id')
    .single();
  foreign = { tenantId: t!.id, customerId: c!.id };
});

test.afterAll(async () => {
  const db = admin();
  if (foreign) {
    const { data: c } = await db.from('customers').select('user_id').eq('id', foreign.customerId).maybeSingle();
    await db.from('tenants').delete().eq('id', foreign.tenantId);
    if (c?.user_id) await db.auth.admin.deleteUser(c.user_id);
  }
  // Test-Spuren bei Lena entfernen (Chat, Verknüpfung, Neuigkeiten-Entwurf, Warteschlange)
  await db.from('chat_messages').delete().eq('customer_id', ids.lenaId).gte('created_at', startedAt);
  await db.from('notification_queue').delete().eq('customer_id', ids.lenaId).gte('created_at', startedAt);
  await db.from('crm_links').delete().eq('customer_id', ids.lenaId).eq('crm_customer_ref', 'crm-e2e-4711');
  await db.from('news_posts').delete().eq('tenant_id', ids.tenantId).like('title', 'CRM-E2E%');
});

test('Suche nach Kundennummer, Name und Telefon – Textsuche liefert keine Fehltreffer', async () => {
  const { data: lena } = await admin().from('customers').select('customer_number').eq('id', ids.lenaId).single();
  const byNumber = await crm('GET', `customers?q=${lena!.customer_number}`);
  expect(byNumber.status).toBe(200);
  expect(byNumber.json.map((c: { id: string }) => c.id)).toEqual([ids.lenaId]);
  const byName = await crm('GET', 'customers?q=musterfrau');
  expect(byName.json.some((c: { id: string }) => c.id === ids.lenaId)).toBe(true);
  // reiner Text ohne Treffer: früher passte jede Kundin mit Telefonnummer
  const none = await crm('GET', 'customers?q=zzqx');
  expect(none.json).toEqual([]);
  // fremder Tenant ist nie in der Suche
  const fremd = await crm('GET', 'customers?q=Fremd');
  expect(fremd.json.some((c: { id: string }) => c.id === foreign!.customerId)).toBe(false);
});

test('Vorschläge per E-Mail, verknüpfen und trennen – mit Protokoll', async () => {
  const s = await crm('GET', 'customers/suggestions?email=LENA.musterfrau@example.com');
  expect(s.status, JSON.stringify(s.json)).toBe(200);
  expect(s.json[0]).toMatchObject({ id: ids.lenaId, matchedBy: 'email' });
  // nichts wird automatisch verknüpft
  expect(s.json[0].crmRef).toBeNull();

  const link = await crm('POST', `customers/${ids.lenaId}/link`, { crmRef: 'crm-e2e-4711', actor: 'e2e' });
  expect(link.status).toBe(200);
  expect((await crm('POST', `customers/${ids.lenaId}/link`, { crmRef: 'crm-e2e-4711', actor: 'e2e' })).status).toBe(409);
  const one = await crm('GET', `customers/${ids.lenaId}`);
  expect(one.json.crmRef).toBe('crm-e2e-4711');
  const unlink = await crm('POST', `customers/${ids.lenaId}/unlink`, { actor: 'e2e' });
  expect(unlink.status).toBe(200);
  const { data: log } = await admin().from('crm_audit_log').select('action').eq('customer_id', ids.lenaId).gte('at', startedAt);
  expect(log!.map((l) => l.action)).toEqual(expect.arrayContaining(['link', 'unlink']));
});

test('Termine lesen, Chat lesen/senden/gelesen, Neuigkeit anlegen, Warteliste', async () => {
  const appts = await crm('GET', `customers/${ids.lenaId}/appointments`);
  expect(appts.status).toBe(200);
  expect(appts.json.length).toBeGreaterThanOrEqual(3);

  const sent = await crm('POST', `chat/${ids.lenaId}/messages`, { body: 'CRM-E2E: Grüße aus dem CRM', actor: 'Petra' });
  expect(sent.status).toBe(200);
  const threads = await crm('GET', 'chat/threads');
  expect(threads.json.some((t: { customerId: string }) => t.customerId === ids.lenaId)).toBe(true);
  const msgs = await crm('GET', `chat/${ids.lenaId}/messages`);
  expect(msgs.json.some((m: { body: string }) => m.body === 'CRM-E2E: Grüße aus dem CRM')).toBe(true);
  expect((await crm('POST', `chat/${ids.lenaId}/read`, { actor: 'Petra' })).status).toBe(200);

  const draft = await crm('POST', 'news', { kind: 'news', title: 'CRM-E2E Entwurf', body: 'Nur ein Test', publish: false, actor: 'e2e' });
  expect(draft.status).toBe(200);
  expect(draft.json.status).toBe('draft');
  expect((await crm('POST', 'news', { kind: 'offer', title: 'CRM-E2E ohne Datum', body: 'x' })).status).toBe(400);

  const wl = await crm('GET', 'waitlist');
  expect(wl.status).toBe(200);
  expect(Array.isArray(wl.json.entries)).toBe(true);
});

test('Sicherheit: falsche Signatur, alte Signatur, Wiederholung, unbekannter Schlüssel, fremder Tenant', async () => {
  expect((await crm('GET', 'waitlist', undefined, { tamper: true })).status).toBe(401);
  expect((await crm('GET', 'waitlist', undefined, { secret: 'falsch-falsch-falsch' })).status).toBe(401);
  expect((await crm('GET', 'waitlist', undefined, { ts: Math.floor(Date.now() / 1000) - 301 })).status).toBe(401);
  expect((await crm('GET', 'waitlist', undefined, { ts: Math.floor(Date.now() / 1000) + 301 })).status).toBe(401);
  expect((await crm('GET', 'waitlist', undefined, { key: 'anderer-salon' })).status).toBe(401);

  // Wiederholung derselben signierten Anfrage (gleiche Nonce) wird abgewiesen
  const first = await crm('GET', 'waitlist');
  expect(first.status).toBe(200);
  const again = await crm('GET', 'waitlist', undefined, { nonce: first.nonce, ts: Number(first.ts) });
  expect(again.status).toBe(409);

  // Kundin eines anderen Tenants ist über diesen Schlüssel unsichtbar und nicht veränderbar
  expect((await crm('GET', `customers/${foreign!.customerId}`)).json).toBeNull();
  expect((await crm('POST', `customers/${foreign!.customerId}/link`, { crmRef: 'x', actor: 'e2e' })).status).toBe(404);
  expect((await crm('POST', `chat/${foreign!.customerId}/messages`, { body: 'x', actor: 'e2e' })).status).toBeGreaterThanOrEqual(400);

  // ohne Header gar nichts
  expect((await fetch('http://localhost:3200/api/crm/v1/waitlist')).status).toBe(401);
});
