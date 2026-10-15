# Fehlerliste Abschlussprüfung – Nachtschicht 15.10.2026

Durchlauf A: beide Apps lokal als Produktions-Build (Portal :3200, CRM :3400) gegen die gemeinsame Supabase-DB,
Playwright **sichtbar** (headed): Chromium 390 / 768 / 1440 px und WebKit „iPhone 15“ (390 px), je hell und dunkel.
Rollen: nicht angemeldet, Demo-Kundin, neue Kundin (Registrierung), zweite Kundin, Mitarbeiterin, Inhaberin; DE/EN/HU.
566 Screenshots, Auswertung automatisch (Konsole, HTTP ≥ 400, horizontales Scrollen, rohe Schlüssel) + Sichtprüfung
jedes Screenshots. Screenshots: `qa/durchlauf-A/<gerät>/<schema>/` (lokal, nicht im Repo).
Kürzel Gerät: C390/C768/C1440 = Chromium, WK = WebKit iPhone; h/d = hell/dunkel. Status: offen → behoben (Commit) / kein Fehler (Begründung).

| Nr | App | Rolle | Seite | Schritte | Erwartet | Tatsächlich | Screenshot | Schwere | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | CRM | Team | alle | bei 390 px öffnen | Handy-Ansicht, Navigation als Menü | Seite ~600 px breit, Seitenleiste fest 250 px; „Neuer Termin“, „Bearbeiten“, „Neue Leistung“ u. a. nicht erreichbar | C390/h/041-crm-staff-kalender-tag | blockierend | behoben CRM bc66590 |
| 2 | CRM | Team | alle | bei 768 px öffnen | kein Querscrollen, Inhalt nutzbar | Seite 775–791 px, Seitenleiste ausgeklappt; Tabellen abgeschnitten (Kunden, Zahlungen, Verknüpfungs-Aktionen), Kalender zeigt nur 2 MA / Mo–Mi, Chat ~150 px breit | C768/d/050, 061, 041 | hoch | behoben CRM bc66590 |
| 3 | CRM | Team | Einstellungen › Leistungen | öffnen (768 px) | Tabelle im Container | ganze Seite 1026 px breit, Preis abgeschnitten | C768/h/056 | hoch | behoben CRM bc66590 |
| 4 | CRM | Team | Zahlungen | öffnen (1440 px) | alle Spalten sichtbar | Spalte „Aktionen“ abgeschnitten („Beleg / Rechnun…“), Knöpfe ohne Funktion (nur Anzeige gewünscht) | C1440/h/054 | hoch | behoben CRM bc66590 |
| 5 | CRM | Team | Neuigkeiten | Formular bei 390 px | Felder nutzbar | Vorschau-Kasten liegt über „Art“/„Gültig bis“ | C390/h/047 | hoch | behoben CRM bc66590 |
| 6 | CRM | Team | 404 (unbekannte Seite/Akte, Assistent ohne Schlüssel) | aufrufen | deutsche, gestaltete 404 mit Weg zurück, Schema bleibt | Next-Standardseite englisch, springt auf hell, ohne Navigation; CSP blockiert ihre Inline-Styles | C1440/d/049, 059, 060 | hoch | behoben CRM bc66590 |
| 7 | CRM | Team | alle | WebKit lokal (http) | Seite lädt Skripte/Styles | CSP `upgrade-insecure-requests` erzwingt https auf localhost → „SSL connect error“, Login nicht möglich (nur lokal/HTTP) | WK/h/026ff | hoch | behoben CRM bc66590 |
| 8 | Portal | Demo-Kundin | Termine › Kommend | öffnen | nur echte kommende Termine, gleiche Zahl wie CRM | „Kommend (19)“ mit 8 abgesagten, 7× identisch „Laser Achseln 23.10.“, parallele Termine 26.–28.10. 15:00 (Reste automatischer Testläufe an der Demo-Kundin); abgesagte zählen mit und tragen Zahlungs-Chip | C1440/h/013 | hoch | behoben Portal 5ee4293 (Liste) + Demo-Seed neu eingespielt (Testreste) |
| 9 | Portal | zweite Kundin | Anmelden | Konto nur in Auth angelegt, anmelden | Startseite | „E-Mail oder Passwort stimmen nicht“ | C1440/h/035 | hoch | kein App-Fehler: Testaufbau legte nur ein Auth-Konto ohne Kundenprofil an; Durchlauf B registriert richtig |
| 10 | Portal | alle | Startseite / Installieren | bei 768 px | kein Querscrollen | 827 px breit, Android-Schritte ragen hinaus, iPhone-Spalte gequetscht | C768/h/001, 002 | hoch | behoben Portal 5ee4293 |
| 11 | Portal | Demo-Kundin | Login-Übergang | WebKit: Demo-Login | Startseite | WebKit (Playwright-Windows-Build) stürzt beim Seitenübergang ab; ohne View Transitions kein Absturz | WK/h/011 | hoch | kein App-Fehler nachweisbar: Absturz nur im Playwright-WebKit für Windows bei View Transitions (ohne sie fehlerfrei); echtes iPhone morgen testen |
| 12 | Portal | angemeldet | alle (1440 px) | öffnen | Navigation auf Inhaltsbreite | untere Tab-Leiste über volle 1440 px gestreckt | C1440/h/011 | mittel | behoben Portal 5ee4293 |
| 13 | CRM | Team | Dashboard / Zahlungen | öffnen | „Offene Zahlungen 13,50 €“ | „14 €“ (gerundet) | C1440/h/040 | mittel | behoben CRM bc66590 |
| 14 | beide | Demo-Kundin / Team | Warteliste | öffnen | echtes Eintragungsdatum | „1. Jänner“ / „01.01.26“ | C1440/h/020, 052 | mittel | behoben Portal 5ee4293 (Demo-Seed) |
| 15 | Portal | Demo-Kundin | Profil | öffnen | Werbe-Kanäle aus ohne Einwilligung; Mitteilungs-Schalter passend zu „Mitteilungen aufs Handy“ | „Rabatte & Aktionen“ E-Mail/Mitteilung an, Einwilligungen „Nicht erteilt“; Mitteilung an bei „Aus“ | C1440/h/022 | mittel | behoben Portal 5ee4293 |
| 16 | Portal | Demo-Kundin | HU-Texte | Sprache HU | förmliche Ansprache wie „Sie“ | durchgehend Du-Form | C1440/h/026–028 | mittel | behoben Portal 5ee4293 |
| 17 | Portal | Demo-Kundin | Angebot | öffnen (1440/390) | „Nein, danke“ sichtbar, Weg zurück | nur „Ja, buchen“ sichtbar, kein Zurück | C1440/h/012 | mittel | behoben Portal 5ee4293 (Zurück); „Nein, danke“ ist vorhanden – im Ganzseiten-Screenshot von der fixierten Tab-Leiste überdeckt (Aufnahme-Artefakt) |
| 18 | CRM | Team | Neuigkeiten | Liste | keine technischen Kennungen | „· seed:teil4“ bei jedem Beitrag | C1440/h/053 | mittel | behoben CRM bc66590 |
| 19 | CRM | Team/Inhaberin | Einstellungen, Login | lesen | zutreffende, nicht-technische Hinweise | „Technik (Supabase)“, „Datenbank“, widerspricht Login-Hinweis „legt die Inhaberin an“ | C1440/h/057, 058, 036 | mittel | behoben CRM bc66590 |
| 20 | CRM | Team | Kundenakte | Lena öffnen | „Kundin seit“ ≤ erster Besuch | „Kunde seit 14.10.2026“, Besuche ab 27.07.2026 | C1440/h/047 | mittel | behoben CRM bc66590 |
| 21 | CRM | Team | Kalender | öffnen | 09:00 lesbar, ein Scrollbereich | 09:00 halb unter dem Spaltenkopf, doppelte Scrollleisten | C1440/h/041 | mittel | behoben CRM bc66590 |
| 22 | CRM | Team | Verknüpfungen, Nachrichten | Links | Links im CRM-Design | Browser-Blau unterstrichen | C1440/d/050, 061 | mittel | behoben CRM bc66590 |
| 23 | CRM | Team | Kalender-Termin (reserviert) | Termin öffnen | Begründung | „keine Änderungen mehr möglich“ ohne Grund bei laufendem Wartelisten-Angebot | C1440/h/045 | niedrig | behoben CRM bc66590 |
| 24 | CRM | alle | Login, Formulare | Checkboxen | Akzentfarbe | Browser-Blau | C1440/h/036 | niedrig | behoben CRM bc66590 |
| 25 | CRM | Team | alle | Kopf | kein technischer Hinweis | Badge „Gemeinsame Datenbank mit dem Kundenportal“ | C1440/h/040 | niedrig | behoben CRM bc66590 |
| 26 | CRM | Team | Dashboard | Hinweise | neutrales Symbol bei „alles gut“ | Warndreieck bei „Keine Termine ohne Anzahlung“ | C1440/h/040 | niedrig | behoben CRM bc66590 |
| 27 | CRM | Team | alle | Kopf + Seitenleiste | ein Abmelden | „Abmelden“ doppelt; Konto-E-Mail abgeschnitten | C1440/h/040 | niedrig | behoben CRM bc66590 |
| 28 | CRM | Team | Warteliste, Nachrichten | Datumsangaben | einheitlich vierstellig | „15.10.26“; „egal wer“ | C1440/h/052 | niedrig | behoben CRM bc66590 |
| 29 | CRM | Team | Einstellungen › Mitarbeiterinnen | Tabelle | Zahl unter Überschrift | Kopf links, Wert rechts | C1440/h/057 | niedrig | behoben CRM bc66590 |
| 30 | CRM | Team (EN) | Dashboard | EN | idiomatisch | „Good day“ | C1440/h/064 | niedrig | behoben CRM bc66590 |
| 31 | CRM | Team | Dialoge | öffnen | Hintergrund abgedunkelt | ohne Abdunklung | C1440/d/042 | niedrig | kein Fehler: Abdunklung (35 %) vorhanden; Ganzseiten-Aufnahme bildet den Top-Layer-Hintergrund nicht ab – in B prüfen |
| 32 | CRM | Team | Nachrichten | leer | richtungsneutral | „Links eine Unterhaltung auswählen“ (bei 390 steht die Liste oben) | C390/d/045 | niedrig | behoben CRM bc66590 |
| 33 | CRM | Team | Login | Fehler | Umschalter zurückgesetzt, Button-Text zentriert | „Passwort verbergen“ bei leerem Feld; Text links | C390/d/037 | niedrig | behoben CRM bc66590 |
| 34 | CRM | Team | Kunden | Liste | „Neue Kundin“, keine Testreste | „Neuer Kunde“; QA-Konten „Quinn QualitätA“ während des Laufs sichtbar | C390/h/042 | niedrig | QA-Konten entfernt; Begriff „Kunde/Kundin“ im CRM-Altbestand: Entscheidung der Inhaberin [PLATZHALTER] |
| 35 | Portal | anonym | Registrieren | Sprachfeld | als Auswahl erkennbar | kein Pfeil | C1440/h/006 | niedrig | behoben Portal 5ee4293 |
| 36 | Portal | Demo-Kundin | Buchen Schritt 3 | Überschrift | vollständiger Satz | „Bei wem möchten Sie Ihren Termin?“ | C390/d/017 | niedrig | behoben Portal 5ee4293 |
| 37 | Portal | Demo-Kundin | Buchen (dunkel) | Liste | Hervorhebung sichtbar | Fokus-/Hover-Zeile in Seitenfarbe („Loch“) | C390/d/016 | niedrig | behoben Portal 5ee4293 |
| 38 | Portal | Demo-Kundin | Start | Begrüßung nachts | passend | „Guten Morgen“ um ~01:00 | C1440/d/011 | niedrig | behoben Portal 5ee4293 |
| 39 | Portal | anonym | Offline (dunkel) | öffnen | kein heller Fleck | Logo im weißen Quadrat | C1440/d/009 | niedrig | behoben Portal 5ee4293 |
| 40 | Portal | Demo-Kundin | Unterseiten (Nachrichten, Warteliste, Mitteilungen) | öffnen | Zurück-Weg | kein Zurück, kein aktiver Reiter | C390/h/019–021 | niedrig | behoben Portal 5ee4293 |
| 41 | Portal | Demo-Kundin | Mitteilungen vs. Warteliste | lesen | eine Regel | „wer zuerst tippt“ vs. „immer nur eine Person“ | C390/h/020, 021 | mittel | kein Fehler: zwei Wege – Warteliste (genau eine Person, FIFO) und Neuigkeit „Freier Termin“ (an alle, wer zuerst bucht) |
| 42 | Portal | Demo-Kundin | Profil / Start | Buttons | einzeilig | „In den / Kalender“, „QR- / Code“ umgebrochen | C390/d/011, 022 | niedrig | zurückgenommen (B2: Überlauf in EN bei 390 px) – Umbruch kurzer Knöpfe bleibt bewusst erlaubt, kein Abschneiden; „E‑Mail“ geschützt |
| 43 | Portal | Demo-Kundin | Termine | Anzahlung bei „Angefragt“ | verständlich | „Angefragt“ + „Jetzt bezahlen“, HU beide „FÜGGŐBEN“ | C390/d/013 | niedrig | behoben Portal 5ee4293 (HU-Begriff); Anzahlung vor Bestätigung ist so gewollt |
| 44 | Portal | alle | Neuigkeiten | Bild | passend | Wimpernlifting mit Gesichtsmasken-Foto | C1440/h/018 | niedrig | [PLATZHALTER]: echtes Wimpern-Foto vom Salon nötig (im Projekt nur 4 Kategorie-Fotos) |
| 45 | beide | Demo | Nachrichten | Zeitstempel | in Öffnungszeiten | Salon-Antwort 22:28 (Testlauf-Rest) | C1440/h/019 | niedrig | behoben Portal 5ee4293 (Demo-Seed) |
| 46 | Portal | anonym | Termine ohne Anmeldung | aufrufen | zur Anmeldung | landet auf Willkommen | C390/h/010 | niedrig | kein Fehler: geschützte Seiten führen bewusst zur Willkommen-Seite (Konto erstellen oder anmelden) |
| 47 | CRM | anonym | Login | laden | keine 404-Ressource | einmal „404“ in der Konsole ohne erfasste Antwort | C1440/h/036 | niedrig | in B prüfen |

## Durchlauf B1/B2 – neue Befunde

B1 (592 Screenshots, automatisch ausgewertet), B2 (592 Screenshots, automatisch + Sichtprüfung aller 8 Kombinationen).
Ordner: `qa/durchlauf-B1/`, `qa/durchlauf-B2/`.

| Nr | App | Rolle | Seite | Schritte | Erwartet | Tatsächlich | Screenshot | Schwere | Status |
|---|---|---|---|---|---|---|---|---|---|
| 48 | CRM | Team | Einstellungen › Leistungen | öffnen (768/390) | Seite so breit wie das Gerät | 826/766 px: sr-only-Text im Tabellenkopf entkam dem Scrollbereich | B1/C768/056 | mittel | behoben CRM 416d712 |
| 49 | CRM | anonym | Login | laden | keine 404 | Favicon fehlte (/favicon.ico → 404) | B2/C1440/h/032 | niedrig | behoben CRM e753f9b |
| 50 | CRM | Team | 404 im App-Rahmen | dunkel, unbekannte Akte | dunkles Schema bleibt | springt auf hell (Fehler-Hülle führt Theme-Script nicht aus) | B2/C1440/d/049 | mittel | behoben CRM 475ef9e |
| 51 | CRM | Team | Zahlungen, Verknüpfungen, Kunden, Warteliste | Tablet/Handy | Spalten sichtbar | Spalten (Status, Aktion, Letzter Besuch) im inneren Querscrollen versteckt | B2/C768/h/054, 050 | hoch | behoben CRM 475ef9e (Umbruch in Zellen) |
| 52 | CRM | Team | Zahlungen | Liste | Anzahlung 24.10. in der Liste | stand unsortiert am Ende | B2/C1440/h/054 | mittel | behoben CRM 475ef9e |
| 53 | CRM | Team | Kalender Woche | 768 px | sechs Tage sichtbar | nur Mo–Do | B2/C768/h/044 | niedrig | behoben CRM 475ef9e |
| 54 | CRM | Team | Formulare | WebKit/Handy | Auswahlfelder wie Textfelder | Safari-Standardoptik, Platzhalter abgeschnitten | B2/WK/h/043 | mittel | behoben CRM 475ef9e |
| 55 | CRM | Team | Texte | lesen | korrekt | gemischte Anführungszeichen, HU-Grammatik, „Strg + Enter“ am Handy, Hinweis Anzahlung missverständlich | B2/WK/h/053, 071, 061 | niedrig | behoben CRM 475ef9e |
| 56 | Portal | alle | alle (WebKit) | erster Besuch | kein Update-Hinweis | „Neue Version verfügbar“ beim ersten Besuch (Safari meldet gleiche Version als wartend) | B2/WK/h/001, 030 | mittel | behoben Portal e66f449 |
| 57 | Portal | Demo-Kundin | Mitteilungen | lesen | eine Regel | „wer zuerst tippt“ vs. Warteliste | B2/C1440/h/021 | mittel | behoben Portal e66f449 |
| 58 | Portal | anonym | Start (dunkel) | QR-Karte | lesbar | Adresse hellgrau auf Weiß | B2/C768/d/001 | niedrig | behoben Portal e66f449 |
| 59 | Portal | Demo-Kundin | Start (EN, 390) | öffnen | 390 px | 409 px – Folge von Nr. 42 (unumbrechbare Knöpfe) | B2/C390/h/023 | hoch | behoben Portal cda2177 (Nr. 42 zurückgenommen) |
| 60 | Portal/CRM | Demo | Neuigkeiten, Kundenstatus | Demo-Daten | plausibel | Veröffentlichung nachts, „Neu“ bei 3–4 Besuchen | B2/C1440/h/053, 046 | niedrig | behoben Portal e66f449 (Seeds neu eingespielt) |
| 61 | Portal | zweite Kundin | Anmelden | anmelden | Startseite | Aufnahme zu früh (Muster passte auch auf /app/anmelden) | B2/C768/h/035 | – | kein App-Fehler: QA-Werkzeug korrigiert |
| 62 | CRM | Team | EN-Datumsformat | EN | britisch | US-Format „October 15, 2026“ | B2/C1440/h/064 | niedrig | kein Fehler: CRM-Englisch ist US-Englisch (next-intl „en“); [PLATZHALTER] falls britisch gewünscht |
| 63 | CRM | Team | allgemeine 404 | unbekannte Adresse | wie App | ohne Kopfleiste | B2/C390/h/060 | niedrig | kein Fehler: liegt bewusst außerhalb des angemeldeten Bereichs, mit Link „Zum Dashboard“ |
| 64 | WebKit | – | CRM alle Seiten | sichtbar (headed) | keine CSP-Meldung | „Refused to apply a stylesheet“ (inline, Zeile 5) | B2/WK | – | kein App-Fehler: HTML enthält kein `<style>`, headless WebKit ohne Meldung – Hervorhebungs-Stil des Test-Treibers |

## Durchlauf B3 – neue Befunde

B3: 592 Screenshots, automatisch (Breite jetzt gegen die Gerätebreite) + Sichtprüfung aller 8 Kombinationen. Ordner `qa/durchlauf-B3/`.

| Nr | App | Rolle | Seite | Schritte | Erwartet | Tatsächlich | Screenshot | Schwere | Status |
|---|---|---|---|---|---|---|---|---|---|
| 65 | CRM | Team | 404 im App-Rahmen | dunkel | dunkel | weiter hell: React baut `<html>` bei der Fehler-Hülle neu auf und entfernt das Attribut | B3/C1440/d/049 | mittel | behoben CRM e32b507 (vorab im Browser geprüft: dunkel) |
| 66 | CRM | Team | Tabellen | Tablet | Umbruch an Wortgrenzen | Trennung mitten im Wort/Wert, Aktionsspalte zusammengedrückt (Folge von Nr. 51) | B3/C768/h/056, 047 | hoch | behoben CRM e32b507 |
| 67 | CRM | Team | Tabellen Verknüpfungen/Kunden/Leistungen | iPhone 390 | Aktionen und Spalten erreichbar | „Vorschlag bestätigen“ nur im inneren Querscrollen | B3/WK/h/050 | hoch | behoben CRM 67ab7ad (Karten-Ansicht am Handy; vorab geprüft) |
| 68 | CRM | Team | Zahlungen/Anfragen | Filter | wie Formularfelder | Safari-Stil | B3/WK/h/054 | niedrig | behoben CRM 5e85a40 |
| 69 | CRM | Demo | Kundenstatus | Liste | passend | „Stammkundin“ bei 2 Besuchen | B3/C1440/h/046 | niedrig | behoben Portal 1f9338a (Seed) |
| 70 | Portal | Demo | Profil HU (768) | laden | ohne Fehler | einmalig CORS/Netzwerkfehler zu Supabase, Seite trotzdem vollständig | B3/C768/h/028 | – | kein App-Fehler: einmaliger Netzaussetzer der Gegenstelle (1 von 592), App lud neu |
| 71 | Tests | – | Sicherheitstests | Lauf | grün | 2 Prüfungen auf alte Semantik (Fehlermeldung statt „ohne Wirkung“; Team-Zugriff per Host) | – | – | angepasst Portal 1f9338a – Schutzziel unverändert geprüft (41/41, 62/62, 80/80) |

## Durchlauf B4 – neue Befunde

B4: 592 Screenshots, automatisch 0 Befunde; Sichtprüfung aller 8 Kombinationen. Ordner `qa/durchlauf-B4/`.

| Nr | App | Rolle | Seite | Schritte | Erwartet | Tatsächlich | Screenshot | Schwere | Status |
|---|---|---|---|---|---|---|---|---|---|
| 72 | CRM | Team | Leistungen, Verknüpfungen, Kunden, Zahlungen | 768 px | Aktionen ohne Querscrollen | „Bearbeiten“/„Vorschlag bestätigen“ teils abgeschnitten | B4/C768/h/056, 050 | mittel | behoben CRM 182e9c2 (Karten bis 900 px) |
| 73 | CRM | Team | Karten (Akte, Team, Warteliste, Zahlungen) | 390 px | Werte beschriftet | teils ohne Beschriftung („20“, „Vor Ort“, Frist), Einheit doppelt, leeres „E‑Mail:“ | B4/C390/h/047, 057, 052 | mittel | behoben CRM 182e9c2 |
| 74 | CRM | Team | Zahlungen | Liste | Anzahlung als solche | „Bezahlt“, obwohl nur die Anzahlung bezahlt ist | B4/C1440/h/054 | niedrig | behoben CRM 182e9c2 |
| 75 | CRM | Team | 404, Nachrichten | Knöpfe | Knopfoptik | „Zum Dashboard“ unterstrichen; deaktiviertes „Senden“ unlesbar | B4/WK/h/049, 061 | niedrig | behoben CRM 182e9c2 |
| 76 | Portal | Demo | Start, Buchen (Touch) | tippen | keine hängende Hervorhebung | Hover-Stil bleibt nach dem Tippen | B4/WK/h/016 | niedrig | behoben Portal cef9d27 |
| 77 | Portal | Demo | Termine vergangen, Texte | lesen | Abstand, einheitliche Formate | „Erneut buchen“ ohne Abstand; Frist mit Jahr; „Egal“; EN „9 am – 7 pm“ | B4/WK/h/014, C768/h/023 | niedrig | behoben Portal cef9d27 |
