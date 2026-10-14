# Hello Beauty – Kundenportal (PWA)

Installierbare Web-App für Kundinnen von Hello Beauty, Wien. Kein App Store: QR-Code scannen → `/installieren` → App auf dem Home-Bildschirm.
Next.js 16 (App Router), TypeScript strict, DE/EN/HU, hell/dunkel. Teil 1: Oberfläche mit Mock-Daten; Teil 2: Supabase-Adapter.

## Starten

Node 22 (`.nvmrc`). Befehle identisch in PowerShell und macOS-Terminal:

```sh
npm ci                 # .npmrc: ignore-scripts, save-exact, Cooldown
npm run dev            # http://localhost:3000
```

Mit Demo-Button „Als Demo-Kundin ansehen“:

```sh
# PowerShell
$env:NEXT_PUBLIC_DEMO_MODE="true"; npm run dev
# macOS
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Seiten: `/installieren` (Ziel des QR-Codes), `/qr` (druckbar), `/app` (die App), `/offline`.
Vorführung am Laptop: `/installieren` im Desktop-Browser zeigt QR + iOS- und Android-Animation in Schleife.
Zum Testen anderer Geräte am Laptop: `/installieren?p=ios`, `?p=ios-legacy`, `?p=android`, `?p=inapp`, `?p=desktop`.

## Prüfen

```sh
npm run typecheck && npm run lint && npm run build
npx --no-install playwright install chromium   # einmalig
npm test                                       # baut, startet Port 3200, 18 Tests, Screenshots → docs/screenshots
npm run check:manifest -- http://localhost:3200
```

## Aufbau

- `src/lib/data` – `DataAdapter` (Schnittstelle) + `mock/` (localStorage, Demodaten aus dem CRM). Zugriff nur über `getData()`.
- `src/lib/auth` – `AuthAdapter` (6-stelliger E-Mail-Code, keine Magic Links) + Mock. Zugriff nur über `getAuth()`.
- `src/components/install` – Erkennung, Zeitleisten und gezeichnete iPhone-/Android-Mockups.
- `public/sw.js` – Service Worker: nur statische Dateien + Offline-Seite, nie Seiten oder Daten.
- `supabase/migrations` – leer, für Teil 2. Alle späteren Variablen: `.env.example`.

Bericht Teil 1: `docs/teil1-bericht.md`.
