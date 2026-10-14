-- CRM auf der gemeinsamen Datenbank (additiv). Siehe docs/crm-zusammenfuehrung.md.
-- Neu: Team-Rollen/-Rechte, Team-Funktionen mit derselben Slot-Logik wie das Portal, interne Daten (nur Team),
-- Verknüpfungs-Vorschläge Portal-Konto ↔ Bestandskundin, Rate-Limit- und Anfrage-Tabellen des CRM.
-- Bestehendes wird nicht umbenannt oder gelöscht. Einzige Lockerungen (für Bestandskundinnen ohne Portal-Konto):
-- customers.user_id/email dürfen NULL sein; E-Mail ist je Salon eindeutig unter Portal-Konten bzw. unter
-- Bestandskundinnen (statt über alle Zeilen) – sonst könnte sich eine Bestandskundin nie im Portal registrieren.

-- ---------------------------------------------------------------- Team: Rollen und Tenant
-- owner = Inhaberin, staff = Mitarbeiterin (Werte aus Teil 3). Tenant kommt aus der Mitgliedschaft,
-- unabhängig von der Domain des CRM. Ein Salon – nichts für mehrere Salons gebaut.
create or replace function app.staff_tenant() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.tenant_id from public.salon_members m where m.user_id = auth.uid() order by m.created_at limit 1
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.staff_tenant() is not null
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m where m.user_id = auth.uid() and m.role = 'owner')
$$;

create or replace function app.staff_actor() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select 'team:' || m.display_name from public.salon_members m where m.user_id = auth.uid()
                   order by m.created_at limit 1), 'team')
$$;

-- Für den CRM-Login: wer bin ich im Team? (null = kein Team-Zugang)
create or replace function public.staff_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tenantId', m.tenant_id, 'displayName', m.display_name, 'role', m.role, 'email', u.email)
  from public.salon_members m join auth.users u on u.id = m.user_id
  where m.user_id = auth.uid() order by m.created_at limit 1
$$;

-- ---------------------------------------------------------------- Bestandskundinnen ohne Portal-Konto
alter table public.customers alter column user_id drop not null;
alter table public.customers alter column email drop not null;
create unique index customers_tenant_email_portal on public.customers (tenant_id, lower(email)) where user_id is not null;
create unique index customers_tenant_email_legacy on public.customers (tenant_id, lower(email))
  where user_id is null and email is not null;
drop index public.customers_tenant_email;

-- Telefonnummer vergleichbar machen (E.164, Österreich als Standard)
create or replace function app.phone_e164(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or regexp_replace(p, '[^0-9]', '', 'g') = '' then null
    when btrim(p) like '+%' then '+' || regexp_replace(p, '[^0-9]', '', 'g')
    when regexp_replace(p, '[^0-9]', '', 'g') like '00%' then '+' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 3)
    when regexp_replace(p, '[^0-9]', '', 'g') like '0%' then '+43' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 2)
    else '+' || regexp_replace(p, '[^0-9]', '', 'g')
  end
$$;

-- ---------------------------------------------------------------- Interne Daten (nur Team, nie für Kundinnen)
create table public.customer_private (
  customer_id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status text not null default 'new' check (status in ('vip', 'regular', 'new', 'inactive')),
  customer_since date not null default current_date,
  preferred_staff_id uuid references public.staff (id) on delete set null,
  allergies text check (allergies is null or length(allergies) <= 2000),
  notes text check (notes is null or length(notes) <= 4000),
  updated_at timestamptz not null default now(),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid,
  appointment_id uuid references public.appointments (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (customer_id is not null or appointment_id is not null),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index internal_notes_customer on public.internal_notes (customer_id);
create index internal_notes_appointment on public.internal_notes (appointment_id);

-- ---------------------------------------------------------------- Einstellungen + Verknüpfungs-Vorschläge
create table public.app_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  auto_link_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.app_settings (tenant_id) select id from public.tenants where slug = 'hello-beauty' on conflict do nothing;

create table public.link_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  portal_customer_id uuid not null,
  legacy_customer_id uuid not null,
  matched_by text[] not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  unique (portal_customer_id, legacy_customer_id),
  foreign key (portal_customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  foreign key (legacy_customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index link_suggestions_open on public.link_suggestions (tenant_id, status, created_at desc);

-- Abgleich: gleicher Vor- + Nachname UND (gleiche E-Mail ODER gleiche Telefonnummer E.164) mit einer
-- Bestandskundin ohne Portal-Konto → Vorschlag (offen). Verknüpft wird nie hier.
create or replace function app.find_link_suggestions(p_customer uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c public.customers;
  v_n int := 0;
begin
  select * into v_c from public.customers where id = p_customer;
  if v_c.id is null or v_c.user_id is null then return 0; end if;
  insert into public.link_suggestions (tenant_id, portal_customer_id, legacy_customer_id, matched_by)
  select v_c.tenant_id, v_c.id, l.id,
         array_remove(array[
           case when v_c.email is not null and lower(l.email) = lower(v_c.email) then 'email' end,
           case when app.phone_e164(l.phone) is not null and app.phone_e164(l.phone) = app.phone_e164(v_c.phone) then 'phone' end
         ], null)
  from public.customers l
  where l.tenant_id = v_c.tenant_id and l.user_id is null and l.id <> v_c.id and l.deletion_requested_at is null
    and lower(btrim(l.first_name)) = lower(btrim(v_c.first_name))
    and lower(btrim(l.last_name)) = lower(btrim(v_c.last_name))
    and ((v_c.email is not null and lower(l.email) = lower(v_c.email))
         or (app.phone_e164(l.phone) is not null and app.phone_e164(l.phone) = app.phone_e164(v_c.phone)))
  on conflict (portal_customer_id, legacy_customer_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Zusammenführen: Portal-Konto der Bestandskundin zuordnen. Alles der Portal-Zeile wird umgehängt, dann die
-- (leere) Portal-Zeile entfernt – in EINER Transaktion, mit Protokoll. Die Kundennummer der Bestandskundin bleibt.
create or replace function app.merge_customers(p_legacy uuid, p_portal uuid, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_l public.customers;
  v_p public.customers;
  v_moved jsonb := '{}'::jsonb;
  v_n int;
begin
  select * into v_l from public.customers where id = p_legacy for update;
  select * into v_p from public.customers where id = p_portal for update;
  if v_l.id is null or v_p.id is null or v_l.tenant_id <> v_p.tenant_id then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_l.user_id is not null then raise exception 'already_linked' using errcode = 'P0001'; end if;
  if v_p.user_id is null then raise exception 'not_portal' using errcode = 'P0001'; end if;

  update public.appointments set customer_id = v_l.id where customer_id = v_p.id;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('appointments', v_n);
  update public.chat_messages set customer_id = v_l.id where customer_id = v_p.id;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('chat', v_n);
  update public.waitlist_entries set customer_id = v_l.id where customer_id = v_p.id;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('waitlist', v_n);
  update public.waitlist_offers set customer_id = v_l.id where customer_id = v_p.id;
  update public.payments set customer_id = v_l.id where customer_id = v_p.id;
  get diagnostics v_n = row_count; v_moved := v_moved || jsonb_build_object('payments', v_n);
  update public.booking_attempts set customer_id = v_l.id where customer_id = v_p.id;
  update public.marketing_consents set customer_id = v_l.id where customer_id = v_p.id;
  update public.push_subscriptions set customer_id = v_l.id where customer_id = v_p.id;
  update public.notification_queue set customer_id = v_l.id where customer_id = v_p.id;
  update public.internal_notes set customer_id = v_l.id where customer_id = v_p.id;
  update public.crm_links set customer_id = v_l.id where customer_id = v_p.id;
  insert into public.news_reads (tenant_id, customer_id, news_id, read_at)
    select tenant_id, v_l.id, news_id, read_at from public.news_reads where customer_id = v_p.id on conflict do nothing;
  insert into public.notification_preferences (tenant_id, customer_id, kind, channel, enabled, updated_at)
    select tenant_id, v_l.id, kind, channel, enabled, updated_at from public.notification_preferences
    where customer_id = v_p.id on conflict do nothing;
  update public.link_suggestions set status = 'confirmed', decided_at = now(), decided_by = p_actor
    where portal_customer_id = v_p.id and legacy_customer_id = v_l.id;

  -- Portal-Zeile entfernen (Rest hängt per Cascade daran), dann die Bestandskundin mit dem Konto verbinden
  delete from public.customers where id = v_p.id;
  update public.customers set user_id = v_p.user_id, email = v_p.email, language = v_p.language,
    phone = coalesce(phone, v_p.phone), notify_email = v_p.notify_email, notify_sms = v_p.notify_sms and coalesce(phone, v_p.phone) is not null,
    marketing_consent = v_p.marketing_consent, marketing_consent_at = v_p.marketing_consent_at,
    privacy_notice_at = v_p.privacy_notice_at, avatar_path = coalesce(v_p.avatar_path, avatar_path)
  where id = v_l.id;
  perform app.audit(v_l.tenant_id, p_actor, 'merge', v_l.id, null,
    v_moved || jsonb_build_object('portalCustomerId', v_p.id, 'portalCustomerNumber', v_p.customer_number));
  return jsonb_build_object('customerId', v_l.id, 'moved', v_moved);
end
$$;

-- Trennen: Das Portal-Konto bekommt wieder eine eigene (neue) Zeile; Historie bleibt bei der Bestandskundin.
create or replace function app.unlink_portal(p_customer uuid, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c public.customers;
  v_new uuid;
begin
  select * into v_c from public.customers where id = p_customer for update;
  if v_c.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_c.user_id is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  update public.customers set user_id = null where id = v_c.id;
  insert into public.customers (tenant_id, user_id, first_name, last_name, email, phone, language, notify_email,
                                marketing_consent, marketing_consent_at, privacy_notice_at)
  values (v_c.tenant_id, v_c.user_id, v_c.first_name, v_c.last_name, v_c.email, v_c.phone, v_c.language, v_c.notify_email,
          v_c.marketing_consent, v_c.marketing_consent_at, v_c.privacy_notice_at)
  returning id into v_new;
  -- die Bestandskundin behält ihre E-Mail nur, wenn sie nicht mit der neuen Portal-Zeile kollidiert (gleiche Person)
  perform app.audit(v_c.tenant_id, p_actor, 'unlink', v_c.id, null, jsonb_build_object('newPortalCustomerId', v_new));
  update public.link_suggestions set status = 'rejected', decided_at = now(), decided_by = p_actor
    where legacy_customer_id = v_c.id and status = 'confirmed';
  return jsonb_build_object('legacyCustomerId', v_c.id, 'portalCustomerId', v_new);
end
$$;

-- Registrierung (Portal): E-Mail ist nur unter Portal-Konten belegt; danach Abgleich mit Bestandskundinnen.
-- Automatisch verknüpft wird nur mit app_settings.auto_link_verified = an UND bestätigter E-Mail UND genau einem Treffer.
create or replace function public.register_customer(
  p_first_name text, p_last_name text, p_phone text, p_language text, p_marketing boolean)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := app.current_tenant();
  v_email text := lower(auth.jwt() ->> 'email');
  v_c public.customers;
  v_confirmed boolean;
  v_auto boolean;
  v_legacy uuid;
  v_hits int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_tenant is null then raise exception 'tenant_unknown' using errcode = 'P0001'; end if;
  if v_email is null then raise exception 'email_missing' using errcode = 'P0001'; end if;

  select * into v_c from public.customers where tenant_id = v_tenant and user_id = v_uid;
  if found then
    if v_c.deletion_requested_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
    return app.profile_json(v_c);
  end if;
  if exists (select 1 from public.customers where tenant_id = v_tenant and user_id is not null and lower(email) = v_email) then
    raise exception 'email_taken' using errcode = 'P0001';
  end if;

  insert into public.customers (tenant_id, user_id, first_name, last_name, email, phone, language,
                                marketing_consent, marketing_consent_at)
  values (v_tenant, v_uid, trim(p_first_name), trim(p_last_name), v_email, nullif(trim(coalesce(p_phone, '')), ''),
          coalesce(nullif(p_language, ''), 'de'), coalesce(p_marketing, false),
          case when coalesce(p_marketing, false) then now() end)
  returning * into v_c;

  v_hits := app.find_link_suggestions(v_c.id);
  select (email_confirmed_at is not null) into v_confirmed from auth.users where id = v_uid;
  select coalesce(auto_link_verified, false) into v_auto from public.app_settings where tenant_id = v_tenant;
  if v_hits = 1 and coalesce(v_auto, false) and coalesce(v_confirmed, false) then
    select legacy_customer_id into v_legacy from public.link_suggestions where portal_customer_id = v_c.id;
    perform app.merge_customers(v_legacy, v_c.id, 'auto');
    select * into v_c from public.customers where id = v_legacy;
  end if;
  return app.profile_json(v_c);
end
$$;

-- ---------------------------------------------------------------- Team-Rechte (RLS mit app.is_staff)
-- Lesen: alles im Salon. Schreiben: Stammdaten per RLS, Termine/Chat/Neuigkeiten/Verknüpfung nur über Funktionen.
create policy staff_customers_read on public.customers for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_customers_insert on public.customers for insert to authenticated
  with check (tenant_id = (select app.staff_tenant()) and user_id is null);
create policy staff_customers_update on public.customers for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
grant insert (tenant_id, first_name, last_name, email, phone, language) on public.customers to authenticated;
grant update (first_name, last_name, email, phone, language) on public.customers to authenticated;

create policy staff_appointments_read on public.appointments for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_chat_read on public.chat_messages for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_members_read on public.salon_members for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_consents_read on public.marketing_consents for select to authenticated
  using (tenant_id = (select app.staff_tenant()));

-- bisher ohne Leserecht für angemeldete Nutzer: Lesen nur für das Team
grant select on public.waitlist_entries, public.waitlist_offers, public.payments, public.news_posts,
  public.crm_audit_log, public.payment_rules to authenticated;
create policy staff_waitlist_read on public.waitlist_entries for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_offers_read on public.waitlist_offers for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_payments_read on public.payments for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_news_read on public.news_posts for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_audit_read on public.crm_audit_log for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_rules_read on public.payment_rules for select to authenticated using (tenant_id = (select app.staff_tenant()));

-- Stammdaten: Leistungen, Kategorien, Mitarbeiterinnen, Zuordnungen, Arbeits- und Öffnungszeiten
grant select on public.staff to authenticated;
grant insert, update on public.services, public.service_categories, public.staff, public.staff_hours,
  public.opening_hours to authenticated;
grant insert, delete on public.staff_services to authenticated;
create policy staff_services_write on public.services for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_services_update on public.services for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
create policy staff_categories_write on public.service_categories for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_categories_update on public.service_categories for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
create policy staff_staff_write on public.staff for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_staff_update on public.staff for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
create policy staff_staff_read_all on public.staff for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_services_read_all on public.services for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_ss_write on public.staff_services for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_ss_delete on public.staff_services for delete to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_hours_write on public.staff_hours for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_hours_update on public.staff_hours for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
create policy staff_opening_write on public.opening_hours for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_opening_update on public.opening_hours for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));

-- neue Tabellen: RLS an, nur Team
alter table public.customer_private enable row level security;
alter table public.internal_notes enable row level security;
alter table public.app_settings enable row level security;
alter table public.link_suggestions enable row level security;
revoke all on public.customer_private, public.internal_notes, public.app_settings, public.link_suggestions from anon, authenticated;
grant select, insert, update on public.customer_private to authenticated;
grant select, insert, delete on public.internal_notes to authenticated;
grant select on public.app_settings, public.link_suggestions to authenticated;
grant update (auto_link_verified, updated_at, updated_by) on public.app_settings to authenticated;
create policy staff_private_read on public.customer_private for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_private_insert on public.customer_private for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_private_update on public.customer_private for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));
create policy staff_notes_read on public.internal_notes for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_notes_insert on public.internal_notes for insert to authenticated with check (tenant_id = (select app.staff_tenant()));
create policy staff_notes_delete on public.internal_notes for delete to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_settings_read on public.app_settings for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy owner_settings_update on public.app_settings for update to authenticated
  using (tenant_id = (select app.staff_tenant()) and (select app.is_owner()))
  with check (tenant_id = (select app.staff_tenant()) and (select app.is_owner()));
create policy staff_suggestions_read on public.link_suggestions for select to authenticated using (tenant_id = (select app.staff_tenant()));

-- ---------------------------------------------------------------- Ansichten fürs CRM (security invoker = RLS gilt)
create view public.staff_appointments with (security_invoker = true) as
select a.id, a.customer_id, c.first_name || ' ' || c.last_name as customer_name, c.customer_number,
  a.service_id, a.service_name, a.category_key, a.staff_id, a.staff_name,
  app.to_wall(a.starts_at, t.time_zone) as start, a.starts_at, a.ends_at, a.duration_minutes, a.price_eur,
  case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end as status,
  a.status::text as raw_status, a.payment::text as payment, a.hold_kind, a.hold_expires_at, a.created_at,
  (c.user_id is not null) as portal_account
from public.appointments a
join public.customers c on c.id = a.customer_id
join public.tenants t on t.id = a.tenant_id;

create view public.staff_customer_stats with (security_invoker = true) as
select c.id as customer_id,
  max(a.starts_at) filter (where a.status in ('confirmed', 'completed') and a.ends_at < now()) as last_visit,
  count(a.id) filter (where a.status in ('confirmed', 'completed') and a.ends_at < now())::int as visit_count,
  count(a.id) filter (where a.status in ('pending', 'confirmed') and a.starts_at > now() and a.hold_kind is distinct from 'waitlist_offer')::int as upcoming_count
from public.customers c left join public.appointments a on a.customer_id = c.id
group by c.id;

revoke all on public.staff_appointments, public.staff_customer_stats from anon;
grant select on public.staff_appointments, public.staff_customer_stats to authenticated;

-- ---------------------------------------------------------------- Team-Funktionen (gleiche Slot-Logik wie das Portal)
create or replace function app.require_staff() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := app.staff_tenant();
begin
  if v is null then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return v;
end
$$;

-- Termin anlegen: Slot-Prüfung app.slot_ok + Exclusion-Constraint (keine zweite Logik, nicht überstimmbar)
create or replace function public.staff_book_appointment(p_customer uuid, p_service uuid, p_staff uuid, p_start text, p_note text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_t public.tenants;
  v_s public.services;
  v_st timestamptz;
  v_en timestamptz;
  v_id uuid;
begin
  select * into v_t from public.tenants where id = v_tenant;
  select * into v_s from public.services where id = p_service and tenant_id = v_tenant;
  if v_s.id is null or not exists (select 1 from public.customers where id = p_customer and tenant_id = v_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.staff f join public.staff_services ss on ss.staff_id = f.id and ss.service_id = v_s.id
                 where f.id = p_staff and f.tenant_id = v_tenant and f.active) then
    raise exception 'staff_not_qualified' using errcode = 'P0001';
  end if;
  v_st := app.from_wall(p_start, v_t.time_zone);
  v_en := v_st + make_interval(mins => v_s.duration_minutes);
  if not app.slot_ok(v_tenant, p_staff, v_st, v_en, null) then raise exception 'slot_taken' using errcode = 'P0001'; end if;
  begin
    insert into public.appointments (tenant_id, customer_id, service_id, staff_id, service_name, category_key, staff_name,
                                     starts_at, ends_at, duration_minutes, price_eur, status, payment)
    select v_tenant, p_customer, v_s.id, p_staff, v_s.name, c.key, f.display_name, v_st, v_en, v_s.duration_minutes,
           v_s.price_eur, case when v_en < now() then 'completed' else 'confirmed' end::public.appointment_status, 'in_salon'
    from public.service_categories c, public.staff f
    where c.id = v_s.category_id and f.id = p_staff
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.internal_notes (tenant_id, appointment_id, customer_id, body, created_by)
    values (v_tenant, v_id, p_customer, btrim(p_note), app.staff_actor());
  end if;
  return app.appointment_json(v_id);
end
$$;

create or replace function public.staff_reschedule_appointment(p_id uuid, p_start text, p_staff uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_a public.appointments;
  v_t public.tenants;
  v_staff uuid;
  v_st timestamptz;
  v_en timestamptz;
begin
  select * into v_a from public.appointments where id = p_id and tenant_id = v_tenant for update;
  if v_a.id is null or v_a.status not in ('pending', 'confirmed') then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_t from public.tenants where id = v_tenant;
  v_staff := coalesce(p_staff, v_a.staff_id);
  if not exists (select 1 from public.staff_services ss join public.staff f on f.id = ss.staff_id
                 where ss.staff_id = v_staff and ss.service_id = v_a.service_id and f.active) then
    raise exception 'staff_not_qualified' using errcode = 'P0001';
  end if;
  v_st := app.from_wall(p_start, v_t.time_zone);
  v_en := v_st + make_interval(mins => v_a.duration_minutes);
  if not app.slot_ok(v_tenant, v_staff, v_st, v_en, v_a.id) then raise exception 'slot_taken' using errcode = 'P0001'; end if;
  begin
    update public.appointments set starts_at = v_st, ends_at = v_en, staff_id = v_staff,
      staff_name = (select display_name from public.staff where id = v_staff), updated_at = now()
    where id = p_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  return app.appointment_json(p_id);
end
$$;

-- Absagen durch das Team: volle Erstattung, Slot geht an die Warteliste (Trigger aus Teil 4)
create or replace function public.staff_cancel_appointment(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
begin
  update public.appointments set status = 'cancelled', updated_at = now()
  where id = p_id and tenant_id = v_tenant and status in ('pending', 'confirmed');
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.payments set status = 'refund_pending', refund_cents = amount_cents, updated_at = now()
  where appointment_id = p_id and status = 'paid';
  update public.payments set status = 'cancelled', updated_at = now()
  where appointment_id = p_id and status in ('requires_payment', 'processing');
  return app.appointment_json(p_id);
end
$$;

-- Abschließen (stattgefunden) oder „nicht erschienen“
create or replace function public.staff_set_appointment_status(p_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
begin
  if p_status not in ('completed', 'no_show') then raise exception 'invalid_status' using errcode = 'P0001'; end if;
  update public.appointments set status = p_status::public.appointment_status, hold_kind = null, hold_expires_at = null,
    updated_at = now()
  where id = p_id and tenant_id = v_tenant and status in ('pending', 'confirmed') and hold_kind is distinct from 'waitlist_offer';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return app.appointment_json(p_id);
end
$$;

-- Freien Slot der Warteliste anbieten (Kaskade aus Teil 4: FIFO, genau eine Person)
create or replace function public.staff_offer_free_slot(p_staff uuid, p_start text, p_minutes int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_tz text;
  v_st timestamptz;
  v_offer uuid;
begin
  select time_zone into v_tz from public.tenants where id = v_tenant;
  if not exists (select 1 from public.staff where id = p_staff and tenant_id = v_tenant) then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_minutes not between 10 and 600 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  v_st := app.from_wall(p_start, v_tz);
  if not app.slot_ok(v_tenant, p_staff, v_st, v_st + make_interval(mins => p_minutes), null) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
  v_offer := app.waitlist_offer_next(v_tenant, p_staff, v_st, v_st + make_interval(mins => p_minutes));
  return jsonb_build_object('offerId', v_offer);
end
$$;

-- Chat (Team): senden reiht Push/E-Mail für die Kundin ein; gelesen markieren
create or replace function public.staff_send_chat(p_customer uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_m public.chat_messages;
begin
  if not exists (select 1 from public.customers where id = p_customer and tenant_id = v_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (tenant_id, customer_id, sender, sender_name, body)
  values (v_tenant, p_customer, 'salon',
          (select display_name from public.salon_members where user_id = auth.uid() order by created_at limit 1), btrim(p_body))
  returning * into v_m;
  perform app.enqueue_notification(v_tenant, p_customer, 'chat', array['push', 'email'],
    jsonb_build_object('title', 'Neue Nachricht von Hello Beauty', 'body', left(v_m.body, 140), 'url', '/app/nachrichten'),
    'chat:' || v_m.id);
  return to_jsonb(v_m);
end
$$;

create or replace function public.staff_mark_chat_read(p_customer uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_n int;
begin
  update public.chat_messages set read_by_salon_at = now()
  where customer_id = p_customer and tenant_id = v_tenant and sender = 'customer' and read_by_salon_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Neuigkeiten (Team)
create or replace function public.staff_news_save(p_kind text, p_title text, p_body text, p_image_path text,
  p_valid_until timestamptz, p_publish boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_n public.news_posts;
begin
  v_n := app.news_save(v_tenant, null, p_kind, p_title, p_body, p_image_path, p_valid_until, app.staff_actor());
  if p_publish then return app.news_publish(v_tenant, v_n.id); end if;
  return app.news_json(v_n, false);
end
$$;

-- Verknüpfen / Trennen / Vorschlag ablehnen (nur Team, mit Protokoll)
create or replace function public.staff_confirm_link(p_suggestion uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
  v_s public.link_suggestions;
begin
  select * into v_s from public.link_suggestions where id = p_suggestion and tenant_id = v_tenant for update;
  if v_s.id is null or v_s.status <> 'open' then raise exception 'not_found' using errcode = 'P0001'; end if;
  return app.merge_customers(v_s.legacy_customer_id, v_s.portal_customer_id, app.staff_actor());
end
$$;

create or replace function public.staff_reject_link(p_suggestion uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
begin
  update public.link_suggestions set status = 'rejected', decided_at = now(), decided_by = app.staff_actor()
  where id = p_suggestion and tenant_id = v_tenant and status = 'open';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  perform app.audit(v_tenant, app.staff_actor(), 'link_rejected', null, null, jsonb_build_object('suggestionId', p_suggestion));
end
$$;

create or replace function public.staff_unlink_portal(p_customer uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.require_staff();
begin
  if not exists (select 1 from public.customers where id = p_customer and tenant_id = v_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return app.unlink_portal(p_customer, app.staff_actor());
end
$$;

-- ---------------------------------------------------------------- CRM: Online-Anfragen + Rate-Limit (nur Server)
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text,
  email text,
  service_id uuid references public.services (id) on delete set null,
  service_label text,
  desired_date date,
  desired_time text check (desired_time is null or desired_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  message text check (message is null or length(message) <= 2000),
  status text not null default 'new' check (status in ('new', 'confirmed', 'rejected')),
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  check (phone is not null or email is not null)
);
create index booking_requests_tenant on public.booking_requests (tenant_id, created_at desc);
alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from anon, authenticated;
grant select on public.booking_requests to authenticated;
grant update (status, handled_at) on public.booking_requests to authenticated;
create policy staff_requests_read on public.booking_requests for select to authenticated using (tenant_id = (select app.staff_tenant()));
create policy staff_requests_update on public.booking_requests for update to authenticated
  using (tenant_id = (select app.staff_tenant())) with check (tenant_id = (select app.staff_tenant()));

create table public.rate_limit_counters (
  bucket text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);
create index rate_limit_counters_reset_at_idx on public.rate_limit_counters (reset_at);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- unverändert aus dem CRM (0007_rate_limit_counters.sql), nur service_role
create or replace function public.consume_rate_limit(entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  now_ts          timestamptz := now();
  rec             record;
  cur_count       integer;
  cur_reset       timestamptz;
  blocked_name    text        := null;
  blocked_limit   integer     := null;
  blocked_reset   timestamptz := null;
  tight_remaining integer     := null;
  tight_limit     integer     := null;
  tight_reset     timestamptz := null;
begin
  if entries is null or jsonb_array_length(entries) = 0 then
    raise exception 'consume_rate_limit: entries must be a non-empty array';
  end if;
  insert into public.rate_limit_counters (bucket, count, reset_at)
  select s.bucket, 0, now_ts + make_interval(secs => s.window_ms::double precision / 1000.0)
  from (
    select (e->>'name') || ':' || (e->>'key') as bucket, (e->>'window_ms')::bigint as window_ms
    from jsonb_array_elements(entries) as e
    order by 1
  ) as s
  on conflict (bucket) do nothing;
  perform 1 from public.rate_limit_counters c
  where c.bucket in (select (e->>'name') || ':' || (e->>'key') from jsonb_array_elements(entries) as e)
  order by c.bucket
  for update;
  for rec in
    select (e.value->>'name') || ':' || (e.value->>'key') as bucket, (e.value->>'name') as name,
           (e.value->>'limit')::integer as lim, (e.value->>'window_ms')::bigint as window_ms
    from jsonb_array_elements(entries) with ordinality as e(value, ord)
    order by e.ord
  loop
    select c.count, c.reset_at into cur_count, cur_reset from public.rate_limit_counters c where c.bucket = rec.bucket;
    if cur_reset <= now_ts then
      cur_count := 0;
      cur_reset := now_ts + make_interval(secs => rec.window_ms::double precision / 1000.0);
      update public.rate_limit_counters set count = 0, reset_at = cur_reset where bucket = rec.bucket;
    end if;
    if cur_count >= rec.lim and blocked_name is null then
      blocked_name := rec.name;
      blocked_limit := rec.lim;
      blocked_reset := cur_reset;
    end if;
    if tight_remaining is null or (rec.lim - cur_count - 1) < tight_remaining then
      tight_remaining := rec.lim - cur_count - 1;
      tight_limit := rec.lim;
      tight_reset := cur_reset;
    end if;
  end loop;
  if blocked_name is not null then
    return jsonb_build_object('allowed', false, 'blocked_by', blocked_name,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (blocked_reset - now_ts)))::int),
      'remaining', 0, 'limit', blocked_limit, 'reset_at', blocked_reset);
  end if;
  update public.rate_limit_counters c set count = c.count + 1
  where c.bucket in (select (e->>'name') || ':' || (e->>'key') from jsonb_array_elements(entries) as e);
  if random() < 0.01 then
    delete from public.rate_limit_counters where reset_at < now_ts - interval '1 day';
  end if;
  return jsonb_build_object('allowed', true, 'blocked_by', null, 'retry_after_seconds', 0,
    'remaining', greatest(0, coalesce(tight_remaining, 0)), 'limit', coalesce(tight_limit, 0), 'reset_at', tight_reset);
end;
$$;

-- ---------------------------------------------------------------- Realtime für den Chat-Posteingang im CRM
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------------- Rechte der Funktionen
revoke all on function app.staff_tenant(), app.is_staff(), app.is_owner(), app.staff_actor(), app.require_staff(),
  app.find_link_suggestions(uuid), app.merge_customers(uuid, uuid, text), app.unlink_portal(uuid, text)
  from public, anon;
grant execute on function app.staff_tenant(), app.is_staff(), app.is_owner() to authenticated, service_role;
grant execute on function app.phone_e164(text) to authenticated, service_role;
revoke all on function public.staff_me(), public.staff_book_appointment(uuid, uuid, uuid, text, text),
  public.staff_reschedule_appointment(uuid, text, uuid), public.staff_cancel_appointment(uuid),
  public.staff_set_appointment_status(uuid, text), public.staff_offer_free_slot(uuid, text, int),
  public.staff_send_chat(uuid, text), public.staff_mark_chat_read(uuid),
  public.staff_news_save(text, text, text, text, timestamptz, boolean), public.staff_confirm_link(uuid),
  public.staff_reject_link(uuid), public.staff_unlink_portal(uuid) from public, anon;
grant execute on function public.staff_me(), public.staff_book_appointment(uuid, uuid, uuid, text, text),
  public.staff_reschedule_appointment(uuid, text, uuid), public.staff_cancel_appointment(uuid),
  public.staff_set_appointment_status(uuid, text), public.staff_offer_free_slot(uuid, text, int),
  public.staff_send_chat(uuid, text), public.staff_mark_chat_read(uuid),
  public.staff_news_save(text, text, text, text, timestamptz, boolean), public.staff_confirm_link(uuid),
  public.staff_reject_link(uuid), public.staff_unlink_portal(uuid) to authenticated;
revoke all on function public.consume_rate_limit(jsonb) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(jsonb) to service_role;
