# Nachtschicht Teil 4 – Bericht (Branch `nacht/teil4-2026-10-14`, nicht gepusht, nicht gemergt)

**Teil 3 fehlte komplett** (es lagen nur Teil 1, Teil 2 und der Design-Abgleich vor). Nachgezogen: Chat, Benachrichtigungs-Warteschlange, `/salon`, Profilbild, Werbe-Einwilligung pro Kanal.
**Was läuft:**
- **Konto:** Kundennummer `HB-XXXXXX` + QR. CRM-Verknüpfung nur auf Vorschlag, mit unveränderlichem Protokoll.
- **CRM-API** `/api/crm/v1`: HMAC, ±5 Min., Wiederholungsschutz, Tenant aus dem Schlüssel, Rate-Limit.
- **Warteliste mit Kaskade:** FIFO, genau eine Person, Reservierung unter der Doppelbuchungs-Sperre, Fenster Vorlauf/15 (3–60 Min.), Ablauf per pg_cron und beim Lesen, „Ja“ atomar.
- **Neuigkeiten-Tab** mit Zähler. **Web-Push** nach RFC 8291/8292 ohne Paket; Erlaubnis nur nach Erklär-Screen in der installierten App.
- **App:** Start mit Angebot oben und Countdown, .ics, Absagen/Verschieben mit Frist, „Erneut buchen“, Zahlungsstatus, Profil-Raster, Einwilligungen mit Zeitstempel, Export/Löschen v2, Leer-, Fehler- und Offline-Zustände, DE/EN/HU.
- **Zahlung:** Test-Zahlung + vorbereitetes Stripe Checkout, Webhook (Signatur, Idempotenz), Erstattung nach Frist, Verfall unbezahlter Reservierungen.
**Tests (alle grün):** Typecheck, Lint mit Tokens, Build + Secret-Scan · Playwright Mock 32/32, Supabase 35/35 (inkl. CRM-API, Webhook) · Sicherheit 41/41 und 62/62 · RFC-8291-Vektor exakt · Lighthouse gleichauf mit main (±3) · Screenshots 390 px hell/dunkel: `docs/screenshots/teil4-*`.
**Migrationen** (additiv; je Backup, Rückroll-Datei, main-Gegenprobe): `20261014200000`, `…210000`–`…210300`, `…220000` (Korrekturen: CRM-Suche, Salon-Absage voll erstattet, Demo-Funktion), `…230000`. Letzte Gegenprobe 20/20.
**Neue Variablen** (lokal mit `npm run env:ensure` erzeugt, ohne Ausgabe): Vercel öffentlich `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (später `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) · normal `VAPID_SUBJECT`, `NOTIFY_FROM_EMAIL` (später `STRIPE_CONNECT_ACCOUNT_ID`) · *Sensitive* `CRM_BRIDGE_SECRET`, `VAPID_PRIVATE_KEY`, `NOTIFY_WORKER_SECRET` (später `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
**Stripe:** Connect mit Standard-Konten statt Schlüssel pro Salon: ein Plattform-Geheimnis statt vieler, Geld und KYC direkt beim Salon, ein Webhook (`docs/stripe-setup.md`).
**Versand (§ 174 TKG):** In-App-Feed an alle (keine Zusendung). Push/E-Mail/SMS mit Rabatt oder Angebot nur mit Einwilligung für genau diesen Kanal. Wartelisten-Angebote ohne Werbe-Häkchen, weil von der Kundin selbst angefordert und nur an sie.
**Annahmen / [PLATZHALTER]:** Demo-Texte, Bilder, Laser-Anzahlung 30 %, SMS-Anbieter, Absender-Mail, AGB/Storno-Text, Stripe in der Datenschutzerklärung, echte Salon-Zugänge (`salon_members`).
**Vor dem Termin:** nichts nötig. main zeigt die Demo sauber (Lena: 5 Termine, keine Reservierungen). Teil 4 lokal auf dem Branch zeigen: `npm run dev`, Demo-Login, `/salon` → „Salon-Demo ansehen“.
**Main-Bug (Hotfix):** Die Registrierung landet selten auf „Willkommen“, ein Wettlauf in `toSession` (1 von 4 Gegenproben). Im Branch behoben (`createdFor`-Rückfall), beim Merge übernehmen.
**Nach dem Termin:** Worker `/api/notifications/process` minütlich aufrufen (pg_cron + pg_net oder Vercel Cron, `Authorization: Bearer NOTIFY_WORKER_SECRET`). Resend/SMTP, Stripe nach Anleitung, CRM nach `docs/crm-integration.md` (Prompt enthalten), Variablen auf Vercel.
**Zusammenführen:** `git checkout main && git merge --no-ff nacht/teil4-2026-10-14`. Konflikte: `src/lib/auth/*` Hotfix-Fassung + Rückfall in `toSession` · i18n Hotfix- und Teil-4-Blöcke behalten · `profil/page.tsx` Import aus `validate` · CSS, Icons, README beide Seiten · Tests main-Fassung + Teil-4-Anpassungen. Danach `npm run typecheck && npm run lint && npm test && npm run test:supabase && npm run db:seed:teil4`.
