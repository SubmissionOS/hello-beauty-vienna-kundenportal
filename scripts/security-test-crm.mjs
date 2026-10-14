/**
 * Sicherheitstest „gemeinsame Datenbank“ (CRM + Kundenportal) gegen das echte Projekt.
 * Alle Prüfungen laufen mit dem PUBLISHABLE Key und echten Logins (Kundinnen, Mitarbeiterin, Inhaberin, anonym).
 * Der Secret Key wird nur für Auf- und Abbau der Testdaten genutzt. Passwörter kommen aus .env.local und
 * werden nie ausgegeben. Ergebnis: docs/sicherheitstest-crm.md
 * Aufruf: npm run test:security:crm
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const TEAM = {
  owner: ['inhaberin.demo@example.com', process.env.TEAM_DEMO_PASSWORD_OWNER],
  staff: ['mitarbeiterin1.demo@example.com', process.env.TEAM_DEMO_PASSWORD_STAFF1],
};
if (!URL_ || !PUB || !SECRET || !TEAM.owner[1] || !TEAM.staff[1]) {
  console.error('Fehlt in .env.local: Supabase-Werte oder TEAM_DEMO_PASSWORD_* (npm run env:ensure, npm run db:seed:crm)');
  process.exit(1);
}

const ORIGIN = 'http://localhost:3000';
const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(URL_, SECRET, { auth: noSession });
const pub = (token) =>
  createClient(URL_, PUB, {
    auth: noSession,
    global: { headers: { Origin: ORIGIN, ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
  });

const results = [];
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${group} · ${name}${detail ? ` (${detail})` : ''}`);
}
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const rows = (r) => (r.error ? -1 : (r.data ?? []).length);
const none = (r) => rows(r) <= 0;
const denied = (r) => !!r.error;
const errIs = (r, code) => r.error?.message === code;
const wall = (iso) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)).replace(' ', 'T');

const tag = randomBytes(3).toString('hex');
const created = { users: [], customers: [], news: [] };
let autoLinkBefore = null;
let tenantId = null;

async function login(email, password) {
  const s = must(await pub().auth.signInWithPassword({ email, password }), `login ${email}`).session;
  return { token: s.access_token, client: pub(s.access_token), userId: s.user.id };
}

async function makeCustomer(label, { first, last, phone } = {}) {
  const email = `crmtest-${label}-${tag}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${label}`).user;
  created.users.push(user.id);
  const s = await login(email, password);
  const profile = must(
    await s.client.rpc('register_customer', {
      p_first_name: first ?? label.toUpperCase(),
      p_last_name: last ?? `Test${tag}`,
      p_phone: phone ?? null,
      p_language: 'de',
      p_marketing: false,
    }),
    `register ${label}`,
  );
  return { ...s, label, email, customerId: profile.id };
}

try {
  tenantId = must(await admin.from('tenants').select('id').eq('slug', 'hello-beauty').single(), 'tenant').id;
  const owner = await login(...TEAM.owner);
  const staff = await login(...TEAM.staff);
  const a = await makeCustomer('a');
  const b = await makeCustomer('b');
  const anon = pub();

  // Bestandskundin (ohne Portal-Konto) mit Termin – Vorlage für Verknüpfen
  const phone = `+43 660 ${String(Math.floor(Math.random() * 9e6) + 1e6)}`;
  const legacy = must(
    await admin
      .from('customers')
      .insert({ tenant_id: tenantId, user_id: null, first_name: 'Merge', last_name: `Probe${tag}`, phone, email: null })
      .select('id, customer_number')
      .single(),
    'legacy',
  );
  created.customers.push(legacy.id);

  const svc = must(await pub().from('services').select('id').order('sort_order').limit(1).single(), 'service');
  async function freeSlot(fromDay) {
    for (let d = fromDay; d < fromDay + 20; d++) {
      const date = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
      const s = (await pub().rpc('available_slots', { p_service_id: svc.id, p_staff_id: null, p_date: date })).data ?? [];
      if (s.length) return s[0];
    }
    throw new Error('kein freier Slot gefunden');
  }

  // ------------------------------------------------------------ Team-Erkennung
  const meStaff = (await staff.client.rpc('staff_me')).data;
  const meOwner = (await owner.client.rpc('staff_me')).data;
  check('Rollen', 'Mitarbeiterin wird als Team erkannt (staff)', meStaff?.role === 'staff');
  check('Rollen', 'Inhaberin wird als Team erkannt (owner)', meOwner?.role === 'owner');
  check('Rollen', 'Kundin ist kein Team (staff_me = null)', (await a.client.rpc('staff_me')).data === null);
  check('Rollen', 'anonym: staff_me verweigert oder null', denied(await anon.rpc('staff_me')) || (await anon.rpc('staff_me')).data === null);

  // ------------------------------------------------------------ Anonym: nichts Personenbezogenes
  for (const t of ['customers', 'customer_private', 'internal_notes', 'link_suggestions', 'app_settings', 'booking_requests', 'salon_members', 'chat_messages', 'waitlist_entries', 'waitlist_offers', 'payments', 'crm_audit_log', 'staff_appointments', 'staff_customer_stats']) {
    check('Anonym', `${t}: keine Zeilen/kein Zugriff`, none(await anon.from(t).select('*').limit(5)));
  }
  check('Anonym', 'staff_team verweigert', denied(await anon.rpc('staff_team')));
  check('Anonym', 'staff_book_appointment verweigert', denied(await anon.rpc('staff_book_appointment', { p_customer: a.customerId, p_service: svc.id, p_staff: null, p_start: '2030-01-01T10:00', p_note: null })));

  // ------------------------------------------------------------ Kundin: keine CRM-Daten, nur Eigenes
  for (const t of ['customer_private', 'internal_notes', 'link_suggestions', 'app_settings', 'booking_requests', 'salon_members', 'crm_audit_log', 'staff_appointments', 'staff_customer_stats']) {
    check('Kundin', `${t}: keine Zeilen/kein Zugriff`, none(await a.client.from(t).select('*').limit(5)));
  }
  const aCust = (await a.client.from('customers').select('id')).data ?? [];
  check('Kundin', 'sieht nur den eigenen Kundendatensatz (keine Bestandskundinnen)', aCust.length === 1 && aCust[0].id === a.customerId);
  check('Kundin', 'Bestandskundin direkt abfragen → 0 Zeilen', rows(await a.client.from('customers').select('id').eq('id', legacy.id)) === 0);
  check('Kundin', 'staff_team liefert keine Team-Daten', JSON.stringify((await a.client.rpc('staff_team')).data ?? []) === '[]');
  for (const [fn, args] of [
    ['staff_book_appointment', { p_customer: b.customerId, p_service: svc.id, p_staff: null, p_start: '2030-01-01T10:00', p_note: null }],
    ['staff_send_chat', { p_customer: b.customerId, p_body: 'x' }],
    ['staff_news_save', { p_kind: 'news', p_title: 'x', p_body: 'x', p_image_path: null, p_valid_until: null, p_publish: true }],
    ['staff_unlink_portal', { p_customer: b.customerId }],
    ['staff_offer_free_slot', { p_staff: '00000000-0000-0000-0000-000000000000', p_start: '2030-01-01T10:00', p_minutes: 30 }],
  ]) {
    check('Kundin', `${fn} → forbidden`, errIs(await a.client.rpc(fn, args), 'forbidden'));
  }
  check('Kundin', 'app_settings ändern → keine Wirkung', rows(await a.client.from('app_settings').update({ auto_link_verified: true }).eq('tenant_id', tenantId).select('tenant_id')) <= 0);
  check('Kundin', 'interne Notiz anlegen verweigert', denied(await a.client.from('internal_notes').insert({ tenant_id: tenantId, customer_id: a.customerId, body: 'x', created_by: 'x' })));

  // Chat A ↔ B
  must(await a.client.rpc('send_chat_message', { p_body: `Hallo vom Test ${tag}` }), 'chat a');
  check('A ↔ B', 'b sieht die Nachricht von a nicht', rows(await b.client.from('chat_messages').select('id').eq('customer_id', a.customerId)) === 0);
  check('A ↔ B', 'b sieht a nicht in customers', rows(await b.client.from('customers').select('id').eq('id', a.customerId)) === 0);

  // ------------------------------------------------------------ Team sieht alles des Salons
  check('Team', 'Mitarbeiterin sieht Kundin a und b', rows(await staff.client.from('customers').select('id').in('id', [a.customerId, b.customerId])) === 2);
  check('Team', 'Mitarbeiterin sieht Bestandskundin', rows(await staff.client.from('customers').select('id').eq('id', legacy.id)) === 1);
  check('Team', 'Mitarbeiterin sieht Chat von a', rows(await staff.client.from('chat_messages').select('id').eq('customer_id', a.customerId)) >= 1);
  check('Team', 'Ansicht staff_appointments liefert Zeilen', rows(await staff.client.from('staff_appointments').select('id').limit(5)) > 0);
  const note = await staff.client.from('internal_notes').insert({ tenant_id: tenantId, customer_id: a.customerId, body: 'Testnotiz', created_by: 'team:test' }).select('id');
  check('Team', 'interne Notiz anlegen erlaubt', rows(note) === 1);
  check('Kundin', 'a sieht die interne Notiz über sich nicht', rows(await a.client.from('internal_notes').select('id').eq('customer_id', a.customerId)) <= 0);
  const reply = await staff.client.rpc('staff_send_chat', { p_customer: a.customerId, p_body: `Antwort ${tag}` });
  check('Team', 'Antwort im Chat senden', !reply.error);
  check('Kundin', 'a sieht die Antwort des Salons', rows(await a.client.from('chat_messages').select('id').eq('sender', 'salon')) >= 1);

  // Einstellung „automatisch verknüpfen“: nur Inhaberin
  autoLinkBefore = must(await admin.from('app_settings').select('auto_link_verified').eq('tenant_id', tenantId).single(), 'settings').auto_link_verified;
  check('Rollen', 'Mitarbeiterin kann auto_link_verified NICHT ändern', rows(await staff.client.from('app_settings').update({ auto_link_verified: !autoLinkBefore }).eq('tenant_id', tenantId).select('tenant_id')) <= 0);
  check('Rollen', 'Inhaberin kann auto_link_verified ändern', rows(await owner.client.from('app_settings').update({ auto_link_verified: !autoLinkBefore }).eq('tenant_id', tenantId).select('tenant_id')) === 1);
  must(await admin.from('app_settings').update({ auto_link_verified: autoLinkBefore }).eq('tenant_id', tenantId), 'settings zurück');

  // ------------------------------------------------------------ Verknüpfen / Trennen nur durch das Team
  const legacySlot = await freeSlot(3);
  const legacyAppt = await staff.client.rpc('staff_book_appointment', {
    p_customer: legacy.id,
    p_service: svc.id,
    p_staff: legacySlot.staff_id,
    p_start: wall(legacySlot.start),
    p_note: null,
  });
  check('Verknüpfen', 'Team bucht Termin für Bestandskundin', !legacyAppt.error, legacyAppt.error?.message);
  const m = await makeCustomer('m', { first: 'Merge', last: `Probe${tag}`, phone });
  const sug = (await staff.client.from('link_suggestions').select('id, status, matched_by').eq('portal_customer_id', m.customerId)).data ?? [];
  check('Verknüpfen', 'Registrierung mit gleichem Namen + Telefon → Vorschlag', sug.length === 1 && sug[0].status === 'open' && sug[0].matched_by.includes('phone'));
  check('Verknüpfen', 'ohne Bestätigung keine automatische Verknüpfung', rows(await m.client.from('customers').select('id').eq('id', legacy.id)) === 0);
  check('Verknüpfen', 'Kundin kann Vorschlag nicht bestätigen', errIs(await m.client.rpc('staff_confirm_link', { p_suggestion: sug[0]?.id }), 'forbidden'));
  check('Verknüpfen', 'anonym kann Vorschlag nicht bestätigen', denied(await anon.rpc('staff_confirm_link', { p_suggestion: sug[0]?.id })));
  const conf = await staff.client.rpc('staff_confirm_link', { p_suggestion: sug[0]?.id });
  check('Verknüpfen', 'Team bestätigt → zusammengeführt', !conf.error, conf.error?.message);
  const mNow = (await m.client.from('customers').select('id, customer_number')).data ?? [];
  check('Verknüpfen', 'Kundin ist jetzt die Bestandsakte (gleiche Kundennummer)', mNow.length === 1 && mNow[0].id === legacy.id && mNow[0].customer_number === legacy.customer_number);
  check('Verknüpfen', 'Kundin sieht die Historie der Bestandsakte', rows(await m.client.from('appointments').select('id').eq('id', legacyAppt.data?.id ?? '00000000-0000-0000-0000-000000000000')) === 1);
  const logged = (await admin.from('crm_audit_log').select('id').eq('action', 'merge').eq('customer_id', legacy.id)).data ?? [];
  check('Verknüpfen', 'Zusammenführung ist protokolliert', logged.length >= 1);
  const kept = (await staff.client.from('link_suggestions').select('status').eq('id', sug[0]?.id)).data ?? [];
  check('Verknüpfen', 'Vorschlag bleibt als „bestätigt“ sichtbar', kept[0]?.status === 'confirmed');
  check('Trennen', 'Kundin kann sich nicht selbst trennen', errIs(await m.client.rpc('staff_unlink_portal', { p_customer: legacy.id }), 'forbidden'));
  const unl = await staff.client.rpc('staff_unlink_portal', { p_customer: legacy.id });
  check('Trennen', 'Team trennt', !unl.error, unl.error?.message);
  const mAfter = (await m.client.from('customers').select('id')).data ?? [];
  check('Trennen', 'Kundin hat wieder eine eigene, neue Akte', mAfter.length === 1 && mAfter[0].id !== legacy.id);
  check('Trennen', 'Historie bleibt bei der Bestandsakte', rows(await m.client.from('appointments').select('id').eq('id', legacyAppt.data?.id ?? '00000000-0000-0000-0000-000000000000')) === 0);
  check('Trennen', 'Trennung ist protokolliert', ((await admin.from('crm_audit_log').select('id').eq('action', 'unlink').eq('customer_id', legacy.id)).data ?? []).length >= 1);
  const after = (await staff.client.from('link_suggestions').select('status').eq('id', sug[0]?.id)).data ?? [];
  check('Trennen', 'Vorschlag steht danach auf „getrennt“', after[0]?.status === 'unlinked');

  // ------------------------------------------------------------ Doppelbuchung CRM + Portal gleichzeitig
  const race = await freeSlot(5);
  const [fromPortal, fromCrm] = await Promise.all([
    a.client.rpc('book_appointment', { p_service_id: svc.id, p_staff_id: race.staff_id, p_start: race.start, p_payment: 'in_salon' }),
    staff.client.rpc('staff_book_appointment', { p_customer: b.customerId, p_service: svc.id, p_staff: race.staff_id, p_start: wall(race.start), p_note: null }),
  ]);
  const okCount = [fromPortal, fromCrm].filter((r) => !r.error).length;
  const takenCount = [fromPortal, fromCrm].filter((r) => errIs(r, 'slot_taken')).length;
  check('Doppelbuchung', 'Portal + CRM gleichzeitig → genau 1 Buchung, 1 × slot_taken', okCount === 1 && takenCount === 1, `${okCount} ok / ${takenCount} abgewiesen`);
  // überlappende aktive Termine dieser Mitarbeiterin im Slot (Zeitvergleich als Zeitpunkt, nicht als Text)
  const slotStart = new Date(race.start).toISOString();
  const slotEnd = new Date(new Date(race.start).getTime() + 60_000).toISOString();
  const inDb = await admin
    .from('appointments')
    .select('id, status')
    .eq('staff_id', race.staff_id)
    .lt('starts_at', slotEnd)
    .gte('ends_at', slotEnd)
    .lte('starts_at', slotStart)
    .in('status', ['pending', 'confirmed']);
  check('Doppelbuchung', 'in der DB genau ein aktiver Termin für den Slot', rows(inDb) === 1, `${rows(inDb)} gefunden`);

  // CRM-Termin erscheint im Portal, Portal-Termin im CRM
  const slot2 = await freeSlot(7);
  const crmBooked = await staff.client.rpc('staff_book_appointment', { p_customer: b.customerId, p_service: svc.id, p_staff: slot2.staff_id, p_start: wall(slot2.start), p_note: null });
  check('Gemeinsam', 'CRM-Termin sofort für die Kundin sichtbar', !crmBooked.error && rows(await b.client.from('appointments').select('id').eq('id', crmBooked.data?.id ?? '00000000-0000-0000-0000-000000000000')) === 1);
  const portalId = (fromPortal.data?.id ?? fromCrm.data?.id) || null;
  check('Gemeinsam', 'Portal-Termin sofort im CRM sichtbar (staff_appointments)', !!portalId && rows(await staff.client.from('staff_appointments').select('id').eq('id', portalId)) === 1);
} catch (e) {
  check('Ablauf', 'Test ohne Abbruch durchgelaufen', false, e.message);
} finally {
  // ------------------------------------------------------------ Abbau (Test-User mit Kaskade, Bestandsakte, Einstellung)
  if (autoLinkBefore !== null && tenantId) await admin.from('app_settings').update({ auto_link_verified: autoLinkBefore }).eq('tenant_id', tenantId);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  for (const id of created.customers) await admin.from('customers').delete().eq('id', id);
  const leftCust = (await admin.from('customers').select('id').or(`email.like.crmtest-%-${tag}@example.com,last_name.eq.Probe${tag}`)).data?.length;
  check('Aufräumen', 'alle Testkundinnen und die Test-Bestandsakte gelöscht', leftCust === 0, `${leftCust} übrig`);
}

const passed = results.filter((r) => r.ok).length;
const md = [
  '# Sicherheitstest gemeinsame Datenbank (CRM + Kundenportal)',
  '',
  `Lauf: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC gegen das echte Projekt. Alle Prüfungen mit dem **Publishable Key** und echten Logins (Kundinnen a, b, m · Mitarbeiterin · Inhaberin · anonym). Secret Key nur für Auf- und Abbau. Skript: \`scripts/security-test-crm.mjs\` (\`npm run test:security:crm\`).`,
  '',
  `**Ergebnis: ${passed} von ${results.length} Prüfungen bestanden.**`,
  '',
  '| Bereich | Prüfung | Ergebnis |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? 'bestanden' : `**FEHLGESCHLAGEN**${r.detail ? ` – ${r.detail}` : ''}`}${r.ok && r.detail ? ` (${r.detail})` : ''} |`),
  '',
].join('\n');
writeFileSync('docs/sicherheitstest-crm.md', md);
console.log(`\n${passed}/${results.length} bestanden → docs/sicherheitstest-crm.md`);
process.exit(passed === results.length ? 0 : 1);
