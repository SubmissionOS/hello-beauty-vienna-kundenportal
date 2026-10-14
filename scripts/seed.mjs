/**
 * Lokales Seed-Script (nie im Browser, nie auf Vercel): Tenant „hello-beauty“, Domains, Katalog aus Teil 1,
 * Öffnungszeiten, Demo-Kundin (Admin-API) mit Terminen relativ zu heute. Idempotent – erneut ausführen
 * frischt die Demo-Termine auf.
 * Aufruf: npm run db:seed   (liest NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_CUSTOMER_PASSWORD aus .env.local)
 */
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { categories, services, staff } from '../src/lib/data/mock/catalog.ts';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const demoPassword = process.env.DEMO_CUSTOMER_PASSWORD;
if (!url || !secret || !demoPassword) {
  console.error('Fehlt in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY oder DEMO_CUSTOMER_PASSWORD');
  process.exit(1);
}

export const DEMO_EMAIL = 'lena.musterfrau@example.com';
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// 1) Tenant + Domains
const tenant = must(
  await db.from('tenants').upsert({ slug: 'hello-beauty', name: 'Hello Beauty' }, { onConflict: 'slug' }).select().single(),
  'tenant',
);
must(
  await db.from('tenant_domains').upsert(
    [
      { tenant_id: tenant.id, host: 'localhost', note: 'lokale Entwicklung' },
      { tenant_id: tenant.id, host: '127.0.0.1', note: 'lokale Entwicklung' },
      {
        tenant_id: tenant.id,
        host: 'hello-beauty-vienna-kundenportal*.vercel.app',
        is_pattern: true,
        note: '[PLATZHALTER: Vercel-Projektname prüfen, sobald deployt]',
      },
      { tenant_id: tenant.id, host: 'subdomain.platzhalter.invalid', note: '[PLATZHALTER: Subdomain]' },
    ],
    { onConflict: 'host' },
  ),
  'domains',
);

// 2) Katalog (Demodaten aus Teil 1 = CRM)
const cats = must(
  await db
    .from('service_categories')
    .upsert(
      categories.map((c) => ({ tenant_id: tenant.id, key: c.id, sort_order: c.sortOrder, image_url: c.imageUrl })),
      { onConflict: 'tenant_id,key' },
    )
    .select(),
  'categories',
);
const catId = Object.fromEntries(cats.map((c) => [c.key, c.id]));
const svc = must(
  await db
    .from('services')
    .upsert(
      services.map((s, i) => ({
        tenant_id: tenant.id,
        code: s.id,
        category_id: catId[s.categoryId],
        name: s.name,
        name_i18n: s.nameI18n ?? {},
        duration_minutes: s.durationMinutes,
        price_eur: s.priceEur,
        sort_order: i,
      })),
      { onConflict: 'tenant_id,code' },
    )
    .select(),
  'services',
);
const stf = must(
  await db
    .from('staff')
    .upsert(
      staff.map((m, i) => ({ tenant_id: tenant.id, code: m.id, display_name: m.displayName, sort_order: i })),
      { onConflict: 'tenant_id,code' },
    )
    .select(),
  'staff',
);
const svcByCode = Object.fromEntries(svc.map((s) => [s.code, s]));
const stfByCode = Object.fromEntries(stf.map((m) => [m.code, m]));
must(
  await db.from('staff_services').upsert(
    staff.flatMap((m) =>
      services
        .filter((s) => m.categories.includes(s.categoryId))
        .map((s) => ({ tenant_id: tenant.id, staff_id: stfByCode[m.id].id, service_id: svcByCode[s.id].id })),
    ),
    { onConflict: 'staff_id,service_id' },
  ),
  'staff_services',
);
// Mo–Sa 09:00–19:00 (Website-Stammdaten)
must(
  await db
    .from('opening_hours')
    .upsert([1, 2, 3, 4, 5, 6].map((d) => ({ tenant_id: tenant.id, weekday: d, opens: '09:00', closes: '19:00' })), {
      onConflict: 'tenant_id,weekday',
    }),
  'opening_hours',
);

// 3) Demo-Kundin über die Admin-API
let demoUser = null;
for (let page = 1; !demoUser && page < 20; page++) {
  const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }), 'listUsers');
  demoUser = users.find((u) => u.email === DEMO_EMAIL) ?? null;
  if (users.length < 200) break;
}
if (demoUser) {
  must(
    await db.auth.admin.updateUserById(demoUser.id, { password: demoPassword, app_metadata: { demo: true } }),
    'demo update',
  );
} else {
  demoUser = must(
    await db.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: demoPassword,
      email_confirm: true,
      app_metadata: { demo: true },
      user_metadata: { language: 'de' },
    }),
    'demo create',
  ).user;
}
const customer = must(
  await db
    .from('customers')
    .upsert(
      {
        tenant_id: tenant.id,
        user_id: demoUser.id,
        first_name: 'Lena',
        last_name: 'Musterfrau',
        email: DEMO_EMAIL,
        phone: '+43 660 0000000',
        language: 'de',
        deletion_requested_at: null,
      },
      { onConflict: 'tenant_id,user_id' },
    )
    .select()
    .single(),
  'demo customer',
);

// 4) Demo-Termine relativ zu heute (Wandzeit Wien; Postgres wandelt '… Europe/Vienna' selbst um)
must(await db.from('appointments').delete().eq('customer_id', customer.id), 'demo cleanup');
const todayVienna = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const workday = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0 ? addDays(iso, 1) : iso);
const plusMinutes = (hhmm, m) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + m;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const plan = [
  [-80, '10:00', 's-15', 'st-petra'],
  [-46, '16:30', 's-03', 'st-ivana'],
  [-18, '11:00', 's-04', 'st-ivana'],
  [3, '14:30', 's-02', 'st-reka'],
  [24, '10:00', 's-07', 'st-petra'],
];
const rows = plan.map(([offset, time, code, staffCode]) => {
  const s = svcByCode[code];
  const m = stfByCode[staffCode];
  const day = workday(addDays(todayVienna, offset));
  return {
    tenant_id: tenant.id,
    customer_id: customer.id,
    service_id: s.id,
    staff_id: m.id,
    service_name: s.name,
    category_key: cats.find((c) => c.id === s.category_id).key,
    staff_name: m.display_name,
    starts_at: `${day} ${time}:00 Europe/Vienna`,
    ends_at: `${day} ${plusMinutes(time, s.duration_minutes)}:00 Europe/Vienna`,
    duration_minutes: s.duration_minutes,
    price_eur: s.price_eur,
    status: offset < 0 ? 'completed' : 'confirmed',
    payment: 'in_salon',
  };
});
must(await db.from('appointments').insert(rows), 'demo appointments');

console.log(
  `Seed OK: Tenant hello-beauty, ${svc.length} Leistungen, ${stf.length} Mitarbeiterinnen, Demo-Kundin mit ${rows.length} Terminen.`,
);
