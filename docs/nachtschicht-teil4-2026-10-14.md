# Nachtschicht Teil 4 – Bericht (Branch `nacht/teil4-2026-10-14`, nicht gepusht, nicht gemergt)

**Teil 3 fehlte komplett** (nur Teil 1, Teil 2 und der Design-Abgleich lagen vor). Nachgezogen wurden Chat, Benachrichtigungs-Warteschlange, `/salon`, Profilbild und Werbe-Einwilligung pro Kanal, danach Teil 4.
**Was läuft:**
- **Konto:** Kundennummer `HB-XXXXXX` + QR. CRM-Verknüpfung nur auf Vorschlag, mit unveränderlichem Protokoll.
- **Schnittstelle** `/api/crm/v1` (HMAC, ±5 Min., Wiederholungsschutz, Tenant aus dem Schlüssel, Rate-Limit).
- **Warteliste mit Kaskade:** FIFO, genau eine Person; Reservierung unter der Doppelbuchungs-Sperre; Fenster Vorlauf/15 (3–60 Min.); Ablauf per pg_cron + beim Lesen; „Ja“ atomar.
- **Neuigkeiten:** Tab mit Zähler, Anlegen in `/salon` mit Vorschau und über das CRM.
- **Web-Push** nach RFC 8291/8292 ohne Paket, RFC-Testvektor exakt. Erlaubnis nur nach Erklär-Screen und nur in der installierten App.
- **App:** Start mit Angebot oben und Countdown, .ics, Absagen/Verschieben mit Frist, „Erneut buchen“, Zahlungsstatus. Profil mit Benachrichtigungs-Raster, Einwilligungen mit Zeitstempel, Export/Löschen v2. Leer-, Fehler- und Offline-Zustände in DE/EN/HU.
- **Zahlung:** Adapter mit Test-Zahlung und vorbereitetem Stripe Checkout. Webhook mit Signaturprüfung und Idempotenz, Erstattung nach Frist, Verfall unbezahlter Reservierungen.
**Tests (alle grün):**
- Typecheck, Lint mit Token-Prüfung, Build + Secret-Scan.
- Playwright Mock 32/32, Supabase 35/35 (inkl. CRM-API und Webhook).
- Sicherheitstests: Teil 2 41/41, Teil 3/4 62/62.
- Lighthouse gleichauf mit main (±3 Messrauschen).
- Screenshots 390 px hell/dunkel: `docs/screenshots/teil4-*`.
**Migrationen** (additiv, je mit Backup in `backups/`, Rückroll-Datei und main-Gegenprobe): `20261014200000`, `…210000`–`…210300`, `…220000` (Korrekturen: CRM-Suche, volle Erstattung bei Absage durch den Salon, Demo-Funktion), `…230000`. Die letzte Gegenprobe ist grün (20/20).
**Neue Variablen:** lokal mit `npm run env:ensure` erzeugt, ohne Ausgabe.
- Vercel öffentlich: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, später `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Vercel normal: `VAPID_SUBJECT`, `NOTIFY_FROM_EMAIL`, später `STRIPE_CONNECT_ACCOUNT_ID`.
- Vercel *Sensitive*: `CRM_BRIDGE_SECRET`, `VAPID_PRIVATE_KEY`, `NOTIFY_WORKER_SECRET`, später `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
**Stripe:** Connect mit Standard-Konten statt Schlüssel pro Salon. Begründung: ein Plattform-Geheimnis statt vieler, Geld und KYC direkt beim Salon, ein Webhook. Details in `docs/stripe-setup.md`.
**Versand (§ 174 TKG):**
- In-App-Feed an alle; das ist keine Zusendung.
- Push/E-Mail/SMS mit Rabatt oder Angebot nur mit Einwilligung für genau diesen Kanal.
- Wartelisten-Angebote ohne Werbe-Häkchen: Die Kundin hat sie selbst angefordert, und sie gehen nur an sie.
**Annahmen / [PLATZHALTER]:** Demo-Texte, Bilder und Laser-Anzahlung 30 %, SMS-Anbieter, Absender-Mail, AGB/Storno-Text, Stripe in der Datenschutzerklärung, echte Salon-Zugänge (`salon_members`).
**Vor dem Termin:** nichts nötig. main zeigt die Demo sauber (Lena: 5 Termine, keine Reservierungen). Teil 4 lokal auf dem Branch zeigen: `npm run dev`, Demo-Login, `/salon` → „Salon-Demo ansehen“.
**Main-Bug (Hotfix):** Registrierung landet in seltenen Fällen auf „Willkommen“, Wettlauf in `toSession`. In 1 von 4 Gegenproben aufgetreten. Behoben im Branch (`createdFor`-Rückfall), beim Merge übernehmen.
**Nach dem Termin:**
- Worker `/api/notifications/process` jede Minute aufrufen (pg_cron + pg_net oder Vercel Cron, Header `Authorization: Bearer NOTIFY_WORKER_SECRET`).
- Resend/SMTP einrichten, Stripe nach Anleitung, CRM nach `docs/crm-integration.md` (Prompt enthalten), Variablen auf Vercel setzen.
**Zusammenführen:**
1. `git checkout main && git merge --no-ff nacht/teil4-2026-10-14`.
2. Konflikte so lösen:
   - `src/lib/auth/*`: Hotfix-Fassung nehmen, Rückfall aus dem Branch in `toSession` übertragen.
   - `i18n de/en/hu`: Hotfix-Blöcke + Teil-4-Blöcke am Ende behalten.
   - `profil/page.tsx`: Import aus `validate` statt `code-step`.
   - `app.module.css`, `icons.tsx`, `README`: beide Seiten behalten.
   - `tests/app.spec.ts` und `supabase.spec.ts`: main-Fassung + Teil-4-Anpassungen.
3. `npm run typecheck && npm run lint && npm test && npm run test:supabase`, danach `npm run db:seed:teil4`.
