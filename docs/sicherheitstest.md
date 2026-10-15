# Sicherheitstest Supabase (RLS, Tenants, Doppelbuchung)

Lauf: 2026-10-15 05:58 UTC gegen das echte Projekt. Angriffe ausschließlich mit dem **Publishable Key** (wie ein Browser); Secret Key nur für Auf- und Abbau. Skript: `scripts/security-test.mjs` (`npm run test:security`).

Aufbau: Tenant A = `hello-beauty` (Host localhost), Tenant B = `sicherheitstest-b` (eigener Host), je 2 Kundinnen (a1, a2, b1, b2). Danach wurden Tenant B und alle Testkundinnen wieder gelöscht.

**Ergebnis: 41 von 41 Prüfungen bestanden.**

| Bereich | Prüfung | Ergebnis |
|---|---|---|
| Anonym | customers: keine Zeilen/kein Zugriff | bestanden |
| Anonym | appointments: keine Zeilen/kein Zugriff | bestanden |
| Anonym | my_appointments: kein Zugriff | bestanden |
| Anonym | tenant_domains unsichtbar | bestanden |
| Anonym | booking_attempts unsichtbar | bestanden |
| Anonym | staff: interne Spalte „code“ gesperrt | bestanden |
| Anonym | Katalog des eigenen Tenants lesbar (gewollt) | bestanden |
| Anonym | export_my_data verweigert | bestanden |
| Anonym | book_appointment verweigert | bestanden |
| Anonym | Insert in customers verweigert | bestanden |
| Anonym | unbekannter Host sieht keinen Katalog | bestanden |
| Anonym | Host B sieht nur Katalog B | bestanden |
| Buchen | a1 bucht freien Slot | bestanden |
| Doppelbuchung | a2 bucht denselben Slot → slot_taken | bestanden |
| Doppelbuchung | zwei gleichzeitige Anfragen → genau 1 Erfolg, 1 × slot_taken | bestanden (1 ok / 1 abgewiesen) |
| Doppelbuchung | direkter Insert überlappend → Exclusion-Constraint (23P01) | bestanden |
| A1 ↔ A2 | a1 sieht nur den eigenen Kundendatensatz | bestanden |
| A1 ↔ A2 | a1 sieht nur eigene Termine | bestanden |
| A1 ↔ A2 | a1 kann Termin von a2 nicht lesen | bestanden |
| A1 ↔ A2 | a1 kann Termin von a2 nicht absagen | bestanden |
| A1 ↔ A2 | a1 kann Termin von a2 nicht verschieben | bestanden |
| A1 ↔ A2 | Update auf fremden Kundendatensatz verweigert oder ohne Wirkung | bestanden |
| A1 ↔ A2 | Delete auf Termine verweigert | bestanden |
| A1 ↔ A2 | Insert in appointments verweigert | bestanden |
| A1 ↔ A2 | Datensatz a2 unverändert | bestanden |
| A ↔ B | a1 unter Host B: keine Kundendaten | bestanden |
| A ↔ B | a1 unter Host B: keine Termine | bestanden |
| A ↔ B | a1 unter Host B: Buchen verweigert (not_registered) | bestanden |
| A ↔ B | a1 unter Host B: Export verweigert | bestanden |
| A ↔ B | a1 bucht Leistung von B unter Host A → not_found | bestanden |
| A ↔ B | b1 bucht in B | bestanden |
| A ↔ B | a1 sieht Termin von b1 nicht | bestanden |
| A ↔ B | a1 kann Termin von b1 nicht absagen | bestanden |
| A ↔ B | b1 unter Host A: keine Kundendaten von A | bestanden |
| A ↔ B | b1 sieht nur Katalog B unter Host B | bestanden |
| B1 ↔ B2 | b2 sieht Termin von b1 nicht | bestanden |
| A ↔ B | Tenant per Parameter erzwingen unmöglich (Spalte tenant_id beim Insert verweigert) | bestanden |
| Rate-Limit | 2. Buchung erlaubt, 3. → rate_limited | bestanden |
| Löschen | nach request_account_deletion: eigener Datensatz gesperrt | bestanden |
| Löschen | nach request_account_deletion: Export verweigert | bestanden |
| Aufräumen | Tenant B und alle Testkundinnen gelöscht | bestanden |
