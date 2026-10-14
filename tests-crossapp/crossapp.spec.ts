import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { laptop, phone, UA } from '../tests/devices';
import { admin } from '../tests/helpers';

/**
 * Kundenportal + CRM gegen dieselbe Datenbank, beide im echten Browser:
 *   Registrierung → Verknüpfungs-Vorschlag → Bestätigen → Historie im Portal
 *   CRM-Termin → Portal · Chat in beide Richtungen · Absage im CRM → Wartelisten-Angebot → „Ja, buchen“ → CRM
 *   Neuigkeit im CRM → Portal · CRM-Login (angemeldet bleiben an/aus, Abmelden, Kundin ohne Zugang) · Rollen
 * Testdaten tragen ein Kürzel und werden am Ende gelöscht; die Demo-Daten bleiben unberührt.
 */
const PORTAL = 'http://localhost:3200';
const CRM = 'http://localhost:3400';
const tag = randomBytes(3).toString('hex');
const STAFF = { email: 'mitarbeiterin1.demo@example.com', password: process.env.TEAM_DEMO_PASSWORD_STAFF1 ?? '' };
const OWNER = { email: 'inhaberin.demo@example.com', password: process.env.TEAM_DEMO_PASSWORD_OWNER ?? '' };
const customer = {
  first: 'Kreuz',
  last: `Probe${tag}`,
  email: `crossapp-${tag}@example.com`,
  password: `Kp-${randomBytes(9).toString('base64url')}`,
  phone: `+43 660 ${String(Math.floor(Math.random() * 9e6) + 1e6)}`,
};
const storno = { first: 'Storno', last: `Probe${tag}` };

test.describe.configure({ mode: 'serial' });

const db = admin();
let tenantId = '';
let legacyId = '';
let stornoId = '';
let serviceId = '';
let serviceName = '';
const newsIds: string[] = [];
let portal: { context: BrowserContext; page: Page };
let crm: { context: BrowserContext; page: Page };

const wall = (iso: string) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)).replace(' ', 'T');

async function staffClient() {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword(STAFF);
  if (error) throw new Error(`Team-Login: ${error.message}`);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
}

async function freeSlot(fromIso: string, days = 30, service = serviceId) {
  const pub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Origin: PORTAL } },
  });
  for (let d = 0; d < days; d++) {
    const date = new Date(new Date(`${fromIso}T12:00:00Z`).getTime() + d * 86_400_000).toISOString().slice(0, 10);
    const { data } = await pub.rpc('available_slots', { p_service_id: service, p_staff_id: null, p_date: date });
    const slot = (data as { start: string; staff_id: string }[] | null)?.find((s) => {
      const h = Number(wall(s.start).slice(11, 13));
      return h >= 10 && h <= 15;
    });
    if (slot) return slot;
  }
  throw new Error(`kein freier Slot ab ${fromIso}`);
}

async function crmLogin(page: Page, who: { email: string; password: string }, remember = true) {
  await page.goto(`${CRM}/login`);
  await page.getByLabel('E-Mail-Adresse').fill(who.email);
  await page.getByLabel('Passwort', { exact: true }).fill(who.password);
  const box = page.getByRole('checkbox', { name: 'Angemeldet bleiben' });
  if ((await box.isChecked()) !== remember) await box.click();
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

async function newCrm(browser: Browser, who = STAFF) {
  const context = await browser.newContext({ ...laptop, locale: 'de-AT' });
  const page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await crmLogin(page, who);
  await page.waitForURL(`${CRM}/`);
  return { context, page };
}

test.beforeAll(async ({ browser }) => {
  expect(STAFF.password && OWNER.password, 'TEAM_DEMO_PASSWORD_* in .env.local').toBeTruthy();
  // Login-Rate-Limit des CRM (10 Versuche / 15 Min. je IP) – wiederholte Testläufe sollen sich nicht gegenseitig sperren
  await db.from('rate_limit_counters').delete().like('bucket', 'login-%');
  tenantId = (await db.from('tenants').select('id').eq('slug', 'hello-beauty').single()).data!.id;
  const svc = (await db.from('services').select('id, name').eq('tenant_id', tenantId).eq('active', true).order('sort_order').limit(1).single()).data!;
  serviceId = svc.id;
  serviceName = svc.name;
  const staff = await staffClient();

  // Bestandskundin (ohne Portal-Konto) mit einem Termin – die spätere Historie
  legacyId = (
    await db.from('customers').insert({ tenant_id: tenantId, user_id: null, first_name: customer.first, last_name: customer.last, phone: customer.phone, email: null }).select('id').single()
  ).data!.id;
  const today = new Date().toISOString().slice(0, 10);
  const s1 = await freeSlot(new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10));
  const b1 = await staff.rpc('staff_book_appointment', { p_customer: legacyId, p_service: serviceId, p_staff: s1.staff_id, p_start: wall(s1.start), p_note: null });
  expect(b1.error, b1.error?.message).toBeNull();

  // zweite Bestandskundin mit Termin nach dem Demo-Wartelisten-Zeitraum (endet 13.12.) – wird im CRM abgesagt
  stornoId = (
    await db.from('customers').insert({ tenant_id: tenantId, user_id: null, first_name: storno.first, last_name: storno.last, phone: null, email: null }).select('id').single()
  ).data!.id;
  void today;

  portal = { context: await browser.newContext({ ...phone(UA.iphone), locale: 'de-AT' }), page: undefined as unknown as Page };
  portal.page = await portal.context.newPage();
  crm = await newCrm(browser);
});

test.afterAll(async () => {
  await portal?.context.close();
  await crm?.context.close();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  const u = users?.users.find((x) => x.email === customer.email);
  if (u) await db.auth.admin.deleteUser(u.id);
  await db.from('customers').delete().in('id', [legacyId, stornoId].filter(Boolean));
  await db.from('customers').delete().eq('tenant_id', tenantId).eq('last_name', customer.last);
  if (newsIds.length) await db.from('news_posts').delete().in('id', newsIds);
  const left = (await db.from('customers').select('id').eq('tenant_id', tenantId).in('last_name', [customer.last, storno.last])).data ?? [];
  expect(left).toHaveLength(0);
});

test('Registrierung im Portal → Vorschlag im CRM → bestätigen → Historie im Portal', async () => {
  const p = portal.page;
  await p.goto(`${PORTAL}/app/registrieren`);
  await p.getByLabel('Vorname', { exact: true }).fill(customer.first);
  await p.getByLabel('Nachname', { exact: true }).fill(customer.last);
  await p.getByLabel('E-Mail', { exact: true }).fill(customer.email);
  await p.locator('#phone').fill(customer.phone);
  await p.locator('#password').fill(customer.password);
  await p.getByRole('button', { name: 'Konto erstellen' }).click();
  await p.waitForURL(/\/app$/);
  await expect(p.getByRole('heading', { name: /Kreuz/ })).toBeVisible();

  const c = crm.page;
  await c.goto(`${CRM}/verknuepfungen`);
  const row = c.locator('section', { hasText: 'Offene Vorschläge' }).getByRole('row', { name: new RegExp(customer.last) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Name + Telefon');
  await row.getByRole('button', { name: 'Vorschlag bestätigen' }).click();
  const done = c.locator('section', { hasText: 'Entschieden' }).getByRole('row', { name: new RegExp(customer.last) });
  await expect(done).toContainText('Verknüpft');

  await expect.poll(async () => (await db.from('customers').select('user_id').eq('id', legacyId).single()).data?.user_id).not.toBeNull();
  await p.goto(`${PORTAL}/app/termine`);
  await expect(p.getByRole('tab', { name: /Kommend \(1\)/ })).toBeVisible();
  await expect(p.getByText(serviceName).first()).toBeVisible();

  // Kundenakte im CRM: verbunden, Kundennummer sichtbar
  await c.goto(`${CRM}/customers/${legacyId}`);
  await expect(c.getByText('Verbunden', { exact: true })).toBeVisible();
  await expect(c.getByText('Kundennummer')).toBeVisible();
});

test('Termin im CRM anlegen → sofort im Portal', async () => {
  const slot = await freeSlot(new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10));
  const start = wall(slot.start);
  const staffName = (await db.from('staff').select('display_name').eq('id', slot.staff_id).single()).data!.display_name;
  const c = crm.page;
  await c.goto(`${CRM}/calendar?newDate=${start.slice(0, 10)}&newTime=${start.slice(11, 16)}`);
  const dialog = c.getByRole('dialog');
  await dialog.getByPlaceholder('Name oder Telefonnummer eingeben').fill(customer.last);
  await dialog.getByRole('option', { name: new RegExp(`${customer.first} ${customer.last}`) }).click();
  await dialog.getByLabel('Leistung').selectOption(serviceId);
  await dialog.getByLabel('Mitarbeiterin').selectOption({ label: staffName });
  await expect(dialog.getByLabel('Uhrzeit')).toHaveValue(start.slice(11, 16));
  await dialog.getByRole('button', { name: 'Termin anlegen' }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => (await db.from('appointments').select('id').eq('customer_id', legacyId).eq('starts_at', new Date(slot.start).toISOString())).data?.length ?? 0)
    .toBe(1);
  const p = portal.page;
  await p.goto(`${PORTAL}/app/termine`);
  await expect(p.getByRole('tab', { name: /Kommend \(2\)/ })).toBeVisible();
});

test('Chat: Kundin schreibt → CRM sieht ungelesen → Antwort → Portal', async () => {
  const p = portal.page;
  await p.goto(`${PORTAL}/app/nachrichten`);
  await p.getByLabel('Ihre Nachricht').fill(`Frage ${tag}`);
  await p.getByRole('button', { name: 'Senden' }).click();
  await expect(p.getByTestId('chat-list').getByText(`Frage ${tag}`)).toBeVisible();

  const c = crm.page;
  await c.goto(`${CRM}/nachrichten`);
  const thread = c.getByRole('link', { name: new RegExp(`${customer.first} ${customer.last}`) });
  await expect(thread).toBeVisible();
  await expect(thread).toContainText('1');
  await thread.click();
  await expect(c.getByText(`Frage ${tag}`)).toBeVisible();
  await c.getByLabel('Antwort').fill(`Antwort ${tag}`);
  await c.getByRole('button', { name: 'Senden' }).click();
  await expect(c.getByText(`Antwort ${tag}`)).toBeVisible();
  await expect
    .poll(async () => (await db.from('chat_messages').select('read_by_salon_at').eq('body', `Frage ${tag}`).single()).data?.read_by_salon_at)
    .not.toBeNull();

  await expect
    .poll(async () => (await db.from('chat_messages').select('sender, customer_id').eq('body', `Antwort ${tag}`).maybeSingle()).data)
    .toMatchObject({ sender: 'salon', customer_id: legacyId });
  await p.goto(`${PORTAL}/app/nachrichten`);
  await expect(p.getByText(`Antwort ${tag}`)).toBeVisible();
});

test('Absage im CRM → Wartelisten-Angebot im Portal → „Ja, buchen“ → Termin im CRM', async () => {
  const staff = await staffClient();
  // 20-Minuten-Leistung: Der Wartelisten-Wunsch der Demo-Kundin (längere Leistung) passt nicht in diesen Slot,
  // das Angebot geht also an die Testkundin – die Demo-Daten bleiben unberührt.
  const short = (await db.from('services').select('id').eq('tenant_id', tenantId).eq('active', true).eq('duration_minutes', 20).order('sort_order').limit(1).single()).data!.id;
  const slot = await freeSlot(new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10), 30, short);
  const start = wall(slot.start);
  const booked = await staff.rpc('staff_book_appointment', { p_customer: stornoId, p_service: short, p_staff: slot.staff_id, p_start: start, p_note: null });
  expect(booked.error, booked.error?.message).toBeNull();
  const entry = await db
    .from('waitlist_entries')
    .insert({
      tenant_id: tenantId,
      customer_id: legacyId,
      service_ids: [short],
      staff_id: null,
      date_from: start.slice(0, 10),
      date_to: start.slice(0, 10),
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      time_from: '08:00',
      time_to: '20:00',
      short_notice: true,
      status: 'active',
    })
    .select('id')
    .single();
  expect(entry.error, entry.error?.message).toBeNull();

  // CRM: Wochenansicht bis zum Termin blättern, Termin öffnen, absagen
  const c = crm.page;
  await c.goto(`${CRM}/calendar`);
  await c.getByRole('button', { name: 'Woche', exact: true }).click();
  const appt = c.getByRole('button', { name: new RegExp(`${storno.first} ${storno.last}`) });
  for (let i = 0; i < 12 && !(await appt.isVisible()); i++) await c.getByRole('button', { name: 'Nächste Woche' }).click();
  await appt.click();
  await c.getByRole('dialog').getByRole('button', { name: 'Absagen' }).click();
  await expect.poll(async () => (await db.from('appointments').select('status').eq('customer_id', stornoId).single()).data?.status).toBe('cancelled');
  await expect
    .poll(async () => (await db.from('waitlist_offers').select('status').eq('customer_id', legacyId).eq('status', 'offered')).data?.length ?? 0)
    .toBe(1);

  // Portal: Angebot ganz oben, annehmen
  const p = portal.page;
  await p.goto(`${PORTAL}/app`);
  const banner = p.getByTestId('offer-banner');
  await expect(banner).toBeVisible();
  await banner.click();
  await p.waitForURL(/\/app\/angebot\//);
  await p.getByRole('button', { name: 'Ja, buchen' }).click();
  await expect(p.getByRole('heading', { name: 'Gebucht!' })).toBeVisible();

  // CRM: Termin der Kundin im Kalender, Angebot als „Gebucht“ in der Warteliste
  await c.goto(`${CRM}/warteliste`);
  await expect(c.getByRole('row', { name: new RegExp(customer.last) }).first()).toContainText('Gebucht');
  await c.goto(`${CRM}/calendar`);
  await c.getByRole('button', { name: 'Woche', exact: true }).click();
  const mine = c.getByRole('button', { name: new RegExp(`${customer.first} ${customer.last}`) });
  for (let i = 0; i < 12 && (await mine.count()) < 1; i++) await c.getByRole('button', { name: 'Nächste Woche' }).click();
  // in der Woche des Termins: die Kundin hat dort genau den angenommenen Termin
  await expect(mine.first()).toBeVisible();
});

test('Neuigkeit im CRM veröffentlichen → im Portal sichtbar', async () => {
  const c = crm.page;
  await c.goto(`${CRM}/neuigkeiten`);
  await c.getByLabel('Titel').fill(`Crossapp ${tag}`);
  await c.getByLabel('Text', { exact: true }).fill('Neu bei Hello Beauty – Test aus dem CRM.');
  await expect(c.getByText(`Crossapp ${tag}`).first()).toBeVisible(); // Vorschau
  await c.getByRole('button', { name: 'Veröffentlichen' }).click();
  await expect(c.getByText('Veröffentlicht.', { exact: true })).toBeVisible();
  const row = (await db.from('news_posts').select('id, status').eq('title', `Crossapp ${tag}`).single()).data!;
  newsIds.push(row.id);
  expect(row.status).toBe('published');

  const p = portal.page;
  await p.goto(`${PORTAL}/app/neuigkeiten`);
  await expect(p.getByText(`Crossapp ${tag}`)).toBeVisible();
});

test('CRM-Login: angemeldet bleiben an/aus, Abmelden, Kundin ohne Zugang', async ({ browser }) => {
  const authCookie = (cookies: { name: string; expires: number }[]) => cookies.filter((x) => /^sb-.*-auth-token/.test(x.name));

  // aus → nur Sitzungs-Cookies (enden beim Schließen)
  const off = await browser.newContext({ ...laptop });
  const po = await off.newPage();
  await crmLogin(po, STAFF, false);
  await po.waitForURL(`${CRM}/`);
  const offCookies = authCookie(await off.cookies());
  expect(offCookies.length).toBeGreaterThan(0);
  expect(offCookies.every((x) => x.expires === -1)).toBe(true);
  await off.close();

  // an → dauerhafte Cookies; Abmelden führt zur Anmeldung, geschützte Seiten sind danach zu
  const on = await browser.newContext({ ...laptop });
  const pn = await on.newPage();
  await crmLogin(pn, STAFF, true);
  await pn.waitForURL(`${CRM}/`);
  expect(authCookie(await on.cookies()).every((x) => x.expires > Date.now() / 1000 + 86_400)).toBe(true);
  await pn.getByRole('banner').getByRole('button', { name: 'Abmelden' }).click();
  await pn.waitForURL(/\/login/);
  await pn.goto(`${CRM}/customers`);
  await expect(pn).toHaveURL(/\/login/);

  // Kundinnen-Konto des Portals hat im CRM keinen Zugang
  await crmLogin(pn, { email: customer.email, password: customer.password });
  await expect(pn.getByRole('alert').filter({ hasText: 'keinen Team-Zugang' })).toBeVisible();
  await expect(pn).toHaveURL(/\/login/);
  await on.close();
});

test('Rollen: nur die Inhaberin schaltet die automatische Verknüpfung', async ({ browser }) => {
  const c = crm.page;
  await c.goto(`${CRM}/settings/general`);
  await expect(c.getByRole('switch')).toBeDisabled();
  await expect(c.getByText('Nur die Inhaberin kann das ändern.')).toBeVisible();

  const owner = await newCrm(browser, OWNER);
  await owner.page.goto(`${CRM}/settings/general`);
  const sw = owner.page.getByRole('switch');
  await expect(sw).toBeEnabled();
  const before = (await db.from('app_settings').select('auto_link_verified').eq('tenant_id', tenantId).single()).data!.auto_link_verified;
  await sw.click();
  await expect.poll(async () => (await db.from('app_settings').select('auto_link_verified').eq('tenant_id', tenantId).single()).data!.auto_link_verified).toBe(!before);
  await sw.click();
  await expect.poll(async () => (await db.from('app_settings').select('auto_link_verified').eq('tenant_id', tenantId).single()).data!.auto_link_verified).toBe(before);
  await owner.context.close();
});
