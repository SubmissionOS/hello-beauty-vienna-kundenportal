# CRM-Anbindung: Kundenportal ↔ Hello-Beauty-CRM

Stand 2026-10-14. Die Gegenseite ist das CRM-Repo `SubmissionOS/hello-beauty-vienna` (Next.js, next-intl DE/EN/HU, Supabase nur serverseitig). Das Repo wurde für diese Anleitung nur gelesen, dort ist nichts geändert.

## 1. Was die Schnittstelle kann

Basis: `https://<portal-domain>/api/crm/v1/`. Lokal ist das `http://localhost:3000/api/crm/v1/`.

| Methode | Pfad | Body | Zweck |
|---|---|---|---|
| GET | `customers?q=…` | – | Kundinnen suchen: Name, E-Mail, Kundennummer `HB-XXXXXX` oder Telefon (ab 4 Ziffern), höchstens 25 Treffer |
| GET | `customers/suggestions?email=…&phone=…` | – | Verknüpfungsvorschläge bei gleicher E-Mail oder Telefonnummer (ab 6 Ziffern). Es wird **nie** automatisch verknüpft. |
| GET | `customers/:id` | – | eine Kundin, inklusive `customerNumber` und `crmRef` (aktive Verknüpfung oder `null`) |
| POST | `customers/:id/link` | `{ "crmRef": "k-1001", "actor": "Petra" }` | verknüpfen; 409 `already_linked` / `ref_in_use` |
| POST | `customers/:id/unlink` | `{ "actor": "Petra" }` | trennen |
| GET | `customers/:id/appointments` | – | Termine der Kundin |
| GET | `chat/threads` | – | Verläufe mit `lastAt`, `lastBody` und `unread` (ungelesene Nachrichten der Kundin) |
| GET | `chat/:customerId/messages` | – | Nachrichten, älteste zuerst |
| POST | `chat/:customerId/messages` | `{ "body": "…", "actor": "Petra" }` | senden; die Kundin bekommt Push bzw. E-Mail nach ihren Einstellungen |
| POST | `chat/:customerId/read` | `{ "actor": "Petra" }` | Nachrichten der Kundin als gelesen markieren |
| POST | `news` | `{ "kind": "news"\|"offer"\|"free_slot", "title", "body", "validUntil"?, "publish": bool, "actor" }` | Neuigkeit anlegen. Angebote brauchen `validUntil` (ISO). Mit `publish: true` sehen sie sofort alle Kundinnen in der App. Push, E-Mail und SMS gehen nur an Kundinnen, die für diesen Kanal in Werbung eingewilligt haben (§ 174 TKG). |
| GET | `waitlist` | – | `{ entries, offers }`: aktive Einträge in FIFO-Reihenfolge und Angebote der letzten 7 Tage |

- `:id` / `:customerId` ist die UUID der Kundin im Portal.
- `crmRef` ist die Kennung im CRM (`customers.id`, Text, z. B. `k-1001`).
- `actor` landet im unveränderlichen Protokoll `crm_audit_log`, maximal 80 Zeichen.
- **Fehler** kommen immer als JSON `{ "error": "…" }`:
  - 400: ungültige Eingabe
  - 401: `unauthorized`, `stale`, `bad_signature`
  - 404: `not_found`
  - 409: `replay`, `already_linked`, `ref_in_use`
  - 413: Body über 64 KB
  - 429: `rate_limited` (120 Anfragen pro Minute und Schlüssel)
  - 503: `not_configured`

## 2. Absicherung (Server-zu-Server, nie aus dem Browser)

Jede Anfrage trägt vier Header:

```
X-HB-Key:        hello-beauty-crm                    (Schlüssel-ID, fest an den Tenant Hello Beauty gebunden)
X-HB-Timestamp:  1792000000                          (Unix-Sekunden, höchstens 5 Minuten Abweichung)
X-HB-Nonce:      9f2c…(16–100 Zeichen [A-Za-z0-9_-])  (pro Schlüssel nur EINMAL verwendbar)
X-HB-Signature:  hex(HMAC-SHA256(Geheimnis, Kanon))
```

Der `Kanon` ist eine Zeichenkette aus fünf Zeilen, getrennt durch `\n`:

1. Zeitstempel
2. Nonce
3. HTTP-Methode in Großbuchstaben
4. Pfad plus Query; die Query-Parameter **sortiert** und mit `URLSearchParams` kodiert
5. `hex(SHA-256(roher Body))`, bei GET der Hash des leeren Strings

Die Prüfung läuft in dieser Reihenfolge:

1. Format der Header
2. Zeitfenster
3. Signatur, Vergleich in konstanter Zeit
4. Datenbank: Nonce verbrauchen (Wiederholung → 409), Rate-Limit, Tenant aus dem Schlüssel

Der Tenant kommt **nur** aus dem Schlüssel. Kundinnen anderer Salons sind über diesen Schlüssel unsichtbar.

Geprüft in `tests/crm-api.spec.ts`: falsche Signatur, falsches Geheimnis, Zeitstempel ±301 s, unbekannter Schlüssel, Wiederholung derselben Nonce, Kundin eines fremden Tenants, Anfrage ohne Header.

## 3. Einrichtung im CRM

1. **Geheimnis übertragen.** Das Geheimnis liegt im Portal in `.env.local` als `CRM_BRIDGE_SECRET` (erzeugt mit `npm run env:ensure`). Denselben Wert im CRM eintragen. Übertragung nur über einen sicheren Weg (Passwortmanager, lokal kopieren). Nie per Chat, Mail oder in einem Ticket.
2. **Server-Variablen im CRM** (ohne `NEXT_PUBLIC_`, in `.env.local` und auf Vercel als *Sensitive*):
   ```
   PORTAL_API_URL=https://<portal-domain>/api/crm/v1
   PORTAL_BRIDGE_KEY_ID=hello-beauty-crm
   PORTAL_BRIDGE_SECRET=<gleicher Wert wie CRM_BRIDGE_SECRET im Portal>
   ```
3. **Referenz-Client** für das CRM, `src/lib/server/portal-client.ts`. Nur Node-Bordmittel, kein Paket:

```ts
import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';

export type PortalResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export async function portal<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<PortalResult<T>> {
  const base = process.env.PORTAL_API_URL!;
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`);
  const qs = new URLSearchParams(url.search);
  qs.sort();
  const canonPath = qs.toString() ? `${url.pathname}?${qs}` : url.pathname;
  const raw = body === undefined ? '' : JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const canon = [ts, nonce, method, canonPath, createHash('sha256').update(raw).digest('hex')].join('\n');
  const signature = createHmac('sha256', process.env.PORTAL_BRIDGE_SECRET!).update(canon).digest('hex');
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-HB-Key': process.env.PORTAL_BRIDGE_KEY_ID!,
      'X-HB-Timestamp': ts,
      'X-HB-Nonce': nonce,
      'X-HB-Signature': signature,
    },
    body: method === 'POST' ? raw : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: json as T } : { ok: false, status: res.status, error: json?.error ?? 'unknown' };
}
```

## 4. Was im CRM gebaut werden soll

- **Chat-Posteingang**, neuer Menüpunkt „Nachrichten“ neben „Anfragen“:
  - Liste der Verläufe mit Ungelesen-Zähler.
  - Rechts der Verlauf; Antworten über eine Server Action.
  - Beim Öffnen „gelesen“ melden.
  - Aktualisierung alle 30 s, solange der Tab sichtbar ist.
- **Verknüpfen/Trennen-Dialog** in der Kundendetailseite (`/customers/[id]`):
  - Vorschläge über `customers/suggestions` mit E-Mail/Telefon der CRM-Kundin, zusätzlich eine freie Suche.
  - Auswahl bestätigen, dann `link` mit `crmRef = customers.id`.
  - Bei bestehender Verknüpfung: Kundennummer anzeigen und „Trennen“ mit Rückfrage.
  - Die Verknüpfung (Portal-UUID und Kundennummer) speichert das CRM selbst in einer eigenen Spalte oder Tabelle, mit RLS nach CLAUDE.md.
- **Kundennummer-Anzeige**: `HB-XXXXXX` in der Kopfzeile der Kundendetailseite und als optionale Spalte in der Kundenliste, nur für verknüpfte Kundinnen.

## 5. Fertiger Prompt für Claude Code im CRM-Repo

```
Aufgabe: Anbindung an das Hello-Beauty-Kundenportal (Schnittstelle /api/crm/v1, HMAC-signiert). Halte dich strikt an CLAUDE.md
(npm-Regeln, RLS in jeder Migration, Datenminimierung, i18n DE/EN/HU ohne hartkodierte Strings, Light/Dark, kein KI-Look,
Business-Central-Layout). Backend-Writes sind hiermit für genau diese Funktionen freigegeben.

1. Server-Client: src/lib/server/portal-client.ts exakt nach docs/crm-integration.md im Portal-Repo (Abschnitt 3, nur node:crypto,
   kein neues Paket). Variablen PORTAL_API_URL, PORTAL_BRIDGE_KEY_ID, PORTAL_BRIDGE_SECRET nur serverseitig; in .env.local.example
   mit Platzhaltern dokumentieren. Fehlen sie, zeigen alle neuen Screens einen klaren Hinweis „Portal-Anbindung nicht eingerichtet“.
2. Migration 0009_portal_links.sql: Tabelle portal_links (customer_id text → customers.id, portal_customer_id uuid,
   customer_number text, linked_at, linked_by), unique je customer_id, RLS aktiv + Policy nur für angemeldete Team-Mitglieder
   wie bei den bestehenden Tabellen. In memory.md dokumentieren.
3. Kundendetail /customers/[id]: Abschnitt „Kundenportal“.
   - Nicht verknüpft: Button „Mit Portal verknüpfen“ → Dialog mit Vorschlägen (GET customers/suggestions mit E-Mail/Telefon der
     Kundin) und Suchfeld (GET customers?q=). Jeder Treffer zeigt Name, E-Mail, Kundennummer – Bestätigen ruft
     POST customers/:id/link { crmRef: <customers.id>, actor: <angemeldete Person> } und speichert in portal_links.
   - Verknüpft: Kundennummer HB-XXXXXX prominent, Button „Trennen“ mit Rückfrage → POST customers/:id/unlink, Zeile löschen.
   - Fehler 409 already_linked/ref_in_use verständlich anzeigen. Nie automatisch verknüpfen.
4. Kundenliste: optionale Spalte „Kundennummer“ (aus portal_links), nur Anzeige.
5. Neuer Menüpunkt „Nachrichten“ (nav-items.ts, Icon im bestehenden Stil): links Verläufe (GET chat/threads, Ungelesen-Zähler),
   rechts Verlauf (GET chat/:id/messages), Antwortfeld (Server Action → POST chat/:id/messages), beim Öffnen POST chat/:id/read.
   Aktualisierung alle 30 s nur bei sichtbarem Tab. Leer-, Fehler- und Ladezustände. Nur die angezeigten Felder an den Client geben.
6. Rate-Limit auf den neuen Server Actions wie bei den bestehenden Endpunkten.
7. Prüfen: Typecheck, Lint, Build; manueller Test gegen die lokale Portal-Instanz (http://localhost:3000/api/crm/v1).
   Keine echten Kundendaten in Logs. Kein Commit von .env.local.
```

## 6. Betrieb

- **Schlüssel tauschen**:
  - neues `CRM_BRIDGE_SECRET` erzeugen (Zeile in `.env.local` leeren, dann `npm run env:ensure`),
  - in Portal und CRM gleichzeitig setzen.
  - Für einen gleitenden Wechsel eine zweite Schlüssel-ID in `crm_bridge_keys` anlegen und in `secretFor()` (`src/lib/server/crm-auth.ts`) eine zweite Zuordnung Schlüssel-ID → Variable ergänzen.
- **Sperren**: `update public.crm_bridge_keys set active = false where key_id = 'hello-beauty-crm';` Alle Anfragen bekommen dann sofort 401.
- **Protokoll**: `crm_audit_log` ist unveränderlich (Trigger). Jede Verknüpfung, Trennung, Chat-Nachricht und Neuigkeit aus dem CRM steht dort mit `actor`.
