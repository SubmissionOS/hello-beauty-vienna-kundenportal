/**
 * Sicherheits- und Funktionstest Teil 3/4 gegen die echte Datenbank (Angriffe nur mit dem PUBLISHABLE Key).
 * Secret Key / Management-API nur für Aufbau, Abbau und das Simulieren von Zeitablauf (wie pg_cron).
 * Ergebnis: docs/sicherheitstest-teil4.md   Aufruf: npm run test:security:teil4
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { sql } from './db-sql.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const ORIGIN_A = 'http://localhost:3000';
const ORIGIN_B = 'https://tenant-b.sicherheitstest.invalid';
const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(URL_, SECRET, { auth: noSession });
const pub = (origin, token) =>
  createClient(URL_, PUB, { auth: noSession, global: { headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) } } });

const results = [];
const check = (group, name, ok, detail = '') => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${group} · ${name}${detail ? ` (${detail})` : ''}`);
};
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const rows = (r) => (r.error ? -1 : (Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0));
const denied = (r) => !!r.error;
const errIs = (r, code) => r.error?.message === code;
const created = { users: [], tenantB: null };

const viennaDate = (days) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date(Date.now() + days * 86400_000));

try {
  // ------------------------------------------------------------ Aufbau
  const tenantA = must(await admin.from('tenants').select('id').eq('slug', 'hello-beauty').single(), 'tenant A');
  const tB = must(await admin.from('tenants').insert({ slug: 'sicherheitstest-b4', name: 'Sicherheitstest B4' }).select().single(), 'tenant B');
  created.tenantB = tB.id;
  must(await admin.from('tenant_domains').insert({ tenant_id: tB.id, host: 'tenant-b.sicherheitstest.invalid', is_pattern: false }), 'domain B');
  const catB = must(await admin.from('service_categories').insert({ tenant_id: tB.id, key: 'nails', sort_order: 1 }).select().single(), 'cat');
  const svcB = must(await admin.from('services').insert({ tenant_id: tB.id, category_id: catB.id, code: 'b-1', name: 'Test B', duration_minutes: 30, price_eur: 40 }).select().single(), 'svc');
  const stfB = must(await admin.from('staff').insert({ tenant_id: tB.id, code: 'b-st', display_name: 'Bea' }).select().single(), 'staff');
  must(await admin.from('staff_services').insert({ tenant_id: tB.id, staff_id: stfB.id, service_id: svcB.id }), 'ss');
  must(await admin.from('opening_hours').insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenant_id: tB.id, weekday: d, opens: '06:00', closes: '22:00' }))), 'hours');

  async function user(label, origin, { register = true } = {}) {
    const email = `sicherheitstest4-${label}-${randomBytes(4).toString('hex')}@example.com`;
    const password = randomBytes(24).toString('base64url');
    const u = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${label}`).user;
    created.users.push(u.id);
    const s = must(await pub(origin).auth.signInWithPassword({ email, password }), `login ${label}`).session;
    const client = pub(origin, s.access_token);
    let customerId = null;
    if (register) {
      customerId = must(await client.rpc('register_customer', { p_first_name: label.toUpperCase(), p_last_name: 'Test', p_phone: '+43 660 1111111', p_language: 'de', p_marketing: false }), `reg ${label}`).id;
    }
    return { label, email, token: s.access_token, client, customerId, userId: u.id };
  }
  const a1 = await user('a1', ORIGIN_A);
  const a2 = await user('a2', ORIGIN_A);
  const b1 = await user('b1', ORIGIN_B);
  const b2 = await user('b2', ORIGIN_B);
  const b3 = await user('b3', ORIGIN_B);
  const b4 = await user('b4', ORIGIN_B);
  const salonA = await user('salonA', ORIGIN_A, { register: false });
  must(await admin.from('salon_members').insert({ tenant_id: tenantA.id, user_id: salonA.userId, display_name: 'Test-Salon A' }), 'member A');

  // ------------------------------------------------------------ Kundennummer
  const accA1 = (await a1.client.rpc('my_account')).data;
  check('Kundennummer', 'Format HB-XXXXXX ohne 0/O/1/I', /^HB-[2-9A-HJ-NP-Z]{6}$/.test(accA1?.customerNumber ?? ''), accA1?.customerNumber);
  const nums = (await admin.from('customers').select('customer_number').eq('tenant_id', tB.id)).data.map((r) => r.customer_number);
  check('Kundennummer', 'eindeutig im Tenant', new Set(nums).size === nums.length);

  // ------------------------------------------------------------ Chat
  must(await a1.client.rpc('send_chat_message', { p_body: 'Hallo Salon' }), 'chat a1');
  check('Chat', 'a2 sieht Chat von a1 nicht', rows(await a2.client.from('chat_messages').select('id')) === 0);
  check('Chat', 'Salon-Team A sieht Chat von a1', rows(await salonA.client.from('chat_messages').select('id').eq('customer_id', a1.customerId)) >= 1);
  // Seit der gemeinsamen DB gilt Team-Zugriff über die Mitgliedschaft (salon_members), nicht über den Host.
  // Schutzziel: auch unter fremdem Host nur Daten des EIGENEN Tenants, nie die von Tenant B.
  must(await b1.client.rpc('send_chat_message', { p_body: 'Hallo Salon B' }), 'chat b1');
  const underB = (await pub(ORIGIN_B, salonA.token).from('chat_messages').select('tenant_id')).data ?? [];
  check('Chat', 'Salon-Team A unter Host B: keine Chats von Tenant B', underB.every((m) => m.tenant_id === tenantA.id));
  check('Chat', 'Kundin kann nicht als Salon schreiben', errIs(await a2.client.rpc('salon_send_chat_message', { p_customer_id: a1.customerId, p_body: 'x' }), 'forbidden'));
  check('Chat', 'anon kann nichts lesen', rows(await pub(ORIGIN_A).from('chat_messages').select('id')) <= 0);
  const reply = await salonA.client.rpc('salon_send_chat_message', { p_customer_id: a1.customerId, p_body: 'Gerne!' });
  check('Chat', 'Salon antwortet → Push/E-Mail in der Warteschlange', !reply.error &&
    (await admin.from('notification_queue').select('channel').eq('customer_id', a1.customerId).eq('kind', 'chat')).data.length >= 1);
  check('Chat', 'Kundin kann Warteschlange nicht lesen', rows(await a1.client.from('notification_queue').select('id')) <= 0);

  // ------------------------------------------------------------ Einwilligungen + Neuigkeiten
  must(await a2.client.rpc('set_marketing_consent', { p_channel: 'email', p_granted: true }), 'consent a2');
  const cons = (await a2.client.rpc('my_consents')).data;
  check('Einwilligung', 'Zeitstempel je Kanal', cons?.email?.granted === true && !!cons?.email?.changedAt && cons?.sms?.granted === false);
  check('Einwilligung', 'Historie fremder Kundin unsichtbar', rows(await a1.client.from('marketing_consents').select('id').eq('customer_id', a2.customerId)) === 0);
  const draft = must(await salonA.client.rpc('salon_news_save', { p_id: null, p_kind: 'offer', p_title: 'Test-Rabatt', p_body: '10 % auf Maniküre', p_image_path: null, p_valid_until: new Date(Date.now() + 7 * 86400_000).toISOString() }), 'news save');
  check('Neuigkeiten', 'Entwurf ist für Kundinnen unsichtbar', !((await a1.client.rpc('news_feed')).data ?? []).some((n) => n.id === draft.id));
  must(await salonA.client.rpc('salon_news_publish', { p_id: draft.id }), 'publish');
  check('Neuigkeiten', 'veröffentlicht: a1 sieht sie im Feed', ((await a1.client.rpc('news_feed')).data ?? []).some((n) => n.id === draft.id));
  check('Neuigkeiten', 'Tenant B sieht sie nicht', !((await b1.client.rpc('news_feed')).data ?? []).some((n) => n.id === draft.id));
  const q = (await admin.from('notification_queue').select('customer_id, channel').eq('kind', 'news_promo').like('dedupe_key', `news:${draft.id}%`)).data;
  check('Neuigkeiten', 'Werbung nur mit Einwilligung (§ 174 TKG): a1 ohne → kein Versand', !q.some((r) => r.customer_id === a1.customerId));
  check('Neuigkeiten', 'a2 mit E-Mail-Einwilligung → nur E-Mail', q.some((r) => r.customer_id === a2.customerId && r.channel === 'email') &&
    !q.some((r) => r.customer_id === a2.customerId && r.channel !== 'email'));
  check('Neuigkeiten', 'Kundin kann keine Neuigkeit anlegen', errIs(await a1.client.rpc('salon_news_save', { p_id: null, p_kind: 'news', p_title: 'x', p_body: 'y', p_image_path: null, p_valid_until: null }), 'forbidden'));
  check('Neuigkeiten', 'Salon A kann unter Host B nichts anlegen', errIs(await pub(ORIGIN_B, salonA.token).rpc('salon_news_save', { p_id: null, p_kind: 'news', p_title: 'x', p_body: 'y', p_image_path: null, p_valid_until: null }), 'forbidden'));
  const unreadBefore = (await a1.client.rpc('news_unread_count')).data;
  must(await a1.client.rpc('mark_news_read', { p_news_id: draft.id }), 'read');
  check('Neuigkeiten', 'Gelesen-Status senkt den Zähler', (await a1.client.rpc('news_unread_count')).data === unreadBefore - 1);

  // ------------------------------------------------------------ Push-Abos
  const ep = `https://push.example.invalid/${randomBytes(8).toString('hex')}`;
  const keys = { p_p256dh: 'B' + randomBytes(64).toString('base64url'), p_auth: randomBytes(16).toString('base64url') };
  check('Push', 'Kundin speichert Abo', !(await a1.client.rpc('save_push_subscription', { p_endpoint: ep, ...keys, p_user_agent: 'test' })).error);
  check('Push', 'fremde Kundin sieht das Abo nicht', rows(await a2.client.from('push_subscriptions').select('id')) === 0);
  check('Push', 'Schlüssel des Abos nie lesbar (auch nicht für die Besitzerin)', denied(await a1.client.from('push_subscriptions').select('p256dh')));
  await a2.client.rpc('delete_push_subscription', { p_endpoint: ep });
  check('Push', 'fremde Kundin kann Abo nicht löschen', (await admin.from('push_subscriptions').select('id').eq('endpoint', ep)).data.length === 1);
  check('Push', 'anon kann kein Abo anlegen', denied(await pub(ORIGIN_A).rpc('save_push_subscription', { p_endpoint: ep + 'x', ...keys, p_user_agent: 'x' })));

  // ------------------------------------------------------------ Warteliste mit Kaskade (Tenant B)
  const day = viennaDate(2);
  const start = `${day}T10:00`;
  const join = (u) => u.client.rpc('join_waitlist', { p_service_ids: [svcB.id], p_staff_id: null, p_date_from: day, p_date_to: day,
    p_weekdays: [0, 1, 2, 3, 4, 5, 6], p_time_from: '06:00', p_time_to: '22:00', p_short_notice: true });
  for (const u of [b2, b3, b4]) must(await join(u), `join ${u.label}`);
  check('Warteliste', 'Einträge fremder Kundinnen unsichtbar', ((await b3.client.rpc('my_waitlist')).data ?? []).length === 1);
  const booked = must(await b1.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: start, p_payment: 'in_salon' }), 'book b1');
  must(await b1.client.rpc('cancel_appointment', { p_id: booked.id }), 'cancel b1');
  const offB2 = (await b2.client.rpc('my_waitlist_offers')).data ?? [];
  check('Warteliste', 'Absage → Angebot an genau EINE Person (FIFO: b2)', offB2.length === 1 && ((await b3.client.rpc('my_waitlist_offers')).data ?? []).length === 0);
  const offerId = offB2[0]?.id;
  const winMin = offB2[0] ? (Date.parse(offB2[0].expiresAt) - Date.parse(offB2[0].offeredAt)) / 60000 : 0;
  check('Warteliste', 'Antwortfenster = Vorlauf/15, max. 60 Min.', Math.abs(winMin - 60) < 1, `${winMin.toFixed(1)} Min.`);
  check('Warteliste', 'Wartelisten-Angebot ohne Werbe-Einwilligung zugestellt (angefordert)',
    (await admin.from('notification_queue').select('channel').eq('customer_id', b2.customerId).eq('kind', 'waitlist')).data.length >= 3);
  check('Warteliste', 'normale Buchung während Reservierung scheitert',
    errIs(await b4.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: start, p_payment: 'in_salon' }), 'slot_taken'));
  check('Warteliste', 'reservierter Slot nicht als frei angeboten',
    !((await b4.client.rpc('available_slots', { p_service_id: svcB.id, p_staff_id: null, p_date: day })).data ?? []).some((s) => s.start === start));
  check('Warteliste', 'fremdes Angebot nicht annehmbar', errIs(await b3.client.rpc('waitlist_offer_respond', { p_offer_id: offerId, p_accept: true }), 'not_found'));
  check('Warteliste', 'Kundin aus Tenant A sieht das Angebot nicht', errIs(await a1.client.rpc('waitlist_offer', { p_offer_id: offerId }), 'not_found'));
  must(await b2.client.rpc('waitlist_offer_respond', { p_offer_id: offerId, p_accept: false }), 'decline');
  const offB3 = (await b3.client.rpc('my_waitlist_offers')).data ?? [];
  check('Warteliste', 'Nein → nächste Person (b3)', offB3.length === 1);
  // Ablauf simulieren (wie pg_cron/zeitlich): Fenster in die Vergangenheit setzen, dann liest b3 das Angebot
  await sql(`update public.waitlist_offers set expires_at = now() - interval '1 second' where id = '${offB3[0]?.id}'`);
  const readExpired = (await b3.client.rpc('waitlist_offer', { p_offer_id: offB3[0]?.id })).data;
  const offB4 = (await b4.client.rpc('my_waitlist_offers')).data ?? [];
  check('Warteliste', 'Ablauf → beim Lesen sofort verarbeitet, nächste Person (b4)', readExpired?.status === 'expired' && offB4.length === 1);
  const yes = () => b4.client.rpc('waitlist_offer_respond', { p_offer_id: offB4[0]?.id, p_accept: true });
  const both = await Promise.all([yes(), yes()]);
  const nBooked = both.filter((r) => r.data?.result === 'booked').length;
  const nClosed = both.filter((r) => errIs(r, 'offer_closed')).length;
  check('Warteliste', '2 parallele Ja-Klicks → genau eine Buchung', nBooked === 1 && nClosed === 1, `${nBooked} gebucht / ${nClosed} abgewiesen`);
  const finalAppts = (await admin.from('appointments').select('status, customer_id, hold_kind').eq('tenant_id', tB.id).eq('status', 'confirmed')).data;
  check('Warteliste', 'Slot gehört jetzt b4, Reservierung aufgelöst', finalAppts.length === 1 && finalAppts[0].customer_id === b4.customerId && finalAppts[0].hold_kind === null);
  check('Warteliste', 'Cron-Job für Ablauf aktiv', (await sql(`select count(*)::int as n from cron.job where jobname = 'waitlist-expire' and active`))[0].n === 1);

  // ------------------------------------------------------------ Zahlungen (Tenant B: Anzahlung 20 %)
  must(await admin.from('payment_rules').insert({ tenant_id: tB.id, service_id: svcB.id, mode: 'deposit_percent', value: 20 }), 'rule');
  const quote = (await b1.client.rpc('payment_quote', { p_service_id: svcB.id })).data;
  check('Zahlung', 'Regel: 20 % Anzahlung von 40 € = 800 Cent', quote?.dueOnlineCents === 800, JSON.stringify(quote));
  const pay = must(await b1.client.rpc('book_with_payment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: `${day}T14:00` }), 'book pay');
  check('Zahlung', 'Buchung wartet auf Zahlung (pending + Reservierung)', pay.appointment?.status === 'pending' && pay.payment?.status === 'requires_payment');
  check('Zahlung', 'Slot während offener Zahlung gesperrt',
    errIs(await b2.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: `${day}T14:00`, p_payment: 'in_salon' }), 'slot_taken'));
  check('Zahlung', 'fremde Kundin sieht die Zahlung nicht', ((await b2.client.rpc('payment_for_checkout', { p_payment_id: pay.payment.id })).data ?? null) === null);
  check('Zahlung', 'Kundin kann keine Zahlung als bezahlt melden',
    denied(await b1.client.rpc('svc_payment_succeeded', { p_provider: 'mock', p_event_id: 'x', p_payment_id: pay.payment.id, p_ref: null, p_amount_cents: 800 })));
  const ev = `evt_${randomBytes(6).toString('hex')}`;
  const r1 = (await admin.rpc('svc_payment_succeeded', { p_provider: 'mock', p_event_id: ev, p_payment_id: pay.payment.id, p_ref: 'mock_1', p_amount_cents: 800 })).data;
  const r2 = (await admin.rpc('svc_payment_succeeded', { p_provider: 'mock', p_event_id: ev, p_payment_id: pay.payment.id, p_ref: 'mock_1', p_amount_cents: 800 })).data;
  check('Zahlung', 'Webhook-Ereignis idempotent (2× → 1× verarbeitet)', r1 === 'paid' && r2 === 'duplicate');
  check('Zahlung', 'bezahlt → Termin bestätigt', (await admin.from('appointments').select('status').eq('id', pay.appointment.id).single()).data.status === 'confirmed');
  const pay2 = must(await b2.client.rpc('book_with_payment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: `${day}T16:00` }), 'book pay2');
  await sql(`update public.appointments set hold_expires_at = now() - interval '1 second' where id = '${pay2.appointment.id}'`);
  await sql('select app.expire_unpaid()');
  const st2 = (await admin.from('appointments').select('status').eq('id', pay2.appointment.id).single()).data.status;
  const ps2 = (await admin.from('payments').select('status').eq('id', pay2.payment.id).single()).data.status;
  check('Zahlung', 'unbezahlte Reservierung verfällt → Slot frei', st2 === 'cancelled' && ps2 === 'expired');
  check('Zahlung', 'Slot danach wieder buchbar', !(await b3.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: `${day}T16:00`, p_payment: 'in_salon' })).error);
  const cancelled = (await b1.client.rpc('cancel_with_refund', { p_appointment_id: pay.appointment.id })).data;
  check('Zahlung', 'rechtzeitige Absage → volle Erstattung vorgemerkt',
    cancelled?.payments?.[0]?.status === 'refund_pending' && cancelled?.payments?.[0]?.refundCents === 800);
  check('Zahlung', 'Kundin aus A sieht Zahlungen aus B nicht', ((await a1.client.rpc('my_payments')).data ?? []).length === 0);
  check('Zahlung', 'Cron-Job für Verfall aktiv', (await sql(`select count(*)::int as n from cron.job where jobname = 'payments-expire' and active`))[0].n === 1);

  // ------------------------------------------------------------ Export
  const exp = (await a1.client.rpc('export_my_data_v2')).data;
  check('Export', 'enthält Chat, Warteliste, Zahlungen, Einwilligungen, Push-Geräte',
    !!exp && Array.isArray(exp.chat) && 'waitlist' in exp && 'payments' in exp && 'marketingConsents' in exp && Array.isArray(exp.pushDevices) && exp.pushDevices.length === 1);

  // ------------------------------------------------------------ Korrekturen (Migration 20261014220000)
  const demoArgs = { p_tenant: tenantA.id, p_customer: a1.customerId };
  check('Demo', 'svc_demo_refresh für Kundinnen gesperrt', denied(await a1.client.rpc('svc_demo_refresh', demoArgs)));
  check('Demo', 'svc_demo_refresh für anon gesperrt', denied(await pub(ORIGIN_A).rpc('svc_demo_refresh', demoArgs)));
  check('CRM', 'svc_crm_search für Kundinnen gesperrt', denied(await a1.client.rpc('svc_crm_search', { p_tenant: tB.id, p_query: 'Test' })));
  const textOnly = (await admin.rpc('svc_crm_search', { p_tenant: tB.id, p_query: 'zzqx' })).data;
  check('CRM', 'Textsuche liefert keine Telefon-Fehltreffer', Array.isArray(textOnly) && textOnly.length === 0, `${textOnly?.length} Treffer`);
  const byPhone = (await admin.rpc('svc_crm_search', { p_tenant: tB.id, p_query: '1111111' })).data;
  check('CRM', 'Suche nach Telefonnummer findet nur Tenant B', Array.isArray(byPhone) && byPhone.length >= 1 && byPhone.every((c) => c.email.startsWith('sicherheitstest4-b')));
  const sugg = (await admin.rpc('svc_crm_link_suggestions', { p_tenant: tB.id, p_email: null, p_phone: '12' })).data;
  check('CRM', 'Vorschlag per Telefon erst ab 6 Ziffern', Array.isArray(sugg) && sugg.length === 0);

  const salonB = await user('salonB', ORIGIN_B, { register: false });
  must(await admin.from('salon_members').insert({ tenant_id: tB.id, user_id: salonB.userId, display_name: 'Test-Salon B' }), 'member B');
  const late = must(await b2.client.rpc('book_with_payment', { p_service_id: svcB.id, p_staff_id: stfB.id, p_start: `${day}T18:00` }), 'book late');
  await admin.rpc('svc_payment_succeeded', { p_provider: 'mock', p_event_id: `sec:${late.payment.id}`, p_payment_id: late.payment.id, p_ref: null, p_amount_cents: late.payment.amountCents });
  // Termin kurzfristig machen (in 2 Stunden): eine Absage der KUNDIN würde jetzt nichts erstatten
  await sql(`update public.appointments set starts_at = now() + interval '2 hours', ends_at = now() + interval '150 minutes' where id = '${late.appointment.id}'`);
  check('Zahlung', 'Kundin kann kurzfristig nicht selbst absagen', errIs(await b2.client.rpc('cancel_with_refund', { p_appointment_id: late.appointment.id }), 'too_late'));
  check('Zahlung', 'Kundin kann nicht als Salon absagen', errIs(await b2.client.rpc('salon_cancel_appointment', { p_appointment_id: late.appointment.id }), 'forbidden'));
  check('Zahlung', 'Salon aus Tenant A kann Termin in B nicht absagen', denied(await salonA.client.rpc('salon_cancel_appointment', { p_appointment_id: late.appointment.id })));
  check('Zahlung', 'Salon B sagt kurzfristig ab', !(await salonB.client.rpc('salon_cancel_appointment', { p_appointment_id: late.appointment.id })).error);
  const lateP = (await admin.from('payments').select('status, refund_cents, amount_cents').eq('id', late.payment.id).single()).data;
  check('Zahlung', 'Absage durch den Salon → immer volle Erstattung', lateP.status === 'refund_pending' && lateP.refund_cents === lateP.amount_cents, JSON.stringify(lateP));
} catch (e) {
  check('Ablauf', 'Test ohne Abbruch durchgelaufen', false, e.message);
} finally {
  if (created.tenantB) await admin.from('tenants').delete().eq('id', created.tenantB);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  await admin.from('notification_queue').delete().like('payload->>title', 'Test-Rabatt');
  const leftover = (await admin.from('customers').select('id').like('email', 'sicherheitstest4-%')).data?.length;
  const leftNews = (await admin.from('news_posts').select('id').eq('title', 'Test-Rabatt')).data;
  for (const n of leftNews ?? []) await admin.from('news_posts').delete().eq('id', n.id);
  check('Aufräumen', 'Test-Tenant, Testkundinnen und Test-Neuigkeit gelöscht', leftover === 0);
}

const passed = results.filter((r) => r.ok).length;
writeFileSync('docs/sicherheitstest-teil4.md', [
  '# Sicherheits- und Funktionstest Teil 3/4 (Chat, Neuigkeiten, Push, Warteliste, Zahlungen)',
  '',
  `Lauf: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC gegen das echte Projekt. Angriffe mit dem **Publishable Key**; Secret Key/Management-API nur für Auf-/Abbau und um Zeitablauf zu simulieren. Skript: \`scripts/security-test-teil4.mjs\`.`,
  '',
  `**Ergebnis: ${passed} von ${results.length} Prüfungen bestanden.** Die CRM-Schnittstelle (Signatur, Wiederholung, fremder Tenant) wird über HTTP in \`tests/crm-api.spec.ts\` geprüft.`,
  '',
  '| Bereich | Prüfung | Ergebnis |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? 'bestanden' : `**FEHLGESCHLAGEN**`}${r.detail ? ` (${r.detail})` : ''} |`),
  '',
].join('\n'));
console.log(`\n${passed}/${results.length} bestanden → docs/sicherheitstest-teil4.md`);
process.exit(passed === results.length ? 0 : 1);
