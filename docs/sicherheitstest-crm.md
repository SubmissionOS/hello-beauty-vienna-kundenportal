# Sicherheitstest gemeinsame Datenbank (CRM + Kundenportal)

Lauf: 2026-10-15 05:59 UTC gegen das echte Projekt. Alle Prüfungen mit dem **Publishable Key** und echten Logins (Kundinnen a, b, m · Mitarbeiterin · Inhaberin · anonym). Secret Key nur für Auf- und Abbau. Skript: `scripts/security-test-crm.mjs` (`npm run test:security:crm`).

**Ergebnis: 80 von 80 Prüfungen bestanden.**

| Bereich | Prüfung | Ergebnis |
|---|---|---|
| Rollen | Mitarbeiterin wird als Team erkannt (staff) | bestanden |
| Rollen | Inhaberin wird als Team erkannt (owner) | bestanden |
| Rollen | Kundin ist kein Team (staff_me = null) | bestanden |
| Rollen | anonym: staff_me verweigert oder null | bestanden |
| Anonym | customers: keine Zeilen/kein Zugriff | bestanden |
| Anonym | customer_private: keine Zeilen/kein Zugriff | bestanden |
| Anonym | internal_notes: keine Zeilen/kein Zugriff | bestanden |
| Anonym | link_suggestions: keine Zeilen/kein Zugriff | bestanden |
| Anonym | app_settings: keine Zeilen/kein Zugriff | bestanden |
| Anonym | booking_requests: keine Zeilen/kein Zugriff | bestanden |
| Anonym | salon_members: keine Zeilen/kein Zugriff | bestanden |
| Anonym | chat_messages: keine Zeilen/kein Zugriff | bestanden |
| Anonym | waitlist_entries: keine Zeilen/kein Zugriff | bestanden |
| Anonym | waitlist_offers: keine Zeilen/kein Zugriff | bestanden |
| Anonym | payments: keine Zeilen/kein Zugriff | bestanden |
| Anonym | crm_audit_log: keine Zeilen/kein Zugriff | bestanden |
| Anonym | staff_appointments: keine Zeilen/kein Zugriff | bestanden |
| Anonym | staff_customer_stats: keine Zeilen/kein Zugriff | bestanden |
| Anonym | staff_team verweigert | bestanden |
| Anonym | staff_book_appointment verweigert | bestanden |
| Kundin | customer_private: keine Zeilen/kein Zugriff | bestanden |
| Kundin | internal_notes: keine Zeilen/kein Zugriff | bestanden |
| Kundin | link_suggestions: keine Zeilen/kein Zugriff | bestanden |
| Kundin | app_settings: keine Zeilen/kein Zugriff | bestanden |
| Kundin | booking_requests: keine Zeilen/kein Zugriff | bestanden |
| Kundin | salon_members: keine Zeilen/kein Zugriff | bestanden |
| Kundin | crm_audit_log: keine Zeilen/kein Zugriff | bestanden |
| Kundin | staff_appointments: keine Zeilen/kein Zugriff | bestanden |
| Kundin | staff_customer_stats: keine Zeilen/kein Zugriff | bestanden |
| Kundin | sieht nur den eigenen Kundendatensatz (keine Bestandskundinnen) | bestanden |
| Kundin | Bestandskundin direkt abfragen → 0 Zeilen | bestanden |
| Kundin | staff_team liefert keine Team-Daten | bestanden |
| Kundin | staff_book_appointment → forbidden | bestanden |
| Kundin | staff_send_chat → forbidden | bestanden |
| Kundin | staff_news_save → forbidden | bestanden |
| Kundin | staff_unlink_portal → forbidden | bestanden |
| Kundin | staff_offer_free_slot → forbidden | bestanden |
| Kundin | app_settings ändern → keine Wirkung | bestanden |
| Kundin | interne Notiz anlegen verweigert | bestanden |
| A ↔ B | b sieht die Nachricht von a nicht | bestanden |
| A ↔ B | b sieht a nicht in customers | bestanden |
| Team | Mitarbeiterin sieht Kundin a und b | bestanden |
| Team | Mitarbeiterin sieht Bestandskundin | bestanden |
| Team | Mitarbeiterin sieht Chat von a | bestanden |
| Team | Ansicht staff_appointments liefert Zeilen | bestanden |
| Team ohne Origin | Leistungen mit Kategorie (Join) sichtbar | bestanden |
| Team ohne Origin | staff_hours lesbar (ohne Fehler) | bestanden |
| Team ohne Origin | staff sichtbar | bestanden |
| Team ohne Origin | staff_services sichtbar | bestanden |
| Team ohne Origin | opening_hours sichtbar | bestanden |
| Team ohne Origin | customers sichtbar | bestanden |
| Team ohne Origin | staff_appointments sichtbar | bestanden |
| Kundin ohne Origin | keine Team-Katalogrechte (staff_services leer) | bestanden |
| Team | interne Notiz anlegen erlaubt | bestanden |
| Kundin | a sieht die interne Notiz über sich nicht | bestanden |
| Team | Antwort im Chat senden | bestanden |
| Kundin | a sieht die Antwort des Salons | bestanden |
| Rollen | Mitarbeiterin kann auto_link_verified NICHT ändern | bestanden |
| Rollen | Inhaberin kann auto_link_verified ändern | bestanden |
| Verknüpfen | Team bucht Termin für Bestandskundin | bestanden |
| Verknüpfen | Registrierung mit gleichem Namen + Telefon → Vorschlag | bestanden |
| Verknüpfen | ohne Bestätigung keine automatische Verknüpfung | bestanden |
| Verknüpfen | Kundin kann Vorschlag nicht bestätigen | bestanden |
| Verknüpfen | anonym kann Vorschlag nicht bestätigen | bestanden |
| Verknüpfen | Team bestätigt → zusammengeführt | bestanden |
| Verknüpfen | Kundin ist jetzt die Bestandsakte (gleiche Kundennummer) | bestanden |
| Verknüpfen | Kundin sieht die Historie der Bestandsakte | bestanden |
| Verknüpfen | Zusammenführung ist protokolliert | bestanden |
| Verknüpfen | Vorschlag bleibt als „bestätigt“ sichtbar | bestanden |
| Trennen | Kundin kann sich nicht selbst trennen | bestanden |
| Trennen | Team trennt | bestanden |
| Trennen | Kundin hat wieder eine eigene, neue Akte | bestanden |
| Trennen | Historie bleibt bei der Bestandsakte | bestanden |
| Trennen | Trennung ist protokolliert | bestanden |
| Trennen | Vorschlag steht danach auf „getrennt“ | bestanden |
| Doppelbuchung | Portal + CRM gleichzeitig → genau 1 Buchung, 1 × slot_taken | bestanden (1 ok / 1 abgewiesen) |
| Doppelbuchung | in der DB genau ein aktiver Termin für den Slot | bestanden (1 gefunden) |
| Gemeinsam | CRM-Termin sofort für die Kundin sichtbar | bestanden |
| Gemeinsam | Portal-Termin sofort im CRM sichtbar (staff_appointments) | bestanden |
| Aufräumen | alle Testkundinnen und die Test-Bestandsakte gelöscht | bestanden (0 übrig) |
