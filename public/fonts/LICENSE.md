# Schriften

Einmalig am 2026-10-14 über die Google-Fonts-API heruntergeladen und lokal abgelegt. Beim Seitenaufruf wird kein Google-Server kontaktiert. Auswahl und Vergleich: `docs/design-upgrade.md`.

| Datei | Familie | Achsen / Gewichte | Zeichenumfang | Größe |
|---|---|---|---|---|
| gloock-latin.woff2 | Gloock (Display) | 400 | Latin (U+0000–00FF, Satzzeichen, €) | 26 KB |
| gloock-hu-extra.woff2 | Gloock | 400 | nur Ő ő Ű ű | 4 KB |
| hanken-grotesk-latin.woff2 | Hanken Grotesk (variabel, Text) | wght 300–700 | Latin | 35 KB |
| hanken-grotesk-hu-extra.woff2 | Hanken Grotesk | wght 300–700 | nur Ő ő Ű ű | 2 KB |

Die Ungarisch-Ergänzung wurde mit dem Google-Fonts-Parameter `text=` erzeugt und wird per `unicode-range: U+0150-0151, U+0170-0171, U+030B` nur geladen, wenn diese Zeichen auf der Seite vorkommen. Alle anderen ungarischen Zeichen (á é í ó ö ú ü) liegen im Latin-Subset. Glyphentest (ő ű in der Webfont gerendert, nicht im Fallback): `tests/typo.spec.ts`.

## Lizenz
- **Gloock** – Copyright 2022 The Gloock Project Authors (https://github.com/duartp/gloock). SIL Open Font License 1.1. Quelle: https://github.com/google/fonts/blob/main/ofl/gloock/OFL.txt
- **Hanken Grotesk** – Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk). SIL Open Font License 1.1. Quelle: https://github.com/google/fonts/blob/main/ofl/hankengrotesk/OFL.txt

Die OFL erlaubt Nutzung, Einbettung, Self-Hosting und Weitergabe (auch kommerziell und in öffentlichen Repositories), solange die Schriften nicht einzeln verkauft werden und Copyright-Hinweis und Lizenz beiliegen. Lizenztext: https://openfontlicense.org/open-font-license-official-text/
