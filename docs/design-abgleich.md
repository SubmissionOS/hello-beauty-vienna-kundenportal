# Design-Abgleich Website → Kundenportal

Quelle: Repo `hellobeautyvienna-website`, Stand `main` **1b37682** (14.10.2026, 18:14). Nur gelesen; Screenshots aus einer Kopie im Scratchpad.
Tokens, Schriften und Basis-Styles sind seit `3ebe1fd` unverändert (geprüft per `git diff`).
Alle Portal-Werte stehen in **`src/styles/tokens.css`** (Abschnitt 1 wortgleich von der Website).

## Bericht

**Angeglichen:** Das Portal übernimmt die Website-Tokens wortgleich (Farben, Schriftskala, Abstände, Radien, Schatten, Bewegung) und dieselben Schriftdateien. Es baut die Website-Bausteine nach: Pill-Buttons, Zellen-Gruppen mit eingerückten Trennlinien, Notice, Eyebrow, Segmented Control, Slot-Chip, Fortschrittsanzeige und Zusammenfassung der Buchung, Icons mit Strich 1,6 sowie das Preisformat „85 €“. Die Texte folgen der Website wortgleich, wo es Entsprechungen gibt („Welche Leistung möchten Sie?“, „Keine Präferenz – Alle freien Termine anzeigen“); Ungarisch ist wie auf der Website durchgehend in der Du-Form.

**Wo die Website selbst KI-typisch aussieht (nicht übernommen, bitte prüfen):**
- `src/components/Header.astro` (Z. 150–170): Glas-Effekt im Kopfbereich (`backdrop-filter: saturate(180%) blur(20px)`).
- `src/views/Booking.astro` (Z. 984–990): dieselbe Glas-Unschärfe an der Fußleiste der Buchung (mobil zusätzlich halbtransparent).
- Das Portal nutzt an beiden Stellen massive Flächen wie die Website-Aktionsleiste (`.bottom-bar`). Glas gibt es im Portal nur noch in der nachgebildeten iPhone-Oberfläche.

**Weitere Befunde an der Website (kein KI-Look, aber relevant):**
- `src/assets/fonts/LICENSE.md` verlinkt die SIL OFL nur, legt den Lizenztext aber nicht bei. Die OFL verlangt den Text bei den Schriften. Im Portal liegen jetzt `public/fonts/OFL-Gloock.txt` und `OFL-HankenGrotesk.txt` bei (offizielle Dateien aus `google/fonts`).
- Die Website hat keinen Dunkelmodus. Der Portal-Dunkelmodus ist nur aus Website-Farben abgeleitet (Ink-Fläche wie Footer/CTA-Band, Gold-Soft auf Ink 9,06:1).
- Anrede: DE „Sie“, HU „te“ (0 × „Ön“, 43 Du-Formen). Das Portal folgt dem 1:1.

## Tabelle Website → Portal

| Bereich | Website (Datei / Wert) | Portal |
|---|---|---|
| Farben Marke | `tokens.css`: `--c-gold #9e8832`, `--c-gold-text #7a6823`, `--c-gold-deep`, `--c-gold-soft`, `--c-accent` | identisch (`tokens.css` §1), Rollen `--primary`, `--link`, `--brand-line` |
| Flächen | `--c-paper` Seite, `--c-cream` Flächen, `--c-white` Zellen | `--bg` = paper, `--surface-soft` = cream, `--surface` = white |
| Text | `--c-ink`, `--c-ink-muted` | `--text`, `--text-muted` |
| Linien / Felder | `--c-line`, `--c-line-strong`, `--c-field` | identisch über `--line`, `--line-strong`, `--field` |
| Status | `--c-error(-bg)`, `--c-success(-bg)`, Notice-Linien `#e7b9b5`/`#b9d6bf` | identisch (`--error-line`, `--success-line`) |
| Dunkel | – (keiner) | aus Website-Farben abgeleitet: `--c-ink` Fläche, `--c-on-dark(-muted)` Text, `--c-gold-soft` Akzent |
| Schriften | Gloock 400 (Display), Hanken Grotesk 300–700 variabel; Latin + HU-Ergänzung; `font-display: swap`; Fallbacks mit Metrik-Anpassung | dieselben 4 woff2 (SHA-256 identisch), `src/styles/fonts.css` 1:1 inkl. „Gloock Fallback Times“ |
| Schriftskala | `--fs-h1` 34→68, `--fs-h2` 28→50, `--fs-h3`, `--fs-lead` 19→22, `--fs-body` 17, `--fs-small` 15, `--fs-xs` 13 | identisch; Ergänzungen nur aus Website-Literalen: `--fs-button` 1rem (.btn), `--fs-h4` 1.125rem (h4), `--fs-step` (Buchung .step h2), `--fs-input` (.input) |
| Zeilenhöhen / Laufweite | Body 1.6, h1 1.02 / −0.028em, h2 1.06 / −0.02em, Eyebrow 0.16em, Label 0.14em | identisch (`--lh-*`, `--ls-eyebrow`, `--ls-label`) |
| Abstände | `--s-1 … --s-9`, `--gutter` fluid | identisch |
| Radien | 8 / 12 / 16 / 24 / Pill | identisch; vorher Portal 22 px → jetzt 24 |
| Schatten | `--sh-1` Zellen, `--sh-2` Sheets, `--sh-3` | identisch; dunkel ohne Zellen-Schatten |
| Buttons | `.btn`: Pill, 50 px, 500, 1rem, 0.01em; `--secondary` transparent mit Feldrahmen; disabled Line/Ink-muted | übernommen (vorher 12-px-Ecken, 600) |
| Formulare | `.input`: 50 px, 12 px Radius, Feldrahmen, Fokus 3 px Gold-25 %, Fehler mit Fehlerfläche; Label 15 px/500 | übernommen; Code-Kästchen im selben Stil |
| Listen | `.cells`/`.cell`: Weiß, 12 px Radius, `--sh-1`, Trennlinie ab 16 px, `.cell__icon` 32 px Creme/Gold | `.group`/`.row`, `.row-icon`, `.row-chevron` (vorher Rahmen statt Schatten) |
| Hinweise | `.notice`: Creme, Linie, 15 px, Icon Gold | `.alert` übernommen |
| Abschnittstitel | `.eyebrow` (Gold, 600, 0.16em), `.summary__title` (muted, 500, 0.14em) | `.eyebrow`, `.section-title` übernommen |
| Segmented | Pill, Creme, weißer Indikator mit `--sh-1`, 44 px, 15 px/500 | übernommen (vorher 11 px Radius) |
| Buchung | Fortschritt „Schritt n von m“ rechts, 4-px-Balken Creme/Gold; `.svc-cat` Linie ohne Schatten; `.slot-chip` Pill; `.summary` Papier + Linie, Label über Wert; `.done__icon` 64 px | übernommen |
| Aktionsleiste | `.bottom-bar`: massiv `--c-paper`, Linie oben | Tab-Leiste genauso (vorher Glas-Unschärfe) |
| Header-Logo | `.brand__logo` 30 px hoch, ab 1024 px 38 px | Token `--logo-h` |
| Icons | `Icon.astro`: 24er Raster, Strich 1,6, runde Enden | dieselben Pfade (Telefon, Pin, Uhr, Kalender, Pfeile, Check, Info, Alert, Kopieren, Extern, Download, User, Refresh); fehlende Icons im selben Stil ergänzt; ✦-Zeichen entfernt |
| Preise | `euro()`: DE/HU „85 €“, EN „€85“ | `formatPrice` gleich (vorher „€ 85“) |
| Bildsprache | eigene Salonfotos, warm, nicht gefiltert | dieselben Fotos (vorab skaliert) |
| Bewegung | `--ease-out`, `--ease-sheet`, 150/220/320 ms, View Transitions 380 ms, reduzierte Bewegung = aus | identisch; kein Fade-in beim Scrollen |
| Texte | „Welche Leistung möchten Sie?“, „Bei wem möchten Sie Ihren Termin?“, „Keine Präferenz“/„Alle freien Termine anzeigen“, „Montag – Samstag 09:00 – 19:00“ | wortgleich (DE/EN/HU); Floskel „Gönnen Sie sich …“ ersetzt |

## Nachweise

- **Keine fest verdrahteten Werte:** `npm run check:tokens` (läuft in `npm run lint`) meldet *„Token-Prüfung OK: 74 Dateien, keine Farben/Schriftgrößen außerhalb src/styles/tokens.css“*. Geprüft werden Farb-Literale (#hex, rgb, hsl), feste `font-size`/`fontSize` und nicht definierte `var(--…)`.
- **Begründete Ausnahmen:** `src/app/manifest.ts` und `src/app/layout.tsx` (`theme-color`, Manifest-Farben) brauchen Literale, weil der Browser sie vor jedem CSS liest. Das Skript prüft, dass die Werte Website-Tokens entsprechen. Außerhalb von `src/` liegen außerdem die E-Mail-Vorlagen (E-Mail-Programme kennen keine CSS-Variablen), das Asset-Skript und die Testbilder.
- **Schriften:** SHA-256 der 4 woff2 identisch zur Website. OFL 1.1 erlaubt Nutzung, Einbettung und Weitergabe auch in Web-Apps (Bedingung: nicht einzeln verkaufen, Copyright und Lizenz beilegen – erfüllt).
- **Ungarisch:** `tests/typo.spec.ts` prüft über die Chrome-DevTools (gerenderte Schrift), dass ő ű Ő Ű in Gloock 400 und Hanken Grotesk 300/400/500/600/700 aus den Webfonts kommen und die HU-Ergänzungsdateien geladen werden. Bild: `docs/screenshots/design-abgleich/typo-hu-gewichte.png`.
- **KI-Look-Liste:** Keine Inter/Geist/Roboto/system-ui als Hauptschrift (system-ui nur im Handy-Mockup). Keine Verläufe außer Mockup-Hintergrund und Skeleton, kein Glow, Glas nur im Mockup, keine Emojis, kein Scroll-Fade-in, keine Verlaufstexte. Floskeln-Suche (DE/EN/HU): 1 Treffer, ersetzt.
- **Screenshots (390 px, hell + dunkel):** `docs/screenshots/design-abgleich/` – je Modus Website-Startseite neben `/installieren`, `/app`, `/app/buchen` sowie Website-Buchung neben Portal-Buchung (`tests/design.spec.ts`, `WEBSITE_URL=… npm test`).
- **Lighthouse mobil** (vorher → nachher): `/installieren` 95 → 95, `/installieren?p=ios` 99 → 100, `/app/willkommen` 95 → 100, `/app/registrieren` 99 → 100, `/qr` 96 → 100, `/offline` 100 → 100, `/app` 100 → 100, `/app/termine` 97 → 100, `/app/buchen` 100 → 100, `/app/profil` 97 → 100. Barrierefreiheit und Best Practices überall 100.
  - Dafür werden `supabase-js`, die Handy-Animationen und die QR-Bibliothek jetzt erst bei Bedarf geladen.
  - Der Kopf von `/installieren` wird in allen drei Sprachen vorgerendert.
