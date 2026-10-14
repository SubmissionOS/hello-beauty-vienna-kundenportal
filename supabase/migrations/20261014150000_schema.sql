-- Hello Beauty Kundenportal – Schema (Multi-Tenant)
-- Grundsätze:
--  * Jede Tabelle hat tenant_id. Der Tenant ergibt sich IMMER serverseitig aus dem Host (Origin-Header der Anfrage),
--    nie aus einem Parameter des Clients: app.current_tenant().
--  * Zeiten sind timestamptz. Umrechnung Europe/Vienna ↔ Wandzeit ('YYYY-MM-DDTHH:mm', Adapter-Format) nur in
--    app.to_wall() und app.from_wall().
--  * Lesen über RLS, Schreiben ausschließlich über SECURITY-DEFINER-Funktionen (siehe 20261014150100_functions.sql).

create extension if not exists btree_gist with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------- Typen
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.payment_method as enum ('in_salon', 'online_demo');

-- ---------------------------------------------------------------- Tenants
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid generated always as (id) stored,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  time_zone text not null default 'Europe/Vienna',
  booking_lead_minutes int not null default 60 check (booking_lead_minutes >= 0),
  booking_horizon_days int not null default 60 check (booking_horizon_days between 1 and 365),
  slot_step_minutes int not null default 30 check (slot_step_minutes in (10, 15, 20, 30, 60)),
  change_notice_hours int not null default 24 check (change_notice_hours >= 0),
  max_bookings_per_hour int not null default 5 check (max_bookings_per_hour > 0),
  max_bookings_per_day int not null default 10 check (max_bookings_per_day > 0),
  created_at timestamptz not null default now()
);

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Hostname ohne Port, klein geschrieben. is_pattern: '*' als Platzhalter (z. B. Vercel-Vorschau-URLs)
  host text not null unique check (host = lower(host) and host !~ '[:/]'),
  is_pattern boolean not null default false,
  note text
);

-- ---------------------------------------------------------------- Katalog
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_-]{2,30}$'),
  sort_order int not null default 0,
  image_url text,
  unique (tenant_id, key),
  unique (id, tenant_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null,
  code text not null,
  name text not null check (length(name) between 1 and 120),
  name_i18n jsonb not null default '{}'::jsonb,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price_eur numeric(8, 2) not null check (price_eur >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  unique (tenant_id, code),
  unique (id, tenant_id),
  foreign key (category_id, tenant_id) references public.service_categories (id, tenant_id) on delete restrict
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  display_name text not null check (length(display_name) between 1 and 40), -- nur Vorname
  active boolean not null default true,
  sort_order int not null default 0,
  unique (tenant_id, code),
  unique (id, tenant_id)
);

create table public.staff_services (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete cascade
);

-- weekday: 0 = Sonntag … 6 = Samstag (wie extract(dow))
create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null,
  check (opens < closes),
  unique (tenant_id, weekday)
);

-- Ohne Einträge arbeitet eine Mitarbeiterin zu den Öffnungszeiten; mit Einträgen nur an diesen Tagen/Zeiten
create table public.staff_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  staff_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts time not null,
  ends time not null,
  check (starts < ends),
  unique (staff_id, weekday),
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade
);

-- ---------------------------------------------------------------- Kundinnen
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null check (length(first_name) between 1 and 80),
  last_name text not null check (length(last_name) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  phone text check (phone is null or phone ~ '^\+?[0-9][0-9 ()/-]{5,19}$'),
  language text not null default 'de' check (language in ('de', 'en', 'hu')),
  notify_email boolean not null default true,
  notify_sms boolean not null default false,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  privacy_notice_at timestamptz not null default now(),
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (id, tenant_id),
  check (not notify_sms or phone is not null)
);
create unique index customers_tenant_email on public.customers (tenant_id, lower(email));
create index customers_user on public.customers (user_id);

-- ---------------------------------------------------------------- Termine
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  staff_id uuid not null,
  -- Momentaufnahme zum Buchungszeitpunkt (bleibt lesbar, wenn Katalog sich ändert)
  service_name text not null,
  category_key text not null,
  staff_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price_eur numeric(8, 2) not null check (price_eur >= 0),
  status public.appointment_status not null default 'confirmed',
  payment public.payment_method not null default 'in_salon',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete restrict,
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete restrict,
  -- Doppelbuchung unmöglich – auch bei gleichzeitigen Anfragen (Postgres prüft atomar)
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_customer on public.appointments (customer_id, starts_at);
create index appointments_tenant_start on public.appointments (tenant_id, starts_at);

-- Rate-Limit: jeder Buchungsversuch wird gezählt
create table public.booking_attempts (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index booking_attempts_customer_time on public.booking_attempts (customer_id, created_at);

-- ---------------------------------------------------------------- Hilfsfunktionen (app)

-- Hostname der Anfrage aus dem Origin-Header (den setzt der Browser selbst; Next-Serverrouten setzen ihn aus Host)
create or replace function app.request_host() returns text
language sql stable set search_path = '' as $$
  select nullif(
    lower(split_part(split_part(regexp_replace(
      coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'origin', ''),
      '^[a-z]+://', ''), '/', 1), ':', 1)),
    '')
$$;

-- Tenant der aktuellen Anfrage – exakter Host vor Muster
create or replace function app.current_tenant() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.tenant_id
  from public.tenant_domains d
  where d.host = app.request_host()
     or (d.is_pattern and app.request_host() like replace(replace(d.host, '_', '\_'), '*', '%'))
  order by d.is_pattern, length(d.host) desc
  limit 1
$$;

-- Die einzige Umrechnung timestamptz ↔ Wandzeit des Salons
create or replace function app.to_wall(ts timestamptz, tz text) returns text
language sql immutable set search_path = '' as $$
  select to_char(ts at time zone tz, 'YYYY-MM-DD"T"HH24:MI')
$$;

create or replace function app.from_wall(wall text, tz text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  if wall !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    raise exception 'invalid_time' using errcode = 'P0001';
  end if;
  return (replace(wall, 'T', ' ')::timestamp) at time zone tz;
end
$$;

-- Kundinnen-Datensatz des eingeloggten Users im aktuellen Tenant
create or replace function app.my_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c
  where c.user_id = auth.uid() and c.tenant_id = app.current_tenant() and c.deletion_requested_at is null
$$;

revoke all on all functions in schema app from public;
grant execute on function app.request_host(), app.current_tenant(), app.to_wall(timestamptz, text), app.my_customer_id()
  to anon, authenticated, service_role;
grant execute on function app.from_wall(text, text) to service_role;

-- ---------------------------------------------------------------- Rechte + RLS
-- Grundsatz: anon/authenticated dürfen nichts schreiben; Lesen nur, wo eine Policy es erlaubt.
do $$
declare t text;
begin
  foreach t in array array['tenants', 'tenant_domains', 'service_categories', 'services', 'staff', 'staff_services',
                           'opening_hours', 'staff_hours', 'customers', 'appointments', 'booking_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Katalog: lesbar für alle im selben Tenant (öffentlich, keine personenbezogenen Daten)
grant select on public.tenants, public.service_categories, public.services, public.staff, public.staff_services,
  public.opening_hours, public.staff_hours to anon, authenticated;
-- Staff: nur unkritische Spalten (Vorname)
revoke select on public.staff from anon, authenticated;
grant select (id, tenant_id, display_name, active, sort_order) on public.staff to anon, authenticated;
revoke select on public.tenants from anon, authenticated;
grant select (id, tenant_id, slug, name, time_zone) on public.tenants to anon, authenticated;

create policy tenant_read on public.tenants for select to anon, authenticated
  using (id = (select app.current_tenant()));
create policy catalog_read on public.service_categories for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()));
create policy catalog_read on public.services for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()) and active);
create policy catalog_read on public.staff for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()) and active);
create policy catalog_read on public.staff_services for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()));
create policy catalog_read on public.opening_hours for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()));
create policy catalog_read on public.staff_hours for select to anon, authenticated
  using (tenant_id = (select app.current_tenant()));

-- Personenbezogen: nur eigene Daten im eigenen Tenant, nur eingeloggt
grant select on public.customers, public.appointments to authenticated;
create policy own_customer on public.customers for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id = (select app.current_tenant()) and deletion_requested_at is null);
create policy own_appointments on public.appointments for select to authenticated
  using (customer_id = (select app.my_customer_id()) and tenant_id = (select app.current_tenant()));

-- tenant_domains, booking_attempts: keine Policy → für anon/authenticated unsichtbar

-- Termine der eingeloggten Kundin im Adapter-Format (Wandzeit). security_invoker: RLS der Basistabellen gilt.
create view public.my_appointments with (security_invoker = true) as
select
  a.id,
  a.customer_id,
  a.service_id,
  a.service_name,
  a.category_key,
  a.staff_id,
  a.staff_name,
  app.to_wall(a.starts_at, t.time_zone) as start,
  a.duration_minutes,
  a.price_eur,
  case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end as status,
  a.payment::text as payment,
  a.created_at
from public.appointments a
join public.tenants t on t.id = a.tenant_id;

revoke all on public.my_appointments from anon, authenticated;
grant select on public.my_appointments to authenticated;
