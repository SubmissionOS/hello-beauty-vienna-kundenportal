# Sicherheits- und Funktionstest Teil 3/4 (Chat, Neuigkeiten, Push, Warteliste, Zahlungen)

Lauf: 2026-10-15 05:59 UTC gegen das echte Projekt. Angriffe mit dem **Publishable Key**; Secret Key/Management-API nur für Auf-/Abbau und um Zeitablauf zu simulieren. Skript: `scripts/security-test-teil4.mjs`.

**Ergebnis: 62 von 62 Prüfungen bestanden.** Die CRM-Schnittstelle (Signatur, Wiederholung, fremder Tenant) wird über HTTP in `tests/crm-api.spec.ts` geprüft.

| Bereich | Prüfung | Ergebnis |
|---|---|---|
| Kundennummer | Format HB-XXXXXX ohne 0/O/1/I | bestanden (HB-CLFJ7T) |
| Kundennummer | eindeutig im Tenant | bestanden |
| Chat | a2 sieht Chat von a1 nicht | bestanden |
| Chat | Salon-Team A sieht Chat von a1 | bestanden |
| Chat | Salon-Team A unter Host B: keine Chats von Tenant B | bestanden |
| Chat | Kundin kann nicht als Salon schreiben | bestanden |
| Chat | anon kann nichts lesen | bestanden |
| Chat | Salon antwortet → Push/E-Mail in der Warteschlange | bestanden |
| Chat | Kundin kann Warteschlange nicht lesen | bestanden |
| Einwilligung | Zeitstempel je Kanal | bestanden |
| Einwilligung | Historie fremder Kundin unsichtbar | bestanden |
| Neuigkeiten | Entwurf ist für Kundinnen unsichtbar | bestanden |
| Neuigkeiten | veröffentlicht: a1 sieht sie im Feed | bestanden |
| Neuigkeiten | Tenant B sieht sie nicht | bestanden |
| Neuigkeiten | Werbung nur mit Einwilligung (§ 174 TKG): a1 ohne → kein Versand | bestanden |
| Neuigkeiten | a2 mit E-Mail-Einwilligung → nur E-Mail | bestanden |
| Neuigkeiten | Kundin kann keine Neuigkeit anlegen | bestanden |
| Neuigkeiten | Salon A kann unter Host B nichts anlegen | bestanden |
| Neuigkeiten | Gelesen-Status senkt den Zähler | bestanden |
| Push | Kundin speichert Abo | bestanden |
| Push | fremde Kundin sieht das Abo nicht | bestanden |
| Push | Schlüssel des Abos nie lesbar (auch nicht für die Besitzerin) | bestanden |
| Push | fremde Kundin kann Abo nicht löschen | bestanden |
| Push | anon kann kein Abo anlegen | bestanden |
| Warteliste | Einträge fremder Kundinnen unsichtbar | bestanden |
| Warteliste | Absage → Angebot an genau EINE Person (FIFO: b2) | bestanden |
| Warteliste | Antwortfenster = Vorlauf/15, max. 60 Min. | bestanden (60.0 Min.) |
| Warteliste | Wartelisten-Angebot ohne Werbe-Einwilligung zugestellt (angefordert) | bestanden |
| Warteliste | normale Buchung während Reservierung scheitert | bestanden |
| Warteliste | reservierter Slot nicht als frei angeboten | bestanden |
| Warteliste | fremdes Angebot nicht annehmbar | bestanden |
| Warteliste | Kundin aus Tenant A sieht das Angebot nicht | bestanden |
| Warteliste | Nein → nächste Person (b3) | bestanden |
| Warteliste | Ablauf → beim Lesen sofort verarbeitet, nächste Person (b4) | bestanden |
| Warteliste | 2 parallele Ja-Klicks → genau eine Buchung | bestanden (1 gebucht / 1 abgewiesen) |
| Warteliste | Slot gehört jetzt b4, Reservierung aufgelöst | bestanden |
| Warteliste | Cron-Job für Ablauf aktiv | bestanden |
| Zahlung | Regel: 20 % Anzahlung von 40 € = 800 Cent | bestanden ({"mode":"deposit_percent","totalCents":4000,"holdMinutes":15,"dueOnlineCents":800}) |
| Zahlung | Buchung wartet auf Zahlung (pending + Reservierung) | bestanden |
| Zahlung | Slot während offener Zahlung gesperrt | bestanden |
| Zahlung | fremde Kundin sieht die Zahlung nicht | bestanden |
| Zahlung | Kundin kann keine Zahlung als bezahlt melden | bestanden |
| Zahlung | Webhook-Ereignis idempotent (2× → 1× verarbeitet) | bestanden |
| Zahlung | bezahlt → Termin bestätigt | bestanden |
| Zahlung | unbezahlte Reservierung verfällt → Slot frei | bestanden |
| Zahlung | Slot danach wieder buchbar | bestanden |
| Zahlung | rechtzeitige Absage → volle Erstattung vorgemerkt | bestanden |
| Zahlung | Kundin aus A sieht Zahlungen aus B nicht | bestanden |
| Zahlung | Cron-Job für Verfall aktiv | bestanden |
| Export | enthält Chat, Warteliste, Zahlungen, Einwilligungen, Push-Geräte | bestanden |
| Demo | svc_demo_refresh für Kundinnen gesperrt | bestanden |
| Demo | svc_demo_refresh für anon gesperrt | bestanden |
| CRM | svc_crm_search für Kundinnen gesperrt | bestanden |
| CRM | Textsuche liefert keine Telefon-Fehltreffer | bestanden (0 Treffer) |
| CRM | Suche nach Telefonnummer findet nur Tenant B | bestanden |
| CRM | Vorschlag per Telefon erst ab 6 Ziffern | bestanden |
| Zahlung | Kundin kann kurzfristig nicht selbst absagen | bestanden |
| Zahlung | Kundin kann nicht als Salon absagen | bestanden |
| Zahlung | Salon aus Tenant A kann Termin in B nicht absagen | bestanden |
| Zahlung | Salon B sagt kurzfristig ab | bestanden |
| Zahlung | Absage durch den Salon → immer volle Erstattung | bestanden ({"status":"refund_pending","refund_cents":800,"amount_cents":800}) |
| Aufräumen | Test-Tenant, Testkundinnen und Test-Neuigkeit gelöscht | bestanden |
