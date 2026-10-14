/**
 * Sicherheitstest gegen die echte Datenbank – alle Angriffe laufen mit dem PUBLISHABLE Key (wie ein Browser).
 * Der Secret Key wird nur für Aufbau und Abbau der Testdaten genutzt. Ergebnis: docs/sicherheitstest.md
 * Aufruf: npm run test:security
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) {
  console.error('Fehlt in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY oder SUPABASE_SECRET_KEY');
  process.exit(1);
}

const ORIGIN_A = 'http://localhost:3000';
const ORIGIN_B = 'https://tenant-b.sicherheitstest.invalid';
const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(URL_, SECRET, { auth: noSession });
const pub = (origin, token) =>
  createClient(URL_, PUB, {
    auth: noSession,
    global: { headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
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
const denied = (r) => !!r.error;
const errIs = (r, code) => r.error?.message === code;

const created = { users: [], tenantB: null };

try {
  // ------------------------------------------------------------ Aufbau
  const tenantA = must(await admin.from('tenants').select('id').eq('slug', 'hello-beauty').single(), 'tenant A');
  const tenantB = must(
    await admin.from('tenants').insert({ slug: 'sicherheitstest-b', name: 'Sicherheitstest B', max_bookings_per_hour: 2 }).select().single(),
    'tenant B',
  );
  created.tenantB = tenantB.id;
  must(await admin.from('tenant_domains').insert({ tenant_id: tenantB.id, host: 'tenant-b.sicherheitstest.invalid', note: 'Sicherheitstest' }), 'domain B');
  const catB = must(await admin.from('service_categories').insert({ tenant_id: tenantB.id, key: 'nails', sort_order: 1 }).select().single(), 'cat B');
  const svcB = must(
    await admin.from('services').insert({ tenant_id: tenantB.id, category_id: catB.id, code: 'b-1', name: 'Test B', duration_minutes: 30, price_eur: 10 }).select().single(),
    'svc B',
  );
  const stfB = must(await admin.from('staff').insert({ tenant_id: tenantB.id, code: 'b-st', display_name: 'Bea' }).select().single(), 'staff B');
  must(await admin.from('staff_services').insert({ tenant_id: tenantB.id, staff_id: stfB.id, service_id: svcB.id }), 'ss B');
  must(
    await admin.from('opening_hours').insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenant_id: tenantB.id, weekday: d, opens: '06:00', closes: '22:00' }))),
    'hours B',
  );

  async function makeUser(label, origin) {
    const email = `sicherheitstest-${label}-${randomBytes(4).toString('hex')}@example.com`;
    const password = randomBytes(24).toString('base64url');
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `user ${label}`).user;
    created.users.push(user.id);
    const c = pub(origin);
    const s = must(await c.auth.signInWithPassword({ email, password }), `login ${label}`).session;
    const client = pub(origin, s.access_token);
    const profile = must(
      await client.rpc('register_customer', { p_first_name: label.toUpperCase(), p_last_name: 'Test', p_phone: null, p_language: 'de', p_marketing: false }),
      `register ${label}`,
    );
    return { label, email, token: s.access_token, client, customerId: profile.id, userId: user.id };
  }
  const a1 = await makeUser('a1', ORIGIN_A);
  const a2 = await makeUser('a2', ORIGIN_A);
  const b1 = await makeUser('b1', ORIGIN_B);
  const b2 = await makeUser('b2', ORIGIN_B);

  // Freien Slot in A finden (morgen oder später)
  const svcA = must(await pub(ORIGIN_A).from('services').select('id').order('sort_order').limit(1).single(), 'svc A');
  let slotA = null;
  for (let d = 1; d < 14 && !slotA; d++) {
    const date = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
    const s = must(await pub(ORIGIN_A).rpc('available_slots', { p_service_id: svcA.id, p_staff_id: null, p_date: date }), 'slots A');
    slotA = s[0] ?? null;
  }
  if (!slotA) throw new Error('kein freier Slot in A gefunden');
  const dateB = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const slotsB = must(await pub(ORIGIN_B).rpc('available_slots', { p_service_id: svcB.id, p_staff_id: null, p_date: dateB }), 'slots B');

  // ------------------------------------------------------------ 1. Anonym (nur Publishable Key)
  const anonA = pub(ORIGIN_A);
  check('Anonym', 'customers: keine Zeilen/kein Zugriff', rows(await anonA.from('customers').select('*')) <= 0);
  check('Anonym', 'appointments: keine Zeilen/kein Zugriff', rows(await anonA.from('appointments').select('*')) <= 0);
  check('Anonym', 'my_appointments: kein Zugriff', rows(await anonA.from('my_appointments').select('*')) <= 0);
  check('Anonym', 'tenant_domains unsichtbar', rows(await anonA.from('tenant_domains').select('*')) <= 0);
  check('Anonym', 'booking_attempts unsichtbar', rows(await anonA.from('booking_attempts').select('*')) <= 0);
  check('Anonym', 'staff: interne Spalte „code“ gesperrt', denied(await anonA.from('staff').select('code')));
  check('Anonym', 'Katalog des eigenen Tenants lesbar (gewollt)', rows(await anonA.from('services').select('id')) > 0);
  check('Anonym', 'export_my_data verweigert', denied(await anonA.rpc('export_my_data')));
  check('Anonym', 'book_appointment verweigert', denied(await anonA.rpc('book_appointment', { p_service_id: svcA.id, p_staff_id: null, p_start: slotA.start, p_payment: 'in_salon' })));
  check('Anonym', 'Insert in customers verweigert', denied(await anonA.from('customers').insert({ tenant_id: tenantA.id, user_id: a1.userId, first_name: 'X', last_name: 'Y', email: 'x@example.com' })));
  check('Anonym', 'unbekannter Host sieht keinen Katalog', rows(await pub('https://fremd.invalid').from('services').select('id')) === 0);
  const anonBServices = (await pub(ORIGIN_B).from('services').select('id')).data ?? [];
  check('Anonym', 'Host B sieht nur Katalog B', anonBServices.length === 1 && anonBServices[0].id === svcB.id);

  // ------------------------------------------------------------ 2. Buchungen + Doppelbuchung
  const bookA1 = await a1.client.rpc('book_appointment', { p_service_id: svcA.id, p_staff_id: slotA.staff_id, p_start: slotA.start, p_payment: 'in_salon' });
  check('Buchen', 'a1 bucht freien Slot', !bookA1.error);
  const dupe = await a2.client.rpc('book_appointment', { p_service_id: svcA.id, p_staff_id: slotA.staff_id, p_start: slotA.start, p_payment: 'in_salon' });
  check('Doppelbuchung', 'a2 bucht denselben Slot → slot_taken', errIs(dupe, 'slot_taken'));

  // Gleichzeitig: a1 und a2 auf einen neuen Slot, parallel abgeschickt
  let race = null;
  for (let d = 3; d < 20 && !race; d++) {
    const date = new Date(Date.now() + d * 86400_000).toISOString().slice(0, 10);
    race = (await a1.client.rpc('available_slots', { p_service_id: svcA.id, p_staff_id: null, p_date: date })).data?.[0] ?? null;
  }
  const parallel = await Promise.all(
    [a1, a2].map((u) => u.client.rpc('book_appointment', { p_service_id: svcA.id, p_staff_id: race.staff_id, p_start: race.start, p_payment: 'in_salon' })),
  );
  const ok = parallel.filter((r) => !r.error).length;
  const taken = parallel.filter((r) => errIs(r, 'slot_taken')).length;
  check('Doppelbuchung', 'zwei gleichzeitige Anfragen → genau 1 Erfolg, 1 × slot_taken', ok === 1 && taken === 1, `${ok} ok / ${taken} abgewiesen`);

  // Auch direkt in der DB (Secret Key, ohne Funktion): Exclusion-Constraint greift
  const a1Appt = bookA1.data;
  const raw = await admin.from('appointments').select('*').eq('id', a1Appt.id).single();
  const copy = { ...raw.data };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  const direct = await admin.from('appointments').insert({ ...copy, customer_id: (await admin.from('customers').select('id').eq('id', a2.customerId).single()).data.id });
  check('Doppelbuchung', 'direkter Insert überlappend → Exclusion-Constraint (23P01)', direct.error?.code === '23P01');

  // ------------------------------------------------------------ 3. Kundin A vs. Kundin A (gleicher Tenant)
  const a1Customers = (await a1.client.from('customers').select('id')).data ?? [];
  check('A1 ↔ A2', 'a1 sieht nur den eigenen Kundendatensatz', a1Customers.length === 1 && a1Customers[0].id === a1.customerId);
  const a1Appts = (await a1.client.from('appointments').select('customer_id')).data ?? [];
  check('A1 ↔ A2', 'a1 sieht nur eigene Termine', a1Appts.length > 0 && a1Appts.every((x) => x.customer_id === a1.customerId));
  const a2Appt = parallel.find((r, i) => !r.error && i === 1)?.data ?? (await a2.client.rpc('book_appointment', { p_service_id: svcA.id, p_staff_id: null, p_start: (await a2.client.rpc('available_slots', { p_service_id: svcA.id, p_staff_id: null, p_date: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) })).data?.[0]?.start ?? slotA.start, p_payment: 'in_salon' })).data;
  if (a2Appt) {
    check('A1 ↔ A2', 'a1 kann Termin von a2 nicht lesen', rows(await a1.client.from('appointments').select('id').eq('id', a2Appt.id)) === 0);
    check('A1 ↔ A2', 'a1 kann Termin von a2 nicht absagen', errIs(await a1.client.rpc('cancel_appointment', { p_id: a2Appt.id }), 'not_found'));
    check('A1 ↔ A2', 'a1 kann Termin von a2 nicht verschieben', errIs(await a1.client.rpc('reschedule_appointment', { p_id: a2Appt.id, p_new_start: slotA.start }), 'not_found'));
  }
  check('A1 ↔ A2', 'Update auf fremden Kundendatensatz verweigert', denied(await a1.client.from('customers').update({ first_name: 'HACK' }).eq('id', a2.customerId)));
  check('A1 ↔ A2', 'Delete auf Termine verweigert', denied(await a1.client.from('appointments').delete().eq('customer_id', a2.customerId)));
  check('A1 ↔ A2', 'Insert in appointments verweigert', denied(await a1.client.from('appointments').insert({ ...copy, customer_id: a1.customerId })));
  const a2Still = (await admin.from('customers').select('first_name').eq('id', a2.customerId).single()).data;
  check('A1 ↔ A2', 'Datensatz a2 unverändert', a2Still.first_name === 'A2');

  // ------------------------------------------------------------ 4. Tenant A vs. Tenant B
  const a1onB = pub(ORIGIN_B, a1.token);
  check('A ↔ B', 'a1 unter Host B: keine Kundendaten', rows(await a1onB.from('customers').select('*')) === 0);
  check('A ↔ B', 'a1 unter Host B: keine Termine', rows(await a1onB.from('appointments').select('*')) === 0);
  check('A ↔ B', 'a1 unter Host B: Buchen verweigert (not_registered)', errIs(await a1onB.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: null, p_start: slotsB[0].start, p_payment: 'in_salon' }), 'not_registered'));
  check('A ↔ B', 'a1 unter Host B: Export verweigert', denied(await a1onB.rpc('export_my_data')));
  check('A ↔ B', 'a1 bucht Leistung von B unter Host A → not_found', errIs(await a1.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: null, p_start: slotA.start, p_payment: 'in_salon' }), 'not_found'));
  const bookB1 = await b1.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: null, p_start: slotsB[0].start, p_payment: 'in_salon' });
  check('A ↔ B', 'b1 bucht in B', !bookB1.error);
  check('A ↔ B', 'a1 sieht Termin von b1 nicht', rows(await a1.client.from('appointments').select('id').eq('id', bookB1.data?.id ?? '00000000-0000-0000-0000-000000000000')) === 0);
  check('A ↔ B', 'a1 kann Termin von b1 nicht absagen', errIs(await a1.client.rpc('cancel_appointment', { p_id: bookB1.data?.id }), 'not_found'));
  const b1onA = pub(ORIGIN_A, b1.token);
  check('A ↔ B', 'b1 unter Host A: keine Kundendaten von A', rows(await b1onA.from('customers').select('*')) === 0);
  check('A ↔ B', 'b1 sieht nur Katalog B unter Host B', ((await b1.client.from('services').select('id')).data ?? []).every((s) => s.id === svcB.id));
  check('B1 ↔ B2', 'b2 sieht Termin von b1 nicht', rows(await b2.client.from('appointments').select('id')) === 0);
  check('A ↔ B', 'Tenant per Parameter erzwingen unmöglich (Spalte tenant_id beim Insert verweigert)', denied(await b1.client.from('customers').insert({ tenant_id: tenantA.id, user_id: b1.userId, first_name: 'X', last_name: 'Y', email: b1.email })));

  // ------------------------------------------------------------ 5. Rate-Limit (Tenant B: 2 Buchungen/Stunde)
  const second = await b1.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: null, p_start: slotsB[2].start, p_payment: 'in_salon' });
  const third = await b1.client.rpc('book_appointment', { p_service_id: svcB.id, p_staff_id: null, p_start: slotsB[4].start, p_payment: 'in_salon' });
  check('Rate-Limit', '2. Buchung erlaubt, 3. → rate_limited', !second.error && errIs(third, 'rate_limited'));

  // ------------------------------------------------------------ 6. Löschanfrage
  must(await b2.client.rpc('request_account_deletion'), 'deletion b2');
  check('Löschen', 'nach request_account_deletion: eigener Datensatz gesperrt', rows(await b2.client.from('customers').select('*')) === 0);
  check('Löschen', 'nach request_account_deletion: Export verweigert', denied(await b2.client.rpc('export_my_data')));
} catch (e) {
  check('Ablauf', 'Test ohne Abbruch durchgelaufen', false, e.message);
} finally {
  // ------------------------------------------------------------ Abbau: Tenant B komplett, alle Test-User (Kaskade)
  if (created.tenantB) await admin.from('tenants').delete().eq('id', created.tenantB);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  const leftTenant = created.tenantB ? (await admin.from('tenants').select('id').eq('id', created.tenantB)).data?.length : 0;
  const leftCust = (await admin.from('customers').select('id').like('email', 'sicherheitstest-%')).data?.length;
  check('Aufräumen', 'Tenant B und alle Testkundinnen gelöscht', leftTenant === 0 && leftCust === 0);
}

const passed = results.filter((r) => r.ok).length;
const md = [
  '# Sicherheitstest Supabase (RLS, Tenants, Doppelbuchung)',
  '',
  `Lauf: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC gegen das echte Projekt. Angriffe ausschließlich mit dem **Publishable Key** (wie ein Browser); Secret Key nur für Auf- und Abbau. Skript: \`scripts/security-test.mjs\` (\`npm run test:security\`).`,
  '',
  'Aufbau: Tenant A = `hello-beauty` (Host localhost), Tenant B = `sicherheitstest-b` (eigener Host), je 2 Kundinnen (a1, a2, b1, b2). Danach wurden Tenant B und alle Testkundinnen wieder gelöscht.',
  '',
  `**Ergebnis: ${passed} von ${results.length} Prüfungen bestanden.**`,
  '',
  '| Bereich | Prüfung | Ergebnis |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.group} | ${r.name} | ${r.ok ? 'bestanden' : `**FEHLGESCHLAGEN**${r.detail ? ` – ${r.detail}` : ''}`}${r.ok && r.detail ? ` (${r.detail})` : ''} |`),
  '',
].join('\n');
writeFileSync('docs/sicherheitstest.md', md);
console.log(`\n${passed}/${results.length} bestanden → docs/sicherheitstest.md`);
process.exit(passed === results.length ? 0 : 1);
