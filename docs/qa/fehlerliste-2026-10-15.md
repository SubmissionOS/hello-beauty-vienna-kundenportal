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
| 42 | Portal | Demo-Kundin | Profil / Start | Buttons | einzeilig | „In den / Kalender“, „QR- / Code“ umgebrochen | C390/d/011, 022 | niedrig | behoben Portal 07d57b0 |
| 43 | Portal | Demo-Kundin | Termine | Anzahlung bei „Angefragt“ | verständlich | „Angefragt“ + „Jetzt bezahlen“, HU beide „FÜGGŐBEN“ | C390/d/013 | niedrig | behoben Portal 5ee4293 (HU-Begriff); Anzahlung vor Bestätigung ist so gewollt |
| 44 | Portal | alle | Neuigkeiten | Bild | passend | Wimpernlifting mit Gesichtsmasken-Foto | C1440/h/018 | niedrig | [PLATZHALTER]: echtes Wimpern-Foto vom Salon nötig (im Projekt nur 4 Kategorie-Fotos) |
| 45 | beide | Demo | Nachrichten | Zeitstempel | in Öffnungszeiten | Salon-Antwort 22:28 (Testlauf-Rest) | C1440/h/019 | niedrig | behoben Portal 5ee4293 (Demo-Seed) |
| 46 | Portal | anonym | Termine ohne Anmeldung | aufrufen | zur Anmeldung | landet auf Willkommen | C390/h/010 | niedrig | kein Fehler: geschützte Seiten führen bewusst zur Willkommen-Seite (Konto erstellen oder anmelden) |
| 47 | CRM | anonym | Login | laden | keine 404-Ressource | einmal „404“ in der Konsole ohne erfasste Antwort | C1440/h/036 | niedrig | in B prüfen |
