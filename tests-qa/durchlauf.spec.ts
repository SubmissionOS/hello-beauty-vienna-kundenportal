import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { admin } from '../tests/helpers';

/**
 * Abschlussprüfung – kompletter Durchlauf beider Apps je Gerät (Projekt) und Farbschema.
 * Jeder Schritt: Screenshot + automatische Befunde (Konsolenfehler, Seitenfehler, HTTP ≥ 400, horizontales Scrollen,
 * fehlende Übersetzungen). Fehler brechen den Durchlauf NICHT ab – sie landen als Befund in der JSON-Datei.
 * Ergebnis: qa/durchlauf-<RUN>/<projekt>/<schema>/*.png  und  qa/durchlauf-<RUN>/<projekt>-<schema>.json
 */
const RUN = process.env.QA_RUN ?? 'A';
const PORTAL = 'http://localhost:3200';
const CRM = 'http://localhost:3400';
const STAFF = { email: 'mitarbeiterin1.demo@example.com', password: process.env.TEAM_DEMO_PASSWORD_STAFF1 ?? '' };
const OWNER = { email: 'inhaberin.demo@example.com', password: process.env.TEAM_DEMO_PASSWORD_OWNER ?? '' };
const db = admin();

type Finding = { step: string; kind: string; detail: string; shot?: string };

class Run {
  findings: Finding[] = [];
  shots: { step: string; file: string }[] = [];
  n = 0;
  current = 'start';
  constructor(
    readonly dir: string,
    readonly info: TestInfo,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  watch(page: Page, label: string) {
    page.on('console', (m) => {
      if (m.type() === 'error' || /MISSING_MESSAGE|IntlError/.test(m.text())) this.findings.push({ step: this.current, kind: `console(${label})`, detail: m.text().slice(0, 400) });
    });
    page.on('pageerror', (e) => this.findings.push({ step: this.current, kind: `pageerror(${label})`, detail: String(e).slice(0, 400) }));
    page.on('response', (r) => {
      if (r.status() >= 400) this.findings.push({ step: this.current, kind: `http ${r.status()}(${label})`, detail: `${r.request().method()} ${r.url().replace(/\?.*$/, '')}` });
    });
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? '';
      if (!/ERR_ABORTED|cancelled|NS_BINDING_ABORTED/i.test(err)) this.findings.push({ step: this.current, kind: `requestfailed(${label})`, detail: `${r.url().replace(/\?.*$/, '')} ${err}` });
    });
  }

  async shot(page: Page, name: string) {
    this.current = name;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(250);
    const file = `${this.dir}/${String(++this.n).padStart(3, '0')}-${name}.png`;
    try {
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      this.shots.push({ step: name, file });
    } catch (e) {
      this.findings.push({ step: name, kind: 'screenshot', detail: String(e).slice(0, 200) });
    }
    try {
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const text = document.body?.innerText ?? '';
        // Rohe Übersetzungsschlüssel (next-intl-Fallback „namespace.key“) oder Platzhalter
        const raw = text.match(/\b(?:[a-z]+[A-Z]?[a-zA-Z]*\.){1,3}[a-z][a-zA-Z_]*(?:\.[a-zA-Z_]+)*\b/g)?.filter((s) => !/@|\.(at|com|de|hu|png|jpg|js|css|html)$|^www\./.test(s) && /^(app|auth|login|nav|topbar|calendar|booking|payments|customers|dashboard|requests|links|messages|waitlist|news|settings|errors|t|common)\./.test(s)) ?? [];
        return {
          overflow: de.scrollWidth > window.innerWidth + 1 ? `${de.scrollWidth}px > ${window.innerWidth}px` : '',
          raw: [...new Set(raw)].slice(0, 5).join(', '),
          placeholder: /\{[a-z]+\}|undefined|NaN|\[object Object\]/.test(text) ? (text.match(/.{0,30}(\{[a-z]+\}|undefined|NaN|\[object Object\]).{0,30}/)?.[0] ?? '') : '',
        };
      });
      if (m.overflow) this.findings.push({ step: name, kind: 'horizontal-scroll', detail: m.overflow, shot: file });
      if (m.raw) this.findings.push({ step: name, kind: 'raw-i18n-key', detail: m.raw, shot: file });
      if (m.placeholder) this.findings.push({ step: name, kind: 'placeholder-text', detail: m.placeholder, shot: file });
    } catch {
      /* Seite gerade in Navigation */
    }
  }

  async step(name: string, fn: () => Promise<void>) {
    this.current = name;
    try {
      await fn();
    } catch (e) {
      this.findings.push({ step: name, kind: 'step-failed', detail: String(e).split('\n').slice(0, 3).join(' ').slice(0, 400) });
    }
  }

  write(file: string) {
    writeFileSync(file, JSON.stringify({ run: RUN, project: this.info.project.name, shots: this.shots, findings: this.findings }, null, 2));
  }
}

function contextOptions(info: TestInfo, theme: 'light' | 'dark') {
  const u = info.project.use;
  return {
    viewport: u.viewport,
    userAgent: u.userAgent,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    deviceScaleFactor: u.deviceScaleFactor,
    locale: 'de-AT',
    timezoneId: 'Europe/Vienna',
    colorScheme: theme,
  };
}

async function newCtx(browser: Browser, info: TestInfo, theme: 'light' | 'dark', run: Run, label: string, standalone = false) {
  const context = await browser.newContext(contextOptions(info, theme));
  await context.addInitScript(
    ([t, sa]) => {
      try {
        localStorage.setItem('hb-theme', t as string);
        localStorage.setItem('hbv-theme', t as string);
      } catch {}
      if (sa) {
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q: string) =>
          q.includes('display-mode: standalone')
            ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
            : orig(q);
        Object.defineProperty(navigator, 'standalone', { get: () => true });
      }
    },
    [theme, standalone] as const,
  );
  if (info.project.use.browserName === 'webkit') {
    await context.addInitScript(() => {
      try {
        delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
      } catch {}
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  page.on('dialog', (d) => void d.accept());
  run.watch(page, label);
  return { context, page };
}

/**
 * Klick mit Rückfallebene: Der WebKit-Build von Playwright für Windows meldet manche Knöpfe nie als „stabil“
 * (auch wenn sie sichtbar und bedienbar sind). Dann wird der Klick direkt im DOM ausgelöst.
 */
async function click(target: import('@playwright/test').Locator) {
  try {
    await target.click({ timeout: 6000 });
  } catch (e) {
    if (!/stable|Timeout/i.test(String(e))) throw e;
    await target.evaluate((el) => (el as HTMLElement).click());
  }
}

async function crmLogin(page: Page, who: { email: string; password: string }) {
  await db.from('rate_limit_counters').delete().like('bucket', 'login-%');
  await page.goto(`${CRM}/login`);
  await page.getByLabel('E-Mail-Adresse').fill(who.email);
  await page.getByLabel('Passwort', { exact: true }).fill(who.password);
  await click(page.getByRole('button', { name: 'Anmelden', exact: true }));
  await page.waitForURL(`${CRM}/`, { timeout: 20_000 });
}

for (const theme of ['light', 'dark'] as const) {
  test(`Durchlauf ${RUN} – ${theme}`, async ({ browser }, info) => {
    const isPhone = (info.project.use.viewport?.width ?? 1440) < 500;
    const dir = `qa/durchlauf-${RUN}/${info.project.name}/${theme}`;
    const run = new Run(dir, info);
    const tag = `${info.project.name}-${theme}-${randomBytes(2).toString('hex')}`;
    const fresh = { email: `qa-${RUN.toLowerCase()}-${tag}@example.com`.toLowerCase(), password: `Qa-${randomBytes(9).toString('base64url')}` };
    const second = { email: `qa-${RUN.toLowerCase()}-zweite-${tag}@example.com`.toLowerCase(), password: `Qa-${randomBytes(9).toString('base64url')}` };
    const contexts: BrowserContext[] = [];

    try {
      // ================================================================ PORTAL – nicht angemeldet
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'portal-anon');
        contexts.push(context);
        await run.step('portal-anon', async () => {
          await page.goto(`${PORTAL}/`);
          await run.shot(page, 'portal-anon-start');
          await page.goto(`${PORTAL}/installieren`);
          await run.shot(page, 'portal-anon-installieren');
          await page.goto(`${PORTAL}/app/willkommen`);
          await run.shot(page, 'portal-anon-willkommen');
          await page.goto(`${PORTAL}/app/anmelden`);
          await run.shot(page, 'portal-anon-anmelden');
          await page.getByLabel('E-Mail').fill('niemand@example.com');
          await page.locator('#password').fill('falsches-passwort-1');
          await click(page.getByRole('button', { name: 'Anmelden', exact: true }));
          await page.locator('p.alert[role="alert"]').waitFor({ timeout: 8000 });
          await run.shot(page, 'portal-anon-anmelden-fehler');
          await page.goto(`${PORTAL}/app/registrieren`);
          await run.shot(page, 'portal-anon-registrieren');
          await click(page.getByRole('button', { name: 'Konto erstellen' }));
          await run.shot(page, 'portal-anon-registrieren-pflichtfelder');
          await page.goto(`${PORTAL}/app/passwort-vergessen`);
          await run.shot(page, 'portal-anon-passwort-vergessen');
          await page.goto(`${PORTAL}/offline`);
          await run.shot(page, 'portal-anon-offline');
          await page.goto(`${PORTAL}/app/termine`);
          await run.shot(page, 'portal-anon-geschuetzt-termine');
        });
      }

      // ================================================================ PORTAL – Demo-Kundin
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'portal-demo', isPhone);
        contexts.push(context);
        await run.step('portal-demo-login', async () => {
          await page.goto(`${PORTAL}/app/willkommen`);
          await click(page.getByRole('button', { name: 'Als Demo-Kundin ansehen' }));
          await page.waitForURL(/\/app$/, { timeout: 20_000 });
          await expect(page.getByRole('heading', { name: /Lena/ })).toBeVisible({ timeout: 15_000 });
          await run.shot(page, 'portal-demo-start');
        });
        await run.step('portal-demo-angebot', async () => {
          const banner = page.getByTestId('offer-banner');
          if (await banner.isVisible()) {
            await click(banner);
            await page.waitForURL(/\/app\/angebot\//);
            await run.shot(page, 'portal-demo-angebot');
          }
        });
        await run.step('portal-demo-termine', async () => {
          await page.goto(`${PORTAL}/app/termine`);
          await run.shot(page, 'portal-demo-termine-kommend');
          await click(page.getByRole('tab', { name: /Vergangen/ }));
          await run.shot(page, 'portal-demo-termine-vergangen');
        });
        await run.step('portal-demo-buchen', async () => {
          await page.goto(`${PORTAL}/app/buchen`);
          await run.shot(page, 'portal-demo-buchen-1');
          const first = page.getByRole('button').filter({ hasText: /Maniküre|Pediküre|Kosmetik|Laser|Nägel/ }).first();
          if (await first.isVisible()) {
            await click(first);
            await run.shot(page, 'portal-demo-buchen-2');
            const next = page.getByRole('button').filter({ hasText: /Maniküre|€/ }).first();
            if (await next.isVisible()) {
              await click(next);
              await run.shot(page, 'portal-demo-buchen-3');
            }
          }
        });
        await run.step('portal-demo-seiten', async () => {
          for (const [path, name] of [
            ['/app/neuigkeiten', 'neuigkeiten'],
            ['/app/nachrichten', 'nachrichten'],
            ['/app/warteliste', 'warteliste'],
            ['/app/push', 'mitteilungen'],
            ['/app/profil', 'profil'],
          ] as const) {
            await page.goto(`${PORTAL}${path}`);
            await run.shot(page, `portal-demo-${name}`);
          }
        });
        await run.step('portal-demo-sprachen', async () => {
          for (const lang of ['en', 'hu'] as const) {
            await page.evaluate((l) => localStorage.setItem('hb-lang', l), lang);
            for (const [path, name] of [
              ['/app', 'start'],
              ['/app/termine', 'termine'],
              ['/app/profil', 'profil'],
            ] as const) {
              await page.goto(`${PORTAL}${path}`);
              await run.shot(page, `portal-demo-${lang}-${name}`);
            }
          }
          await page.evaluate(() => localStorage.setItem('hb-lang', 'de'));
        });
        await run.step('portal-demo-abmelden', async () => {
          await page.goto(`${PORTAL}/app/profil`);
          await click(page.getByRole('button', { name: 'Abmelden' }));
          await page.waitForURL('**/app/willkommen', { timeout: 15_000 });
          await run.shot(page, 'portal-demo-abgemeldet');
        });
      }

      // ================================================================ PORTAL – neue Kundin (Registrierung) + zweite Kundin
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'portal-neu', isPhone);
        contexts.push(context);
        await run.step('portal-neu-registrierung', async () => {
          await page.goto(`${PORTAL}/app/registrieren`);
          await page.getByLabel('Vorname', { exact: true }).fill('Quinn');
          await page.getByLabel('Nachname', { exact: true }).fill(`Qualität${RUN}`);
          await page.getByLabel('E-Mail', { exact: true }).fill(fresh.email);
          await page.locator('#password').fill(fresh.password);
          await run.shot(page, 'portal-neu-registrieren-ausgefuellt');
          await click(page.getByRole('button', { name: 'Konto erstellen' }));
          await page.waitForURL(/\/app$/, { timeout: 20_000 });
          await run.shot(page, 'portal-neu-start-leer');
          await page.goto(`${PORTAL}/app/termine`);
          await run.shot(page, 'portal-neu-termine-leer');
          await page.goto(`${PORTAL}/app/nachrichten`);
          await run.shot(page, 'portal-neu-nachrichten-leer');
          await page.goto(`${PORTAL}/app/neuigkeiten`);
          await run.shot(page, 'portal-neu-neuigkeiten');
        });
      }
      {
        const u = await db.auth.admin.createUser({ email: second.email, password: second.password, email_confirm: true });
        if (u.error) run.findings.push({ step: 'zweite-kundin', kind: 'setup', detail: u.error.message });
        else {
          const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Origin: PORTAL } },
          });
          await c.auth.signInWithPassword(second);
          const r = await c.rpc('register_customer', { p_first_name: 'Zora', p_last_name: `Zweite${RUN}`, p_phone: null, p_language: 'de', p_marketing: false });
          if (r.error) run.findings.push({ step: 'zweite-kundin', kind: 'setup', detail: r.error.message });
        }
        const { context, page } = await newCtx(browser, info, theme, run, 'portal-zweite', isPhone);
        contexts.push(context);
        await run.step('portal-zweite-anmelden', async () => {
          await page.goto(`${PORTAL}/app/anmelden`);
          await page.getByLabel('E-Mail').fill(second.email);
          await page.locator('#password').fill(second.password);
          await click(page.getByRole('button', { name: 'Anmelden', exact: true }));
          await page.waitForURL(/\/app(\/.*)?$/, { timeout: 20_000 });
          await run.shot(page, 'portal-zweite-nach-anmeldung');
        });
      }

      // ================================================================ CRM – nicht angemeldet
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'crm-anon');
        contexts.push(context);
        await run.step('crm-anon', async () => {
          await db.from('rate_limit_counters').delete().like('bucket', 'login-%');
          await page.goto(`${CRM}/login`);
          await run.shot(page, 'crm-anon-login');
          await page.getByLabel('E-Mail-Adresse').fill(STAFF.email);
          await page.getByLabel('Passwort', { exact: true }).fill('falsch-falsch-falsch');
          await click(page.getByRole('button', { name: 'Passwort anzeigen' }));
          await click(page.getByRole('button', { name: 'Anmelden', exact: true }));
          await page.getByRole('alert').filter({ hasText: /Passwort/ }).waitFor({ timeout: 10_000 });
          await run.shot(page, 'crm-anon-login-fehler');
          await page.goto(`${CRM}/anfrage`);
          await run.shot(page, 'crm-anon-anfrage');
          await page.goto(`${CRM}/customers`);
          await run.shot(page, 'crm-anon-geschuetzt');
        });
      }

      // ================================================================ CRM – Mitarbeiterin
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'crm-staff');
        contexts.push(context);
        await run.step('crm-staff-login', async () => {
          await crmLogin(page, STAFF);
          await run.shot(page, 'crm-staff-dashboard');
        });
        await run.step('crm-staff-kalender', async () => {
          await page.goto(`${CRM}/calendar`);
          await run.shot(page, 'crm-staff-kalender-tag');
          await click(page.getByRole('button', { name: 'Neuer Termin' }).first());
          await page.getByRole('dialog').waitFor();
          await run.shot(page, 'crm-staff-kalender-neuer-termin');
          await click(page.getByRole('dialog').getByRole('button', { name: 'Termin anlegen' }));
          await run.shot(page, 'crm-staff-kalender-neuer-termin-pflichtfelder');
          await page.keyboard.press('Escape');
          await click(page.getByRole('button', { name: 'Woche', exact: true }));
          await run.shot(page, 'crm-staff-kalender-woche');
          for (let i = 0; i < 3; i++) {
            const appt = page.locator('button[aria-label]').filter({ hasText: /\d\d:\d\d/ }).first();
            if (await appt.isVisible()) {
              await click(appt);
              await page.getByRole('dialog').waitFor({ timeout: 5000 });
              await run.shot(page, 'crm-staff-kalender-termin-dialog');
              const move = page.getByRole('dialog').getByRole('button', { name: 'Verschieben…' });
              if (await move.isVisible()) {
                await click(move);
                await run.shot(page, 'crm-staff-kalender-termin-verschieben');
              }
              await page.keyboard.press('Escape');
              break;
            }
            await click(page.getByRole('button', { name: 'Nächste Woche' }));
          }
        });
        await run.step('crm-staff-kunden', async () => {
          await page.goto(`${CRM}/customers`);
          await run.shot(page, 'crm-staff-kunden');
          const lena = page.getByRole('link', { name: /Lena Musterfrau/ }).first();
          await click(lena);
          await page.waitForURL(/\/customers\/[0-9a-f-]{36}/);
          await run.shot(page, 'crm-staff-kundenakte');
          await click(page.getByRole('button', { name: 'Bearbeiten' }).first());
          await run.shot(page, 'crm-staff-kundenakte-bearbeiten');
          await page.keyboard.press('Escape');
          await page.goto(`${CRM}/customers/00000000-0000-0000-0000-000000000000`);
          await run.shot(page, 'crm-staff-kundenakte-unbekannt');
        });
        await run.step('crm-staff-bereiche', async () => {
          for (const [path, name] of [
            ['/verknuepfungen', 'verknuepfungen'],
            ['/nachrichten', 'nachrichten'],
            ['/warteliste', 'warteliste'],
            ['/neuigkeiten', 'neuigkeiten'],
            ['/payments', 'zahlungen'],
            ['/anfragen', 'anfragen'],
            ['/settings/services', 'einstellungen-leistungen'],
            ['/settings/staff', 'einstellungen-team'],
            ['/settings/general', 'einstellungen-allgemein'],
            ['/assistant', 'assistent-ohne-schluessel'],
            ['/gibt-es-nicht', 'seite-nicht-gefunden'],
          ] as const) {
            await page.goto(`${CRM}${path}`);
            await run.shot(page, `crm-staff-${name}`);
          }
        });
        await run.step('crm-staff-nachricht-oeffnen', async () => {
          await page.goto(`${CRM}/nachrichten`);
          const thread = page.locator('nav').getByRole('link').filter({ hasText: /Lena/ }).first();
          if (await thread.isVisible()) {
            await click(thread);
            await page.waitForURL(/\?k=/);
            await run.shot(page, 'crm-staff-nachrichten-unterhaltung');
          }
        });
        await run.step('crm-staff-formulare', async () => {
          await page.goto(`${CRM}/settings/services`);
          await click(page.getByRole('button', { name: 'Neue Leistung' }));
          await run.shot(page, 'crm-staff-leistung-neu');
          await page.goto(`${CRM}/neuigkeiten`);
          await page.getByLabel('Titel').fill('Vorschau-Test');
          await page.getByLabel('Text', { exact: true }).fill('So sieht die Vorschau aus.');
          await run.shot(page, 'crm-staff-neuigkeit-vorschau');
        });
        await run.step('crm-staff-sprachen', async () => {
          for (const lang of ['en', 'hu'] as const) {
            await context.addCookies([{ name: 'NEXT_LOCALE', value: lang, url: CRM }]);
            for (const [path, name] of [
              ['/', 'dashboard'],
              ['/calendar', 'kalender'],
              ['/verknuepfungen', 'verknuepfungen'],
              ['/settings/general', 'einstellungen'],
            ] as const) {
              await page.goto(`${CRM}${path}`);
              await run.shot(page, `crm-staff-${lang}-${name}`);
            }
          }
          await context.addCookies([{ name: 'NEXT_LOCALE', value: 'de', url: CRM }]);
        });
        await run.step('crm-staff-abmelden', async () => {
          await page.goto(`${CRM}/`);
          await click(page.getByRole('button', { name: 'Abmelden' }).first());
          await page.waitForURL(/\/login/, { timeout: 15_000 });
          await run.shot(page, 'crm-staff-abgemeldet');
        });
      }

      // ================================================================ CRM – Inhaberin
      {
        const { context, page } = await newCtx(browser, info, theme, run, 'crm-owner');
        contexts.push(context);
        await run.step('crm-owner', async () => {
          await crmLogin(page, OWNER);
          await run.shot(page, 'crm-owner-dashboard');
          await page.goto(`${CRM}/settings/general`);
          await run.shot(page, 'crm-owner-einstellungen-allgemein');
        });
      }
    } finally {
      for (const c of contexts) await c.close().catch(() => {});
      const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
      for (const u of data?.users ?? []) if (u.email === fresh.email || u.email === second.email) await db.auth.admin.deleteUser(u.id);
      run.write(`qa/durchlauf-${RUN}/${info.project.name}-${theme}.json`);
    }
  });
}
