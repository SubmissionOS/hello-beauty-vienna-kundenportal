# Nachtschicht-Regeln (gelten für jede autonome Nachtschicht)

## Grundregeln
1. Keine Rückfragen. Fehlende Infos: sinnvolle Annahme treffen, im Bericht unter "Annahmen" notieren. Fehlende echte Daten (Telefon, Adresse, Preise, Zugänge) als [PLATZHALTER: …] sichtbar lassen, nichts erfinden.
2. Eigener Branch nacht/[thema]-[datum]. Kleine Commits je Abschnitt. KEIN Push, KEIN Deploy, kein --no-verify.
3. Kein Lorem Ipsum. Echte, zur Marke passende Texte in DE/EN/HU (Deutsch: "Sie", Ungarisch: duzen), kurz, ohne Floskeln.
4. Bilder: nur eigene Assets oder neutrale Platzhalter, keine fremden Fotos/Logos.
5. Recht ÖSTERREICH/EU (nicht deutsches Recht): Impressum nach ECG/MedienG, DSGVO, TKG 2021. Schriften lokal, keine Tracker, keine externen Requests ohne Grund, Cookie-Banner nur wenn technisch nötig.
6. Qualität: mobil zuerst (390 px), dann Tablet (768 px) und Desktop (1440 px). Kein horizontales Scrollen. Barrierearm (Kontraste, Alt-Texte, Fokus, Tastatur). Hell- und Dunkelmodus.
7. Sicherheit: Paketregeln (Websuche nach Kompromittierung + lokale Prüfung, Versionen ≥ 14 Tage, ignore-scripts, save-exact), Secrets nie ausgeben/loggen/committen, jede Kundin sieht nur ihre eigenen Daten.
8. Max. 3 Reparaturversuche pro Problem, dann zurückstellen, melden, weiter.
9. Nur in den freigegebenen Projektordnern arbeiten. Keine bezahlten Dienste, keine neuen Accounts.
10. Wenn fertig: aufhören, keine Zusatzfeatures.

## Abschlussprüfung (Pflicht, bevor irgendetwas nach main geht)
Code-Tests allein reichen NICHT. Es wird so getestet, wie ein echter Mensch die App benutzt.

### Durchlauf A – Alles anklicken
- Beide Apps (Kundenportal + CRM) lokal starten und in echten Browsern bedienen: Playwright im sichtbaren Modus mit Chromium UND WebKit (Safari-Verhalten, iPhone-Emulation 390 px).
- Jede Rolle einzeln:
  - nicht angemeldet
  - Kundin (Demo + frisch registriert)
  - zweite Kundin
  - Mitarbeiterin
  - Inhaberin
- Jede Seite, jeder Button, jeder Link, jedes Formular, jeder Schalter, jedes Menü, jeder Workflow Schritt für Schritt bis zum Ende.
- Auch app-übergreifend:
  - Registrierung → Vorschlag im CRM → bestätigen → Kundin sieht Historie
  - CRM-Termin → erscheint im Portal
  - Chat hin und zurück
  - Absage → Warteliste-Angebot → Ja/Nein/Ablauf
  - Neuigkeit anlegen → im Portal sichtbar
  - Abmelden/Anmelden/"Angemeldet bleiben"
  - Update-Hinweis
- Bei JEDEM Schritt Screenshot ansehen und prüfen:
  - Knopf oder Text abgeschnitten, aus dem Bild, über den Rand, überlappend, schlecht platziert
  - Knopf reagiert nicht oder macht das Falsche
  - Rechtschreib- oder Übersetzungsfehler, fehlende Übersetzung, falsche Anrede
  - Fehlermeldung, leerer Zustand, Ladezustand sinnvoll?
  - Browser-Konsole: Fehler/Warnungen
  - Netzwerk: 4xx/5xx-Antworten
  - Hell/Dunkel, 390/768/1440 px
  - Ergibt der Ablauf für eine Nagelstudio-Kundin bzw. eine Salon-Mitarbeiterin Sinn?
- Durchlauf A NICHT unterbrechen, um zu reparieren. Erst ALLES durchgehen.

### Fehlerliste
- Jeder Fund kommt in docs/qa/fehlerliste-[datum].md: Nr., App, Rolle, Seite, Schritte zum Nachstellen, erwartet vs. tatsächlich, Screenshot-Pfad, Schwere (blockiert/störend/kosmetisch).

### Reparatur
- Erst nach vollständigem Durchlauf A alle Fehler beheben, blockierende zuerst. Jeden Fix in der Liste abhaken (Commit-Hash).

### Durchlauf B – Komplett erneut testen
- Den GESAMTEN Durchlauf A noch einmal, nicht nur die reparierten Stellen. Ein Fix kann den Weg zu einem Fehler freimachen, der vorher nicht erreichbar war.
- Neue Funde wieder in die Liste → reparieren → erneut kompletter Durchlauf.
- Wiederholen, bis ein kompletter Durchlauf null neue Fehler findet (max. 4 Runden). Danach Code-Tests (typecheck, lint, build, Unit/E2E, Sicherheitstests) noch einmal komplett.

### Erst dann
- main aktualisieren (falls im Auftrag erlaubt).
- Im Bericht: Anzahl Runden, Fehler gefunden/behoben/offen (mit Nr.), Ordner der Screenshots.

## Bericht
docs/nachtschicht-[thema]-[datum].md, kurz:
- was fertig ist, Testergebnisse, QA-Runden + offene Fehler
- Annahmen, alle [PLATZHALTER]
- was ich morgens prüfen/liefern muss
- wie ich lokal starte
Zusätzlich vollständig im Chat ausgeben.
