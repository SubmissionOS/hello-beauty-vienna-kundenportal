/**
 * Seed für Teil 4 (lokal, nie im Browser): Demo-Inhalte für die Vorführung – idempotent.
 *   - Zahlungsregel: Laser mit 30 % Anzahlung (Demo) [PLATZHALTER: echte Regeln legt der Salon fest]
 *   - Lena (Demo-Kundin): Warteliste, Chat, ein bezahlter Test-Termin; offenes Angebot + offene Test-Zahlung
 *     erzeugt svc_demo_refresh (läuft zusätzlich bei jedem Demo-Login → der Countdown läuft beim Öffnen)
 *   - 3 Neuigkeiten (Angebot, Neuigkeit, Termin frei) mit Bildern im Bucket news-images
 *   - Salon-Demo-Zugang salon.demo@example.com (Passwort = DEMO_CUSTOMER_PASSWORD, nie ausgegeben)
 * Läuft nach `npm run db:seed` (Teil 2) und ändert dessen Daten nicht – main bleibt lauffähig.
 * Aufruf: npm run db:seed:teil4
 */
import nextEnv from '@next/env';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const demoPassword = process.env.DEMO_CUSTOMER_PASSWORD;
if (!url || !secret || !demoPassword) {
  console.error('Fehlt in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY oder DEMO_CUSTOMER_PASSWORD');
  process.exit(1);
}
const DEMO_EMAIL = 'lena.musterfrau@example.com';
export const SALON_DEMO_EMAIL = 'salon.demo@example.com';
const SEED = 'seed:teil4';

const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();

const tenant = must(await db.from('tenants').select('id, time_zone').eq('slug', 'hello-beauty').single(), 'tenant');
const lena = must(await db.from('customers').select('id').eq('tenant_id', tenant.id).eq('email', DEMO_EMAIL).single(), 'Demo-Kundin');

// 1) Zahlungsregel für Laser (pro Leistung, damit andere Leistungen „vor Ort“ bleiben)
const laser = must(
  await db.from('services').select('id, name, duration_minutes, price_eur, service_categories!inner(key)').eq('tenant_id', tenant.id).eq('service_categories.key', 'laser'),
  'laser',
);
// Teilindex (service_id nicht null) → kein upsert möglich: ersetzen
must(await db.from('payment_rules').delete().eq('tenant_id', tenant.id).in('service_id', laser.map((s) => s.id)), 'payment_rules delete');
must(
  await db.from('payment_rules').insert(laser.map((s) => ({ tenant_id: tenant.id, service_id: s.id, mode: 'deposit_percent', value: 30 }))),
  'payment_rules',
);

// 2) Neuigkeiten mit Bildern (öffentlicher Bucket, Pfad <tenant>/…)
must(await db.from('news_posts').delete().eq('tenant_id', tenant.id).eq('created_by', SEED), 'news delete');
const upload = async (file) => {
  const path = `${tenant.id}/demo-${file}`;
  const body = readFileSync(`public/photos/${file}`);
  must(await db.storage.from('news-images').upload(path, body, { contentType: 'image/webp', upsert: true }), 'news image');
  return path;
};
const news = must(
  await db
    .from('news_posts')
    .insert([
      {
        tenant_id: tenant.id,
        kind: 'offer',
        title: 'Wimpernlifting −15 %',
        body: 'Im Herbst gibt es 15 % auf jedes Wimpernlifting. Einfach in der App buchen, der Rabatt wird im Salon abgezogen.',
        image_path: await upload('cosmetics.webp'),
        valid_until: inMinutes(14 * 24 * 60),
        status: 'published',
        published_at: inMinutes(-60),
        created_by: SEED,
      },
      {
        tenant_id: tenant.id,
        kind: 'news',
        title: 'Neue Shellac-Farben sind da',
        body: 'Zwölf neue Herbstfarben warten im Salon. Fragen Sie bei Ihrem nächsten Termin danach.',
        image_path: await upload('nails.webp'),
        status: 'published',
        published_at: inMinutes(-26 * 60),
        created_by: SEED,
      },
      {
        tenant_id: tenant.id,
        kind: 'free_slot',
        title: 'Termin frei: Pediküre',
        body: 'Bei Ivana ist kurzfristig ein Termin für Pediküre frei geworden. Jetzt in der App buchen.',
        valid_until: inMinutes(2 * 24 * 60),
        status: 'published',
        published_at: inMinutes(-3 * 24 * 60),
        created_by: SEED,
      },
    ])
    .select('id, kind'),
  'news',
);
const freeSlot = news.find((n) => n.kind === 'free_slot');
must(await db.from('news_reads').upsert({ tenant_id: tenant.id, customer_id: lena.id, news_id: freeSlot.id }, { onConflict: 'customer_id,news_id' }), 'news_reads');

// 3) Chat: Frage von Lena, ungelesene Antwort des Salons
must(await db.from('chat_messages').delete().eq('customer_id', lena.id), 'chat delete');
must(
  await db.from('chat_messages').insert([
    {
      tenant_id: tenant.id,
      customer_id: lena.id,
      sender: 'customer',
      body: 'Hallo! Haben Sie die Shellac-Farbe „Bordeaux“ wieder lagernd?',
      created_at: inMinutes(-26 * 60),
      read_by_salon_at: inMinutes(-25 * 60),
    },
    {
      tenant_id: tenant.id,
      customer_id: lena.id,
      sender: 'salon',
      sender_name: 'Petra',
      body: 'Hallo Lena, ja – seit heute wieder da. Wir legen sie Ihnen für den nächsten Termin bereit. Liebe Grüße, Petra',
      created_at: inMinutes(-90),
    },
  ]),
  'chat',
);

// 4) Warteliste: früh eingetragen (FIFO), Wimpernlifting, Mo–Sa, ganztags, auch kurzfristig
const lash = must(await db.from('services').select('id').eq('tenant_id', tenant.id).eq('name', 'Wimpernlifting').single(), 'Wimpernlifting');
must(await db.from('waitlist_offers').delete().eq('customer_id', lena.id).neq('status', 'accepted'), 'offers delete');
must(await db.from('waitlist_entries').delete().eq('customer_id', lena.id), 'entries delete');
const today = new Date().toISOString().slice(0, 10);
const until = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
must(
  await db.from('waitlist_entries').insert({
    tenant_id: tenant.id,
    customer_id: lena.id,
    service_ids: [lash.id],
    date_from: today,
    date_to: until,
    weekdays: [1, 2, 3, 4, 5, 6],
    time_from: '09:00',
    time_to: '19:00',
    short_notice: true,
    created_at: '2026-01-01T09:00:00Z',
  }),
  'waitlist',
);

// 5) Bezahlter Test-Termin (Laser mit Anzahlung) – freien Platz in 9–15 Tagen suchen
const paidSvc = laser.find((s) => s.name === 'Laser Achseln') ?? laser[0];
const staff = must(await db.from('staff').select('id, display_name').eq('tenant_id', tenant.id).eq('active', true).order('sort_order'), 'staff');
const oldPaid = must(await db.from('payments').select('appointment_id').eq('customer_id', lena.id).eq('status', 'paid').eq('provider', 'mock'), 'old paid');
for (const p of oldPaid) if (p.appointment_id) must(await db.from('appointments').delete().eq('id', p.appointment_id), 'old paid appt');
must(await db.from('payments').delete().eq('customer_id', lena.id).eq('provider', 'mock'), 'old payments');
let paidAppt = null;
outer: for (let d = 9; d <= 15; d++) {
  const day = new Date(Date.now() + d * 86_400_000);
  if (day.getUTCDay() === 0) continue;
  const date = day.toISOString().slice(0, 10);
  for (const m of staff) {
    // 12:00 Wiener Zeit (Sommer-/Winterzeit über Intl)
    const start = viennaToUtc(`${date}T12:00`);
    const end = new Date(Date.parse(start) + paidSvc.duration_minutes * 60_000).toISOString();
    const { data, error } = await db
      .from('appointments')
      .insert({
        tenant_id: tenant.id,
        customer_id: lena.id,
        service_id: paidSvc.id,
        staff_id: m.id,
        service_name: paidSvc.name,
        category_key: 'laser',
        staff_name: m.display_name,
        starts_at: start,
        ends_at: end,
        duration_minutes: paidSvc.duration_minutes,
        price_eur: paidSvc.price_eur,
        status: 'confirmed',
        payment: 'online_demo',
      })
      .select('id')
      .single();
    if (!error) {
      paidAppt = data.id;
      break outer;
    }
  }
}
if (!paidAppt) throw new Error('kein freier Platz für den bezahlten Test-Termin');
must(
  await db.from('payments').insert({
    tenant_id: tenant.id,
    appointment_id: paidAppt,
    customer_id: lena.id,
    amount_cents: Math.round(paidSvc.price_eur * 100 * 0.3),
    kind: 'deposit',
    status: 'paid',
    provider: 'mock',
    provider_ref: `mock_seed_${paidAppt}`,
    idempotency_key: `appt:${paidAppt}`,
    paid_at: new Date().toISOString(),
  }),
  'paid payment',
);

// 6) Frisches Angebot + offene Test-Zahlung
const refreshed = must(await db.rpc('svc_demo_refresh', { p_tenant: tenant.id, p_customer: lena.id }), 'svc_demo_refresh');

// 7) Salon-Demo-Zugang
const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
let salonUser = users.users.find((u) => u.email === SALON_DEMO_EMAIL);
if (!salonUser) {
  salonUser = must(
    await db.auth.admin.createUser({ email: SALON_DEMO_EMAIL, password: demoPassword, email_confirm: true, app_metadata: { demo: true, salon: true } }),
    'salon user',
  ).user;
} else {
  must(await db.auth.admin.updateUserById(salonUser.id, { password: demoPassword, app_metadata: { demo: true, salon: true } }), 'salon user update');
}
must(
  await db.from('salon_members').upsert({ tenant_id: tenant.id, user_id: salonUser.id, role: 'staff', display_name: 'Salon-Demo' }, { onConflict: 'tenant_id,user_id' }),
  'salon member',
);

console.log(
  `Teil-4-Seed fertig: ${laser.length} Zahlungsregeln, ${news.length} Neuigkeiten, Chat, Warteliste, bezahlter Termin, ` +
    `Angebot ${refreshed.offerId ? 'erzeugt' : 'FEHLT (kein freier Platz)'}, offene Zahlung ${refreshed.paymentAppointmentId ? 'erzeugt' : 'FEHLT'}, Salon-Demo-Zugang.`,
);

/** Wiener Wandzeit 'YYYY-MM-DDTHH:mm' → ISO in UTC */
function viennaToUtc(wall) {
  const guess = Date.parse(`${wall}:00Z`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asWall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asWall - guess)).toISOString();
}
