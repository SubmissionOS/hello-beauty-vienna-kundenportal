# CRM ↔ Kundenportal: eine gemeinsame Datenbank

Stand 2026-10-15. Ergebnis der Analyse des CRM-Repos `SubmissionOS/hello-beauty-vienna` (lokal `Hello-beauty-salon-CRM`), Commit `8c5272b`.

## Ausgangslage

Das CRM lief bisher gegen ein **eigenes** Supabase-Projekt:
- Migrationen `0001`–`0008`.
- IDs als `text` (`k-1001`, `s-01`, `st-petra`).
- Alle Zugriffe serverseitig mit dem Secret Key, RLS nur als „alles verbieten“.

Das Kundenportal-Schema (`supabase/migrations` hier im Repo) wird zur **einzigen Quelle**:
- Das CRM wird umgebaut, nicht das Schema.
- Die CRM-Migrationen `0001`–`0008` werden im gemeinsamen Projekt **nicht** ausgeführt. Sie würden sonst unter anderem `set_updated_at()` überschreiben und mit `alter default privileges … revoke` allen künftigen Tabellen die Rechte entziehen.

## Zuordnung CRM-Konzept → gemeinsames Schema

| CRM (alt) | Gemeinsam (neu) | Art |
|---|---|---|
| `customers.id text` | `customers.id uuid` | bestehend |
| `first_name`, `last_name`, `phone`, `email` | gleichnamige Spalten | bestehend; `email` und `user_id` dürfen für Bestandskundinnen ohne Portal-Konto leer sein |
| `customer_since` | `customers.customer_since date` | **neue Spalte** (Standard: Anlagedatum) |
| `status` (`vip`/`regular`/`new`/`inactive`) | `customers.crm_status text` | **neue Spalte**, gleiche Werte |
| `preferred_staff_id` | `customers.preferred_staff_id uuid` | **neue Spalte** |
| `allergies`, `notes` | `customer_private (customer_id, allergies, notes)` | **neue Tabelle**, nur Team. Eine Spalte an `customers` wäre für die Kundin über ihre eigene Zeile lesbar. |
| – (fehlte) | `customers.customer_number` | bestehend, wird im CRM angezeigt |
| `staff.is_active` | `staff.active` | bestehend |
| `services.category` (Enum) | `services.category_id → service_categories.key` | bestehend (`nails`, `pedicure`, `cosmetics`, `laser`) |
| `services.is_active` | `services.active` | bestehend |
| `appointments.scheduled_on` + `scheduled_at` | `appointments.starts_at`/`ends_at timestamptz`; Wandzeit über `app.to_wall` | bestehend |
| `appointments.duration_minutes` (optional) | `duration_minutes` (Pflicht, Kopie der Leistung) | bestehend |
| Status `confirmed` | `confirmed` | bestehend |
| Status `completed` | `completed` (bzw. `confirmed` mit Ende in der Vergangenheit) | bestehend |
| Status `deposit_open` | `pending` + `hold_kind = 'payment'` mit Zahlung `requires_payment` | bestehend |
| Status `waitlist` | `waitlist_entries` (eigene Tabelle) | bestehend |
| – (fehlte) | `cancelled`, `no_show` | bestehend |
| `amount_eur`, `deposit_eur`, `payment_status`, `payment_method` | `appointments.price_eur`, `appointments.payment`, Tabelle `payments` | bestehend (nur Anzeige) |
| `appointments.notes` | `internal_notes (appointment_id, …)` | **neue Tabelle**, nur Team |
| Doppelbuchung als Hinweis (`findConflict`, überstimmbar) | Exclusion-Constraint `appointments_no_overlap` + `app.slot_ok` | bestehend: eine Logik für beide Apps, **nicht überstimmbar** |
| Öffnungszeiten hartkodiert (`salon-config.ts`) | `opening_hours`, `staff_hours` | bestehend |
| View `customer_stats` | `public.staff_customer_stats` (security invoker) | **neue View** |
| `booking_requests` | `booking_requests` (uuid, `tenant_id`) | **neue Tabelle** (das CRM-Feature bleibt erhalten) |
| `rate_limit_counters`, `consume_rate_limit()` | gleichnamig, nur `service_role` | **neu** (Login, Anfrage und Assistent arbeiten fail-closed) |
| Login-Allowlist (`AUTH_ALLOWED_EMAILS`) | `salon_members` (Rollen `owner` = Inhaberin, `staff` = Mitarbeiterin) | bestehend; `app.is_staff()` und `app.staff_tenant()` neu |
| – | `link_suggestions`, `app_settings` | **neue Tabellen** |
| – | Chat, Warteliste, Neuigkeiten, Zahlungen | bestehend (Portal), neu im CRM sichtbar |

## Geplante Umbenennungen im CRM-Code

- `src/lib/db/*`, `validation/*`, Actions:
  - Spalten wie in der Tabelle oben umstellen.
  - Statt der handgeschriebenen Raw-Typen die generierten Typen `src/lib/db/database.types.ts` verwenden (erzeugt aus diesem Schema).
- `scheduled_on`/`scheduled_at` ersetzen durch `starts_at` und die Wandzeit (`date`, `time` aus `app.to_wall`). Kalender, Akte und Dashboard rechnen mit Wiener Wandzeit.
- `is_active` → `active`; `category` → `service_categories.key`.
- `AppointmentStatus`:
  - alt: `completed | confirmed | deposit_open | waitlist`
  - neu: `pending | confirmed | completed | cancelled | no_show`
  - Dazu `holdKind` für „Anzahlung offen“ und „Wartelisten-Reservierung“.
- `customer_stats` → `staff_customer_stats`; `allergies`/`notes` → `customer_private`.
- `getServiceRoleClient()` nur noch für Rate-Limit und öffentliche Anfrage. Alle Team-Zugriffe laufen über den Sitzungs-Client mit RLS (`app.is_staff()`).
- `findConflict` + `acknowledgeConflict` entfallen; Konflikte meldet die DB (`slot_taken`).
- `AUTH_ALLOWED_EMAILS` entfällt. Zugang hat, wer in `salon_members` steht.

## Was das CRM braucht und es noch nicht gab

- **Rollen** (Inhaberin/Mitarbeiterin) und Team-Login mit E-Mail + Passwort.
- **Interne Notizen** zur Kundin und zum Termin.
- **Unverträglichkeiten** getrennt von den Daten, die die Kundin sieht.
- **Termine verschieben, absagen, abschließen, „nicht erschienen“** über geprüfte Funktionen mit derselben Slot-Logik wie das Portal.
- **Verknüpfungs-Vorschläge** Portal-Konto ↔ Bestandskundin, Zusammenführen und Trennen in einer Transaktion mit Protokoll (`crm_audit_log`).
- **Chat-Posteingang** (Realtime), Warteliste mit „Slot freigeben“, Neuigkeiten, Zahlungsstatus.
- Offen, nicht in dieser Nacht:
  - Abwesenheiten/Urlaub (`staff_absences`)
  - Kundengruppen
  - DSGVO-Export/Löschen im CRM (das Portal hat beides für die Kundin)

## Annahmen

- Die bisherigen CRM-Daten im alten Projekt werden **nicht** übernommen. Stattdessen legt der Seed ~15 Bestandskundinnen mit Historie an `[PLATZHALTER: echte Kundendaten erst nach Freigabe übernehmen]`.
- Ein Salon (`tenant_id` fest). Team-Policies nutzen den Tenant aus `salon_members`, unabhängig von der Domain des CRM.
