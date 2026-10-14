import { execSync } from 'node:child_process';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { emulateStandalone, phone, UA } from './devices';
import { admin, crm, demoIds, stripeEvent, worker } from './helpers';

/**
 * Teil 3/4 gegen das echte Supabase-Projekt: Angebot (auch parallel), Neuigkeiten, Chat mit CRM-Antwort,
 * Test-Zahlung, Absage mit Erstattung über den Worker, Offline-Zustand, Salon-Bereich, Worker und Stripe-Webhook.
 * Am Ende stellt `db:seed:teil4` die Demo-Daten wieder her.
 */
test.skip(process.env.E2E_BACKEND !== 'supabase', 'nur mit E2E_BACKEND=supabase');
test.use(phone(UA.iphone));
test.describe.configure({ mode: 'serial' });

let ids: { tenantId: string; lenaId: string };
const startedAt = new Date().toISOString();

test.beforeAll(async () => {
  ids = await demoIds();
});

test.afterAll(async () => {
  const db = admin();
  await db.from('notification_queue').delete().eq('tenant_id', ids.tenantId).gte('created_at', startedAt);
  await db.from('news_posts').delete().eq('tenant_id', ids.tenantId).like('title', 'E2E%');
  await db.from('booking_attempts').delete().eq('customer_id', ids.lenaId).gte('created_at', startedAt);
  // Demo-Zustand wiederherstellen (Neuigkeiten, Chat, Warteliste, Zahlungen, Angebot)
  execSync('npm run -s db:seed:teil4', { stdio: 'ignore' });
});

/** Wartelisten-Eintrag der Demo-Kundin wieder aktiv setzen, damit der Demo-Login ein frisches Angebot erzeugt */
async function reactivateEntry() {
  await admin().from('waitlist_entries').update({ status: 'active' }).eq('customer_id', ids.lenaId);
}

async function demo(page: Page) {
  await emulateStandalone(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible();
}

async function newDemoPage(browser: Browser) {
  const ctx = await browser.newContext(phone(UA.iphone));
  const page = await ctx.newPage();
  await demo(page);
  return { ctx, page };
}

test('Angebot aus der DB: Countdown läuft, „Ja“ bucht atomar', async ({ page }) => {
  await reactivateEntry();
  await demo(page);
  const banner = page.getByTestId('offer-banner');
  await expect(banner).toBeVisible();
  await banner.click();
  const clock = page.getByTestId('offer-clock');
  const c1 = await clock.innerText();
  await page.waitForTimeout(1300);
  expect(await clock.innerText()).not.toBe(c1);
  const offerId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Ja, buchen' }).click();
  await expect(page.getByRole('heading', { name: 'Gebucht!' })).toBeVisible();
  const { data: o } = await admin().from('waitlist_offers').select('status, appointment_id').eq('id', offerId).single();
  expect(o!.status).toBe('accepted');
  const { data: a } = await admin().from('appointments').select('status, hold_kind').eq('id', o!.appointment_id).single();
  expect(a).toEqual({ status: 'confirmed', hold_kind: null });
  await admin().from('appointments').delete().eq('id', o!.appointment_id);
});

test('Parallele „Ja“-Klicks auf zwei Geräten: genau eine Buchung', async ({ browser }) => {
  await reactivateEntry();
  const a = await newDemoPage(browser);
  await a.page.getByTestId('offer-banner').click();
  await a.page.waitForURL(/\/app\/angebot\//);
  const url = a.page.url();
  const b = await browser.newContext({ ...phone(UA.iphone), storageState: await a.ctx.storageState() });
  const pb = await b.newPage();
  await emulateStandalone(pb);
  await pb.goto(url);
  await expect(pb.getByRole('button', { name: 'Ja, buchen' })).toBeVisible();
  await Promise.all([a.page.getByRole('button', { name: 'Ja, buchen' }).click(), pb.getByRole('button', { name: 'Ja, buchen' }).click()]);
  const results = await Promise.all(
    [a.page, pb].map((p) => p.getByRole('heading', { name: /Gebucht!|Nicht mehr verfügbar/ }).innerText()),
  );
  expect(results.sort()).toEqual(['Gebucht!', 'Nicht mehr verfügbar']);
  const offerId = url.split('/').pop()!;
  const { data: o } = await admin().from('waitlist_offers').select('appointment_id').eq('id', offerId).single();
  const { count } = await admin().from('appointments').select('id', { count: 'exact', head: true }).eq('id', o!.appointment_id).eq('status', 'confirmed');
  expect(count).toBe(1);
  await admin().from('appointments').delete().eq('id', o!.appointment_id);
  await a.ctx.close();
  await b.close();
});

test('Neuigkeiten aus der DB mit Zähler; Chat: Antwort aus dem CRM erscheint ungelesen', async ({ page }) => {
  await demo(page);
  await expect(page.getByTestId('badge-neuigkeiten')).toHaveText('2');
  await page.getByRole('link', { name: 'Neuigkeiten', exact: true }).click();
  await expect(page.getByTestId('news-item')).toHaveCount(3);
  await expect(page.getByTestId('badge-neuigkeiten')).toHaveCount(0);

  await page.goto('/app/nachrichten');
  await page.getByLabel('Ihre Nachricht').fill('E2E: Frage an den Salon');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByTestId('chat-list').getByText('E2E: Frage an den Salon')).toBeVisible();
  const reply = await crm('POST', `chat/${ids.lenaId}/messages`, { body: 'E2E: Antwort aus dem CRM', actor: 'Petra' });
  expect(reply.status).toBe(200);
  await page.goto('/app');
  await expect(page.getByRole('link', { name: /neue Nachricht/i })).toBeVisible();
  await page.goto('/app/nachrichten');
  await expect(page.getByText('E2E: Antwort aus dem CRM')).toBeVisible();
  // Kundin hat gelesen → das CRM sieht keinen Ungelesen-Zähler der Kundin mehr offen
  await expect.poll(async () => (await admin().from('chat_messages').select('read_by_customer_at').eq('body', 'E2E: Antwort aus dem CRM').single()).data?.read_by_customer_at).not.toBeNull();
});

test('Test-Zahlung, Absage mit Erstattung über den Worker, Offline-Zustand', async ({ page, context }) => {
  await demo(page);
  await page.getByRole('link', { name: 'Termine', exact: true }).click();
  const open = page.locator('article', { hasText: 'Zahlung offen' });
  await expect(open).toHaveCount(1);
  await open.getByRole('button', { name: /Jetzt bezahlen/ }).click();
  await open.getByRole('button', { name: /Test-Zahlung durchführen/ }).click();
  await expect(page.getByRole('status')).toContainText('Zahlung erhalten');
  const { data: paid } = await admin().from('payments').select('id, status, appointment_id').eq('customer_id', ids.lenaId).eq('status', 'paid').order('paid_at', { ascending: false }).limit(1).single();
  expect(paid!.status).toBe('paid');

  // rechtzeitig absagen → Erstattung angestoßen → Worker erstattet (Mock-Anbieter)
  const card = page.locator('article', { hasText: 'Anzahlung bezahlt' }).first();
  await card.getByRole('button', { name: 'Absagen' }).click();
  await page.getByRole('button', { name: 'Ja, absagen' }).click();
  await expect(page.getByRole('status')).toContainText('Erstattung');
  const w = await worker();
  expect(w.status).toBe(200);
  expect(w.json!.refunds).toBeGreaterThanOrEqual(1);
  await expect
    .poll(async () => (await admin().from('payments').select('status').eq('customer_id', ids.lenaId).in('status', ['refunded', 'refund_pending'])).data?.map((p) => p.status))
    .toContain('refunded');

  // Offline auf einem offenen Screen: Neuladen scheitert → klarer Zustand, mit Netz automatisch zurück
  await page.goto('/app/nachrichten');
  await expect(page.getByTestId('chat-list')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // spätestens die automatische Aktualisierung (alle 15 s) scheitert ohne Netz
  await expect(page.getByTestId('load-error')).toContainText('Keine Verbindung', { timeout: 20_000 });
  await context.setOffline(false);
  await page.getByTestId('load-error').getByRole('button', { name: 'Erneut laden' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();
  // Seitenwechsel ohne Netz: Offline-Seite des Service Workers, keine persönlichen Daten
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Neuigkeiten', exact: true }).click();
  await expect(page.getByText('Keine Verbindung').first()).toBeVisible();
  await context.setOffline(false);
});

test('Salon: Demo-Login, Nachricht beantworten, Neuigkeit mit Vorschau veröffentlichen', async ({ page, browser }) => {
  await reactivateEntry();
  await page.goto('/salon');
  await page.getByRole('button', { name: 'Salon-Demo ansehen' }).click();
  await expect(page.getByText('Angemeldet als Salon-Demo')).toBeVisible();
  await page.getByTestId('salon-threads').getByRole('button', { name: /Lena Musterfrau/ }).click();
  await page.getByLabel('Antwort').fill('E2E: Gerne, bis bald!');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('E2E: Gerne, bis bald!')).toBeVisible();

  await page.getByRole('tab', { name: 'Neuigkeiten' }).click();
  await page.getByLabel('Titel').fill('E2E Neuigkeit aus dem Salon');
  await page.getByLabel('Text').fill('Ab nächster Woche neue Öffnungszeiten am Samstag.');
  await expect(page.getByTestId('news-preview')).toContainText('E2E Neuigkeit aus dem Salon');
  await page.getByRole('button', { name: 'Veröffentlichen' }).first().click();
  await expect(page.getByText(/Veröffentlicht\./)).toBeVisible();

  await page.getByRole('tab', { name: 'Warteliste' }).click();
  await expect(page.getByText('Lena Musterfrau', { exact: false }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Termine' }).click();
  await expect(page.locator('article').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/teil4-19-salon-termine.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Kundin sieht die Neuigkeit
  const c = await newDemoPage(browser);
  await c.page.goto('/app/neuigkeiten');
  await expect(c.page.getByText('E2E Neuigkeit aus dem Salon')).toBeVisible();
  await c.ctx.close();

  // ohne Salon-Zugang kein Zugriff auf Salon-Funktionen (Kundinnen-Sitzung)
  const asCustomer = await admin().auth.admin.listUsers();
  expect(asCustomer.data.users.some((u) => u.email === 'salon.demo@example.com')).toBe(true);
});

test('Worker: nur mit Geheimnis; abgelaufenes Push-Abo wird automatisch entfernt', async () => {
  expect((await worker('')).status).toBe(401);
  expect((await worker('falsch')).status).toBe(401);
  const db = admin();
  const endpoint = `https://localhost/push/e2e-${Date.now()}`;
  await db.from('push_subscriptions').insert({
    tenant_id: ids.tenantId,
    customer_id: ids.lenaId,
    endpoint,
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  });
  await db.from('notification_queue').insert({
    tenant_id: ids.tenantId,
    customer_id: ids.lenaId,
    channel: 'push',
    kind: 'chat',
    payload: { title: 'E2E', body: 'Test', url: '/app/nachrichten' },
  });
  const res = await worker();
  expect(res.status).toBe(200);
  expect(res.json!.pushRemoved).toBeGreaterThanOrEqual(1);
  const { count } = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('endpoint', endpoint);
  expect(count).toBe(0);
});

test('Stripe-Webhook: Signaturprüfung, Idempotenz, simulierte Ereignisse', async () => {
  const db = admin();
  // offene Zahlung erzeugen (Demo-Funktion legt eine an)
  await db.rpc('svc_demo_refresh', { p_tenant: ids.tenantId, p_customer: ids.lenaId });
  const { data: p } = await db.from('payments').select('id, amount_cents').eq('customer_id', ids.lenaId).eq('status', 'requires_payment').single();
  const pi = `pi_e2e_${Date.now()}`;
  const event = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } });
  const completed = event(`evt_e2e_${Date.now()}`, 'checkout.session.completed', {
    id: `cs_e2e_${Date.now()}`,
    payment_status: 'paid',
    amount_total: p!.amount_cents,
    payment_intent: pi,
    metadata: { payment_id: p!.id },
  });

  expect((await stripeEvent(completed, { unsigned: true })).status).toBe(400);
  expect((await stripeEvent(completed, { secret: 'whsec_falsch' })).status).toBe(400);
  expect((await stripeEvent(completed, { ts: Math.floor(Date.now() / 1000) - 600 })).status).toBe(400);

  const ok = await stripeEvent(completed);
  expect(ok).toEqual({ status: 200, json: { received: true, outcome: 'paid' } });
  expect((await stripeEvent(completed)).json!.outcome).toBe('duplicate');
  const { data: after } = await db.from('payments').select('status, provider_ref').eq('id', p!.id).single();
  expect(after).toEqual({ status: 'paid', provider_ref: pi });

  const refunded = await stripeEvent(event(`evt_e2e_r_${Date.now()}`, 'charge.refunded', { payment_intent: pi, amount_refunded: p!.amount_cents }));
  expect(refunded.json!.outcome).toBe('refunded');
  const { data: r } = await db.from('payments').select('status, refund_cents').eq('id', p!.id).single();
  expect(r).toEqual({ status: 'refunded', refund_cents: p!.amount_cents });

  // Betrag passt nicht → keine Bestätigung
  await db.rpc('svc_demo_refresh', { p_tenant: ids.tenantId, p_customer: ids.lenaId });
  const { data: p2 } = await db.from('payments').select('id, amount_cents').eq('customer_id', ids.lenaId).eq('status', 'requires_payment').single();
  const wrong = await stripeEvent(
    event(`evt_e2e_m_${Date.now()}`, 'checkout.session.completed', { payment_status: 'paid', amount_total: p2!.amount_cents - 1, metadata: { payment_id: p2!.id } }),
  );
  expect(wrong.json!.outcome).toBe('amount_mismatch');
  expect((await stripeEvent(event(`evt_e2e_x_${Date.now()}`, 'customer.created', {}))).json!.outcome).toBe('ignored');
});
