# Zahlung mit Stripe einrichten

Stand 2026-10-14. Der Code ist vorbereitet; es sind noch keine echten Schlüssel gesetzt. Solange `STRIPE_SECRET_KEY` fehlt, läuft der Mock-Anbieter „Test-Zahlung“: Es fließt kein Geld und es werden keine Kartendaten erfasst.

## Empfehlung: Stripe Connect (Standard-Konten), keine einzelnen Schlüssel pro Salon

Das Portal ist mandantenfähig, mehrere Salons laufen auf einer Installation. Deshalb Connect:

| | **Stripe Connect** (empfohlen) | Eigene Schlüssel pro Salon |
|---|---|---|
| Geheimnisse auf dem Server | **eines** (Plattform-Schlüssel) + ein Webhook-Geheimnis | ein Secret Key + ein Webhook-Geheimnis **je Salon** in der Datenbank – hochwertige Ziele, Rotation pro Salon |
| Geld und Haftung | direkt auf dem Konto des Salons („direct charge“), Salon ist Händler | gleich, aber ohne Plattform-Sicht |
| Webhooks | ein Endpunkt für alle Salons („Events on connected accounts“) | ein Endpunkt bzw. Geheimnis je Salon |
| Einrichtung neuer Salon | Onboarding-Link, Salon verbindet sein Konto selbst (KYC bei Stripe) | Salon muss Schlüssel herausgeben – Weitergabe von Geheimnissen |
| Erstattungen, Auszahlungen | im eigenen Stripe-Dashboard des Salons | gleich |
| Plattform-Gebühr später | möglich (`application_fee_amount`) | nicht möglich |

**Standard-Konten** sind für Hello Beauty die einfachste Variante. Der Salon hat sein volles Stripe-Dashboard, und Stripe übernimmt Identitätsprüfung und Support. Express- oder Custom-Konten lohnen sich erst, wenn das Portal Auszahlungen selbst steuern soll.

## So ist es im Code umgesetzt

- **Zahlungs-Adapter** in `src/lib/server/payments.ts` mit zwei Anbietern:
  - `mockProvider`: Test-Zahlung.
  - `stripeProvider`: Checkout Session über die REST-API, ohne Paket und ohne Stripe-Script in der App.
- Mit `STRIPE_CONNECT_ACCOUNT_ID` geht jede Anfrage mit dem Header `Stripe-Account` als direct charge auf das Konto des Salons.
- **Ablauf:**
  1. Die Buchung reserviert den Termin (`pending`, `hold_kind = payment`, Haltezeit `tenants.payment_hold_minutes`, Standard 15 Minuten).
  2. `/api/payments/checkout` erzeugt die Stripe-Zahlungsseite. Stripe verlangt dabei mindestens 30 Minuten Gültigkeit.
  3. Die Kundin zahlt bei Stripe und kommt auf `/app/termine?bezahlt=1` zurück.
  4. Der Webhook bestätigt den Termin.
- **Webhook** `/api/payments/webhook`:
  - Signatur aus `Stripe-Signature` prüfen (HMAC-SHA256, höchstens 5 Minuten alt), sonst 400.
  - Idempotenz über `payment_events` (Anbieter + Ereignis-ID): ein zweites Mal ergibt `duplicate`.
  - Ein abweichender Betrag ergibt `amount_mismatch`, der Termin wird dann nicht bestätigt.
  - Kommt eine Zahlung erst nach Ablauf der Reservierung, wird die Erstattung automatisch vorgemerkt (`refund_needed`).
- **Ereignisse:** `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`.
- **Erstattungen:**
  - Absage durch die Kundin rechtzeitig (`tenants.change_notice_hours`, 24 h): voller Betrag.
  - Absage durch die Kundin später: es wird `tenants.late_cancel_keep_percent` einbehalten (Standard 100 %, in der App ist die Absage dann ohnehin gesperrt).
  - Absage durch den Salon: immer voller Betrag.
  - Der Worker `/api/notifications/process` löst vorgemerkte Erstattungen beim Anbieter aus (Idempotenz-Schlüssel `refund:<id>`). Stripe bestätigt per `charge.refunded`.
- **Zahlungsregeln** stehen in `payment_rules`: `on_site`, `deposit_percent`, `deposit_fixed` oder `full`; pro Leistung oder als Standard des Salons. Der Demo-Seed setzt für Laser-Leistungen 30 % Anzahlung `[PLATZHALTER: echte Regeln legt der Salon fest]`.
- **Test-Zahlung** (`/api/payments/test-complete`) ist automatisch abgeschaltet (404), sobald `STRIPE_SECRET_KEY` gesetzt ist.

## Einrichtung (Schritt für Schritt)

1. **Plattform-Konto** bei Stripe anlegen (Gutmann Holding als Plattform) und unter *Connect* Connect aktivieren.
2. **Salon verbinden:** In Stripe einen Onboarding-Link für ein **Standard**-Konto erzeugen (Connect → Konten → Hinzufügen), dem Salon schicken. Danach die Konto-ID `acct_…` notieren.
3. **Webhook:** Stripe → Developers → Webhooks → Endpoint `https://<portal-domain>/api/payments/webhook`.
   - **Listen to: Events on connected accounts.**
   - Ereignisse: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`.
   - Signing secret `whsec_…` kopieren.
4. **Variablen setzen**, lokal in `.env.local` und auf Vercel:

   | Variable | Wert | Vercel |
   |---|---|---|
   | `STRIPE_SECRET_KEY` | Plattform-Key `sk_live_…` (besser: Restricted Key mit Checkout, PaymentIntents, Refunds) | Sensitive |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` aus Schritt 3 | Sensitive |
   | `STRIPE_CONNECT_ACCOUNT_ID` | `acct_…` des Salons | normal |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (schaltet in der App „Jetzt bezahlen“ statt „Test-Zahlung“ frei) | öffentlich |

5. **Testen mit Testschlüsseln** (`sk_test_…`) und der Stripe CLI:
   - `stripe listen --forward-connect-to localhost:3000/api/payments/webhook`
   - Mit der Testkarte buchen, z. B. eine Laser-Leistung.
   - Danach den Termin in der App absagen und prüfen, dass die Erstattung in Stripe erscheint.
6. **Zahlungsregeln** mit dem Salon festlegen und in `payment_rules` eintragen.
7. **Rechtliches:**
   - AGB und Stornobedingungen (Anzahlung, Frist, Einbehalt) im Buchungsschritt verlinken.
   - Datenschutzerklärung um Stripe als Auftragsverarbeiter ergänzen `[PLATZHALTER: Text durch den Salon/Rechtsberatung]`.

## Später (eigene Aufgabe, nicht Teil dieser Nacht)

- Bei mehreren Salons gehört die Konto-ID in die Datenbank statt in die Umgebung (additive Spalte `tenants.stripe_account_id`). Dann wählt `stripeProvider` das Konto pro Tenant.
- Wiederkehrende Abgleiche (z. B. täglich offene `processing`-Zahlungen bei Stripe nachfragen) als zweiter Sicherheitsgurt neben dem Webhook.
