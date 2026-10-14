# Supabase-Dashboard – Schritt für Schritt

Projekt: `cayqrguxnjlnofmkkokt` (https://supabase.com/dashboard/project/cayqrguxnjlnofmkkokt). Alles hier ist nur einmal nötig.

## 1. E-Mail-Vorlagen (6-stelliger Code statt Link)

1. **Authentication → Emails → Templates**.
2. Vorlage **Magic Link** öffnen:
   - Betreff: `Ihr Code für Hello Beauty · Your code · A kódod`
   - Inhalt: kompletten Text aus `supabase/templates/magic-link.html` einfügen → **Save**.
3. Vorlage **Confirm signup**: gleich vorgehen mit `supabase/templates/confirm-signup.html` (gleicher Betreff).
4. Prüfen: In beiden Vorlagen steht `{{ .Token }}`, nirgends `{{ .ConfirmationURL }}`.

Warum kein Link: Ein Link aus der Mail öffnet auf dem iPhone Safari, nicht die installierte App (getrennter Speicher) – die Kundin wäre dort nicht angemeldet.

## 2. Code-Einstellungen

**Authentication → Sign In / Providers → Email**:
- „Enable Email provider“: an. „Confirm email“: an.
- **Email OTP Length: 6**.
- **Email OTP Expiration: 600** Sekunden (10 Minuten).
- Speichern.

## 3. Resend als SMTP (sobald der Resend-Key da ist)

Ohne eigenes SMTP verschickt Supabase nur wenige Test-Mails und nur an Mitglieder des Projekt-Teams.

1. Bei Resend die Absender-Domain verifizieren ([PLATZHALTER: Absender-Domain, z. B. hellobeautysalon.at]) und einen API-Key anlegen (Berechtigung „Sending access“).
2. **Project Settings → Authentication → SMTP Settings → Enable Custom SMTP**:
   - Sender email: [PLATZHALTER: z. B. termine@hellobeautysalon.at]
   - Sender name: `Hello Beauty`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend`
   - Password: der Resend-API-Key (`re_…`) – derselbe Wert wie `RESEND_API_KEY` in `.env.local`.
3. Speichern und mit „Send test email“ prüfen.

## 4. Rate Limits

**Authentication → Rate Limits** (Werte erst nach Aktivierung von SMTP änderbar):
- „Rate limit for sending emails“: **30** pro Stunde (Salon-Betrieb; bei Bedarf erhöhen).
- „Rate limit for token verifications“: **30** pro 5 Minuten und IP (bremst Code-Raten).
- „Rate limit for sign ups and sign ins“: **30** pro 5 Minuten und IP.
- Unter **Sign In / Providers → Email**: Mindestabstand zwischen zwei Codes **60** Sekunden (Standard; die App zeigt den Countdown passend dazu).

Buchungen begrenzt zusätzlich die Datenbank selbst (5 pro Stunde, 10 pro Tag und Kundin; Spalten in `tenants`).

## 5. Site URL und Redirect URLs

**Authentication → URL Configuration**:
- Site URL: `http://localhost:3000` (lokal). Nach dem Livegang auf die Subdomain ändern: [PLATZHALTER: https://Subdomain].
- Redirect URLs (eine pro Zeile):
  - `http://localhost:3000/**`
  - `http://localhost:3200/**` (automatische Tests)
  - `https://hello-beauty-vienna-kundenportal*.vercel.app/**` ([PLATZHALTER: tatsächlicher Vercel-Projektname])
  - `https://[PLATZHALTER: Subdomain]/**`

Die App nutzt Codes statt Links, die Redirect URLs sind daher nur eine Absicherung.

## 6. Neue Domain freischalten (Tenant)

Sobald Subdomain oder Vercel-URL feststehen, den Eintrag in der Tabelle `tenant_domains` anpassen
(**Table Editor → tenant_domains**): `host` ohne `https://` und ohne Port, z. B. `app.hellobeautysalon.at`.
Ohne passenden Eintrag zeigt die App keinen Katalog – der Tenant wird immer aus der aufgerufenen Adresse bestimmt.

## 7. Nicht nötig / bitte nicht

- Den Secret Key nie in Browser-Code, Vercel-„Public“-Variablen oder Chat/Tickets kopieren.
- Keine Tabellen-Rechte im Dashboard „öffnen“ – geschrieben wird nur über die Datenbank-Funktionen.
