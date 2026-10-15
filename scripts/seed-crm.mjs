/**
 * Seed für das CRM auf der gemeinsamen Datenbank (lokal, idempotent). Läuft nach db:seed und db:seed:teil4.
 *   - Team-Demo-Zugänge (Passwörter aus .env.local, nie ausgegeben):
 *       inhaberin.demo@example.com (owner), mitarbeiterin1.demo@example.com, mitarbeiterin2.demo@example.com (staff)
 *   - 15 Bestandskundinnen OHNE Portal-Konto mit Terminhistorie und internen Angaben
 *     [PLATZHALTER: echte Kundendaten erst nach Freigabe übernehmen]
 *   - eine davon passt zur Demo-Kundin Lena (gleicher Name + Telefonnummer) → offener Verknüpfungs-Vorschlag
 * Aufruf: npm run db:seed:crm
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const env = process.env;
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TEAM_DEMO_PASSWORD_OWNER', 'TEAM_DEMO_PASSWORD_STAFF1', 'TEAM_DEMO_PASSWORD_STAFF2']) {
  if (!env[k]) {
    console.error(`Fehlt in .env.local: ${k} (npm run env:ensure)`);
    process.exit(1);
  }
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const tenant = must(await db.from('tenants').select('id, time_zone').eq('slug', 'hello-beauty').single(), 'tenant');
const staff = must(await db.from('staff').select('id, display_name').eq('tenant_id', tenant.id).order('sort_order'), 'staff');
const services = must(
  await db.from('services').select('id, name, duration_minutes, price_eur, service_categories!inner(key)').eq('tenant_id', tenant.id),
  'services',
);
const svc = (name) => services.find((s) => s.name === name);

// ---------------------------------------------------------------- Team-Zugänge
const TEAM = [
  { email: 'inhaberin.demo@example.com', password: env.TEAM_DEMO_PASSWORD_OWNER, role: 'owner', name: 'Inhaberin (Demo)' },
  { email: 'mitarbeiterin1.demo@example.com', password: env.TEAM_DEMO_PASSWORD_STAFF1, role: 'staff', name: 'Petra (Demo)' },
  { email: 'mitarbeiterin2.demo@example.com', password: env.TEAM_DEMO_PASSWORD_STAFF2, role: 'staff', name: 'Réka (Demo)' },
];
const { data: userList } = await db.auth.admin.listUsers({ perPage: 1000 });
for (const m of TEAM) {
  let u = userList.users.find((x) => x.email === m.email);
  if (!u) {
    u = must(await db.auth.admin.createUser({ email: m.email, password: m.password, email_confirm: true, app_metadata: { team: true, demo: true } }), m.email).user;
  } else {
    must(await db.auth.admin.updateUserById(u.id, { password: m.password, app_metadata: { team: true, demo: true } }), m.email);
  }
  must(await db.from('salon_members').upsert({ tenant_id: tenant.id, user_id: u.id, role: m.role, display_name: m.name }, { onConflict: 'tenant_id,user_id' }), 'member');
}

// ---------------------------------------------------------------- Bestandskundinnen (ohne Portal-Konto)
const LEGACY = [
  ['Lena', 'Musterfrau', '0660 0000000', 'lena.m@gmx.example', 'regular', null, 'Mag Nude-Töne, kommt meist samstags.'],
  ['Anna', 'Huber', '+43 664 1230001', 'anna.huber@example.at', 'vip', 'Latex', 'Stammkundin seit 2019.'],
  ['Katharina', 'Gruber', '+43 676 1230002', 'k.gruber@example.at', 'regular', null, null],
  ['Sophie', 'Wagner', '+43 650 1230003', null, 'new', null, 'Erstbesuch über Empfehlung.'],
  ['Julia', 'Bauer', '+43 699 1230004', 'julia.bauer@example.at', 'regular', 'Acetonempfindlich', null],
  ['Marie', 'Pichler', '+43 664 1230005', 'marie.pichler@example.at', 'inactive', null, 'Seit Umzug nicht mehr gekommen.'],
  ['Laura', 'Steiner', '+43 660 1230006', 'laura.steiner@example.at', 'regular', null, null],
  ['Viktoria', 'Moser', '+43 676 1230007', null, 'vip', null, 'Bevorzugt Termine am Vormittag.'],
  ['Hanna', 'Hofer', '+43 650 1230008', 'hanna.hofer@example.at', 'new', null, null],
  ['Eszter', 'Nagy', '+36 30 1230009', 'eszter.nagy@example.hu', 'regular', null, 'Spricht lieber Ungarisch.'],
  ['Réka', 'Kovács', '+36 20 1230010', 'reka.kovacs@example.hu', 'regular', 'Nickel', null],
  ['Petra', 'Leitner', '+43 664 1230011', 'petra.leitner@example.at', 'regular', null, null],
  ['Theresa', 'Berger', '+43 699 1230012', 'theresa.berger@example.at', 'vip', null, 'Laser-Paket gebucht.'],
  ['Clara', 'Fuchs', '+43 660 1230013', null, 'new', null, null],
  ['Nina', 'Eder', '+43 676 1230014', 'nina.eder@example.at', 'inactive', null, null],
];

// alte Seed-Zeilen entfernen (Termine, Notizen, interne Daten hängen per Cascade daran)
for (const [first, last] of LEGACY) {
  must(await db.from('customers').delete().eq('tenant_id', tenant.id).is('user_id', null).eq('first_name', first).eq('last_name', last), 'cleanup');
}

const viennaToUtc = (wall) => {
  const guess = Date.parse(`${wall}:00Z`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tenant.time_zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return new Date(guess - (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - guess)).toISOString();
};
const dayIso = (offset) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const HISTORY = ['Maniküre + Shellac', 'Pediküre Spa', 'Gesichtsbehandlung klassisch', 'Auffüllen + Lack', 'Wimpernlifting', 'Laser Achseln'];
let customers = 0;
let appts = 0;
for (const [i, [first, last, phone, email, seedStatus, allergies, notes]] of LEGACY.entries()) {
  // Status passend zu den Besuchen: Stammkundin (VIP) ab 4, Aktiv 3, Neu bis 2; Inaktive kamen vor über einem Jahr zuletzt
  const visits = 2 + (i % 3);
  const status = seedStatus === 'inactive' ? 'inactive' : visits >= 4 ? 'vip' : visits >= 3 ? 'regular' : 'new';
  const firstVisitDaysAgo = seedStatus === 'inactive' ? 420 : 20;
  const c = must(
    await db.from('customers').insert({ tenant_id: tenant.id, user_id: null, first_name: first, last_name: last, phone, email, language: last === 'Nagy' || last === 'Kovács' ? 'hu' : 'de', notify_email: !!email }).select('id').single(),
    `${first} ${last}`,
  );
  customers++;
  must(
    await db.from('customer_private').insert({
      customer_id: c.id,
      tenant_id: tenant.id,
      status,
      customer_since: dayIso(-400 - i * 23),
      preferred_staff_id: staff[i % staff.length].id,
      allergies,
      notes,
    }),
    'private',
  );
  // 2–4 vergangene Besuche, bei jeder dritten Kundin ein kommender Termin
  for (let v = 0; v < visits; v++) {
    const s = svc(HISTORY[(i + v) % HISTORY.length]);
    const m = staff[(i + v) % staff.length];
    const start = viennaToUtc(`${dayIso(-firstVisitDaysAgo - v * 41 - i * 3)}T${String(9 + ((i + v) % 8)).padStart(2, '0')}:00`);
    const { error } = await db.from('appointments').insert({
      tenant_id: tenant.id, customer_id: c.id, service_id: s.id, staff_id: m.id, service_name: s.name,
      category_key: s.service_categories.key, staff_name: m.display_name, starts_at: start,
      ends_at: new Date(Date.parse(start) + s.duration_minutes * 60_000).toISOString(),
      duration_minutes: s.duration_minutes, price_eur: s.price_eur, status: 'completed', payment: 'in_salon',
    });
    if (!error) appts++;
  }
  if (i % 3 === 1) {
    const s = svc(HISTORY[i % HISTORY.length]);
    for (let tryN = 0; tryN < 6; tryN++) {
      const m = staff[(i + tryN) % staff.length];
      const start = viennaToUtc(`${dayIso(5 + i + tryN)}T${String(10 + (tryN % 6)).padStart(2, '0')}:30`);
      const { error } = await db.from('appointments').insert({
        tenant_id: tenant.id, customer_id: c.id, service_id: s.id, staff_id: m.id, service_name: s.name,
        category_key: s.service_categories.key, staff_name: m.display_name, starts_at: start,
        ends_at: new Date(Date.parse(start) + s.duration_minutes * 60_000).toISOString(),
        duration_minutes: s.duration_minutes, price_eur: s.price_eur, status: 'confirmed', payment: 'in_salon',
      });
      if (!error) {
        appts++;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- Vorschlag für die Demo-Kundin (Portal-Konto ↔ Bestand)
const lenaPortal = must(await db.from('customers').select('id').eq('tenant_id', tenant.id).eq('email', 'lena.musterfrau@example.com').not('user_id', 'is', null).single(), 'Lena Portal');
const lenaLegacy = must(await db.from('customers').select('id').eq('tenant_id', tenant.id).is('user_id', null).eq('first_name', 'Lena').eq('last_name', 'Musterfrau').single(), 'Lena Bestand');
must(
  await db.from('link_suggestions').upsert(
    { tenant_id: tenant.id, portal_customer_id: lenaPortal.id, legacy_customer_id: lenaLegacy.id, matched_by: ['phone'], status: 'open' },
    { onConflict: 'portal_customer_id,legacy_customer_id' },
  ),
  'Vorschlag',
);

console.log(`CRM-Seed fertig: 3 Team-Zugänge, ${customers} Bestandskundinnen, ${appts} Termine, 1 offener Verknüpfungs-Vorschlag (Lena).`);
