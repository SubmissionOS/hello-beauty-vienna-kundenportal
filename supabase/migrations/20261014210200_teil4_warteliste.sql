-- Teil 4 / 3: Warteliste mit Angebots-Kaskade. NUR ADDITIV (Rückrollung: supabase/rollback/20261014210200.down.sql).
-- Reservierung während eines Angebots = Termin im Status 'pending' mit hold_kind = 'waitlist_offer':
-- so greift die bestehende Doppelbuchungs-Sperre (appointments_no_overlap) unverändert auch für Reservierungen.

-- ---------------------------------------------------------------- Einstellungen pro Tenant
alter table public.tenants
  add column offer_window_divisor int not null default 15 check (offer_window_divisor between 1 and 100),
  add column offer_window_min_minutes int not null default 3 check (offer_window_min_minutes between 1 and 240),
  add column offer_window_max_minutes int not null default 60 check (offer_window_max_minutes between 1 and 1440),
  add column short_notice_hours int not null default 24 check (short_notice_hours between 1 and 168),
  add column waitlist_free_slot_news boolean not null default false;

alter table public.appointments
  add column hold_kind text check (hold_kind is null or hold_kind in ('waitlist_offer', 'payment')),
  add column hold_expires_at timestamptz;

-- ---------------------------------------------------------------- Einträge und Angebote
create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  service_ids uuid[] not null check (cardinality(service_ids) between 1 and 5),
  staff_id uuid,
  date_from date not null,
  date_to date not null,
  weekdays smallint[] not null default '{1,2,3,4,5,6}' check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'),
  time_from time not null default '09:00',
  time_to time not null default '19:00',
  short_notice boolean not null default false,
  status text not null default 'active' check (status in ('active', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  check (date_to >= date_from and date_to <= date_from + 120),
  check (time_from < time_to),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade
);
create index waitlist_entries_fifo on public.waitlist_entries (tenant_id, status, created_at, id);
alter table public.waitlist_entries enable row level security;
revoke all on public.waitlist_entries from anon, authenticated;

create table public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  customer_id uuid not null,
  appointment_id uuid references public.appointments (id) on delete set null,
  staff_id uuid not null,
  service_id uuid not null,
  slot_starts_at timestamptz not null,
  slot_ends_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index waitlist_offers_open on public.waitlist_offers (status, expires_at) where status = 'offered';
create index waitlist_offers_customer on public.waitlist_offers (customer_id, offered_at desc);
create index waitlist_offers_slot on public.waitlist_offers (tenant_id, staff_id, slot_starts_at);
alter table public.waitlist_offers enable row level security;
revoke all on public.waitlist_offers from anon, authenticated;

create or replace function app.offer_json(o public.waitlist_offers) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'status', o.status, 'serviceId', o.service_id,
    'serviceName', (select s.name from public.services s where s.id = o.service_id),
    'staffName', (select f.display_name from public.staff f where f.id = o.staff_id),
    'start', app.to_wall(o.starts_at, t.time_zone), 'durationMinutes', (extract(epoch from o.ends_at - o.starts_at) / 60)::int,
    'priceEur', (select s.price_eur from public.services s where s.id = o.service_id),
    'offeredAt', o.offered_at, 'expiresAt', o.expires_at, 'respondedAt', o.responded_at,
    'secondsLeft', greatest(0, extract(epoch from o.expires_at - now()))::int, 'appointmentId', o.appointment_id)
  from public.tenants t where t.id = o.tenant_id
$$;

-- Optionale Neuigkeit „Termin frei“, wenn niemand auf der Warteliste passt
create or replace function app.free_slot_news(p_tenant uuid, p_start timestamptz, p_staff uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_t public.tenants;
  v_n public.news_posts;
begin
  select * into v_t from public.tenants where id = p_tenant;
  if not v_t.waitlist_free_slot_news or p_start < now() + interval '30 minutes' then return; end if;
  v_n := app.news_save(p_tenant, null, 'free_slot', 'Termin frei',
    to_char(p_start at time zone v_t.time_zone, 'DD.MM. "um" HH24:MI') || ' Uhr bei ' ||
    (select display_name from public.staff where id = p_staff) || ' – jetzt in der App buchen.',
    null, p_start, 'system');
  perform app.news_publish(p_tenant, v_n.id);
end
$$;

-- Nächstes Angebot für einen freien Slot: FIFO nach Eintragungszeit, genau EINE Person, Slot wird reserviert
create or replace function app.waitlist_offer_next(p_tenant uuid, p_staff uuid, p_slot_start timestamptz, p_slot_end timestamptz)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_t public.tenants;
  v_lead interval;
  v_win interval;
  v_exp timestamptz;
  v_ls timestamp;
  v_e public.waitlist_entries;
  v_s public.services;
  v_hold uuid;
  v_offer uuid;
  v_cat text;
  v_staff_name text;
begin
  select * into v_t from public.tenants where id = p_tenant;
  v_lead := p_slot_start - now();
  if v_lead <= interval '0' then return null; end if;
  -- Antwortfenster = Vorlauf / Divisor, begrenzt auf [min, max]
  v_win := make_interval(secs => greatest(v_t.offer_window_min_minutes * 60,
             least(v_t.offer_window_max_minutes * 60, extract(epoch from v_lead) / v_t.offer_window_divisor)));
  v_exp := now() + v_win;
  -- Fenster ginge über den Terminbeginn hinaus → kein Angebot mehr möglich, Slot ist normal buchbar
  if v_exp > p_slot_start then return null; end if;
  v_ls := p_slot_start at time zone v_t.time_zone;
  select display_name into v_staff_name from public.staff where id = p_staff;

  for v_e in
    select e.* from public.waitlist_entries e
    where e.tenant_id = p_tenant and e.status = 'active'
      and v_ls::date between e.date_from and e.date_to
      and extract(dow from v_ls)::smallint = any (e.weekdays)
      and (e.staff_id is null or e.staff_id = p_staff)
      and (e.short_notice or v_lead >= make_interval(hours => v_t.short_notice_hours))
      and not exists (select 1 from public.waitlist_offers o
                      where o.entry_id = e.id and o.staff_id = p_staff and o.slot_starts_at = p_slot_start)
      and not exists (select 1 from public.waitlist_offers o where o.entry_id = e.id and o.status = 'offered')
      and not exists (select 1 from public.appointments a
                      where a.customer_id = e.customer_id and a.status in ('pending', 'confirmed')
                        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_slot_start, p_slot_end, '[)'))
    order by e.created_at, e.id
  loop
    -- erste gewünschte Leistung, die die Mitarbeiterin anbietet und in Slot + Tageszeit-Fenster passt
    select s.* into v_s
    from unnest(v_e.service_ids) with ordinality u(sid, ord)
    join public.services s on s.id = u.sid and s.tenant_id = p_tenant and s.active
    join public.staff_services ss on ss.service_id = s.id and ss.staff_id = p_staff
    where p_slot_start + make_interval(mins => s.duration_minutes) <= p_slot_end
      and v_ls::time >= v_e.time_from
      and ((p_slot_start + make_interval(mins => s.duration_minutes)) at time zone v_t.time_zone)::time <= v_e.time_to
    order by u.ord limit 1;
    continue when v_s.id is null;

    select key into v_cat from public.service_categories where id = v_s.category_id;
    begin
      insert into public.appointments (tenant_id, customer_id, service_id, staff_id, service_name, category_key, staff_name,
        starts_at, ends_at, duration_minutes, price_eur, status, payment, hold_kind, hold_expires_at)
      values (p_tenant, v_e.customer_id, v_s.id, p_staff, v_s.name, v_cat, v_staff_name, p_slot_start,
        p_slot_start + make_interval(mins => v_s.duration_minutes), v_s.duration_minutes, v_s.price_eur,
        'pending', 'in_salon', 'waitlist_offer', v_exp)
      returning id into v_hold;
    exception when exclusion_violation then
      return null; -- Slot ist inzwischen anderweitig belegt
    end;
    insert into public.waitlist_offers (tenant_id, entry_id, customer_id, appointment_id, staff_id, service_id,
      slot_starts_at, slot_ends_at, starts_at, ends_at, expires_at)
    values (p_tenant, v_e.id, v_e.customer_id, v_hold, p_staff, v_s.id, p_slot_start, p_slot_end, p_slot_start,
      p_slot_start + make_interval(mins => v_s.duration_minutes), v_exp)
    returning id into v_offer;
    -- von der Kundin angefordert → kein Werbe-Häkchen nötig; alle Kanäle gleichzeitig, erster Klick zählt
    perform app.enqueue_notification(p_tenant, v_e.customer_id, 'waitlist', array['push', 'sms', 'email', 'inapp'],
      jsonb_build_object('title', 'Ihr Wunschtermin ist frei',
        'body', v_s.name || ' am ' || to_char(v_ls, 'DD.MM.') || ' um ' || to_char(v_ls, 'HH24:MI') || ' Uhr – bitte bis '
                || to_char(v_exp at time zone v_t.time_zone, 'HH24:MI') || ' Uhr antworten.',
        'url', '/app/angebot/' || v_offer, 'expiresAt', v_exp, 'offerId', v_offer),
      'offer:' || v_offer);
    return v_offer;
  end loop;

  perform app.free_slot_news(p_tenant, p_slot_start, p_staff);
  return null;
end
$$;

-- Angebot schließen (Nein/Ablauf/Zurückziehen): Reservierung lösen, nächste Person
create or replace function app.waitlist_close_offer(p_offer uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.waitlist_offers;
begin
  update public.waitlist_offers set status = p_status, responded_at = now()
  where id = p_offer and status = 'offered' returning * into v_o;
  if v_o.id is null then return; end if;
  update public.appointments set status = 'cancelled', updated_at = now()
  where id = v_o.appointment_id and hold_kind = 'waitlist_offer' and status = 'pending';
  perform app.waitlist_offer_next(v_o.tenant_id, v_o.staff_id, v_o.slot_starts_at, v_o.slot_ends_at);
end
$$;

-- Ablauf-Verarbeitung (pg_cron jede Minute + beim Lesen)
create or replace function app.waitlist_expire_offers() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from public.waitlist_offers where status = 'offered' and expires_at <= now()
              order by expires_at for update skip locked loop
    perform app.waitlist_close_offer(v_id, 'expired');
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- Freigabe eines Slots (Absage/Verschiebung über bestehende Funktionen → Trigger; Salon → salon_release_slot)
create or replace function app.waitlist_release(p_tenant uuid, p_staff uuid, p_start timestamptz, p_end timestamptz)
returns uuid language sql volatile security definer set search_path = '' as $$
  select app.waitlist_offer_next(p_tenant, p_staff, p_start, p_end)
$$;

create or replace function app.on_appointment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.hold_kind is null and old.status in ('pending', 'confirmed') and old.starts_at > now()
     and (new.status = 'cancelled' or new.starts_at <> old.starts_at or new.staff_id <> old.staff_id) then
    begin
      perform app.waitlist_release(old.tenant_id, old.staff_id, old.starts_at, old.ends_at);
    exception when others then
      -- nie die eigentliche Absage/Verschiebung blockieren
      raise warning 'waitlist_release fehlgeschlagen: %', sqlerrm;
    end;
  end if;
  return new;
end
$$;
create trigger appointments_waitlist_release after update on public.appointments
  for each row execute function app.on_appointment_change();

-- ---------------------------------------------------------------- Kundin
create or replace function public.join_waitlist(p_service_ids uuid[], p_staff_id uuid, p_date_from date, p_date_to date,
  p_weekdays smallint[], p_time_from text, p_time_to text, p_short_notice boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
  v_tenant uuid := app.current_tenant();
  v_e public.waitlist_entries;
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if (select count(*) from unnest(p_service_ids) u(sid) join public.services s on s.id = u.sid
      where s.tenant_id = v_tenant and s.active) <> cardinality(p_service_ids) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_staff_id is not null and not exists (select 1 from public.staff where id = p_staff_id and tenant_id = v_tenant and active) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_date_from < (now() at time zone 'Europe/Vienna')::date then raise exception 'invalid_range' using errcode = 'P0001'; end if;
  if (select count(*) from public.waitlist_entries where customer_id = v_id and status = 'active') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.waitlist_entries (tenant_id, customer_id, service_ids, staff_id, date_from, date_to, weekdays,
    time_from, time_to, short_notice)
  values (v_tenant, v_id, p_service_ids, p_staff_id, p_date_from, p_date_to, p_weekdays, p_time_from::time,
    p_time_to::time, coalesce(p_short_notice, false))
  returning * into v_e;
  return to_jsonb(v_e);
end
$$;

create or replace function public.leave_waitlist(p_entry_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_offer uuid;
begin
  update public.waitlist_entries set status = 'cancelled'
  where id = p_entry_id and customer_id = app.my_customer_id() and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select id into v_offer from public.waitlist_offers where entry_id = p_entry_id and status = 'offered';
  if v_offer is not null then perform app.waitlist_close_offer(v_offer, 'withdrawn'); end if;
end
$$;

create or replace function public.my_waitlist() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'serviceIds', e.service_ids,
    'serviceNames', (select array_agg(s.name order by u.ord) from unnest(e.service_ids) with ordinality u(sid, ord)
                     join public.services s on s.id = u.sid),
    'staffId', e.staff_id, 'staffName', (select display_name from public.staff where id = e.staff_id),
    'dateFrom', e.date_from, 'dateTo', e.date_to, 'weekdays', e.weekdays,
    'timeFrom', to_char(e.time_from, 'HH24:MI'), 'timeTo', to_char(e.time_to, 'HH24:MI'),
    'shortNotice', e.short_notice, 'status', e.status, 'createdAt', e.created_at) order by e.created_at desc), '[]'::jsonb)
  from public.waitlist_entries e where e.customer_id = app.my_customer_id() and e.status = 'active'
$$;

-- Offene Angebote der Kundin (verarbeitet vorher abgelaufene – „sofort beim Lesen“)
create or replace function public.my_waitlist_offers() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then return '[]'::jsonb; end if;
  perform app.waitlist_close_offer(o.id, 'expired') from public.waitlist_offers o
  where o.customer_id = v_id and o.status = 'offered' and o.expires_at <= now();
  return coalesce((select jsonb_agg(app.offer_json(o) order by o.expires_at) from public.waitlist_offers o
                   where o.customer_id = v_id and o.status = 'offered'), '[]'::jsonb);
end
$$;

create or replace function public.waitlist_offer(p_offer_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.waitlist_offers;
begin
  select * into v_o from public.waitlist_offers where id = p_offer_id and customer_id = app.my_customer_id();
  if v_o.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_o.status = 'offered' and v_o.expires_at <= now() then
    perform app.waitlist_close_offer(v_o.id, 'expired');
    select * into v_o from public.waitlist_offers where id = p_offer_id;
  end if;
  return app.offer_json(v_o);
end
$$;

-- Ja / Nein – atomar in EINER Funktion; parallele Klicks werden über die Zeilensperre serialisiert
create or replace function public.waitlist_offer_respond(p_offer_id uuid, p_accept boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_o public.waitlist_offers;
begin
  select * into v_o from public.waitlist_offers where id = p_offer_id for update;
  if v_o.id is null or v_o.customer_id is distinct from app.my_customer_id() then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_o.status <> 'offered' then raise exception 'offer_closed' using errcode = 'P0001'; end if;
  if v_o.expires_at <= now() then
    perform app.waitlist_close_offer(v_o.id, 'expired');
    return jsonb_build_object('result', 'expired');
  end if;
  if not p_accept then
    perform app.waitlist_close_offer(v_o.id, 'declined');
    return jsonb_build_object('result', 'declined');
  end if;
  update public.appointments set status = 'confirmed', hold_kind = null, hold_expires_at = null, updated_at = now()
  where id = v_o.appointment_id and hold_kind = 'waitlist_offer' and status = 'pending';
  if not found then raise exception 'offer_closed' using errcode = 'P0001'; end if;
  update public.waitlist_offers set status = 'accepted', responded_at = now() where id = v_o.id;
  update public.waitlist_entries set status = 'fulfilled' where id = v_o.entry_id;
  return jsonb_build_object('result', 'booked', 'appointment', app.appointment_json(v_o.appointment_id));
end
$$;

-- Termine inkl. Reservierungs-Kennzeichen (die Ansicht aus Teil 2 bleibt unverändert)
create or replace function public.my_appointments_v2() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.appointment_json(a.id) || jsonb_build_object('holdKind', a.hold_kind,
    'holdExpiresAt', a.hold_expires_at) order by a.starts_at), '[]'::jsonb)
  from public.appointments a where a.customer_id = app.my_customer_id()
    and (a.hold_kind is null or (a.hold_kind = 'payment' and a.status = 'pending'))
$$;

-- ---------------------------------------------------------------- Salon / CRM
create or replace function public.salon_waitlist() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  perform app.waitlist_expire_offers();
  return public.svc_crm_waitlist(app.current_tenant());
end
$$;

create or replace function public.svc_crm_waitlist(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'customerId', e.customer_id,
        'customerNumber', c.customer_number, 'name', c.first_name || ' ' || c.last_name,
        'serviceNames', (select array_agg(s.name order by u.ord) from unnest(e.service_ids) with ordinality u(sid, ord)
                         join public.services s on s.id = u.sid),
        'staffName', (select display_name from public.staff where id = e.staff_id),
        'dateFrom', e.date_from, 'dateTo', e.date_to, 'weekdays', e.weekdays,
        'timeFrom', to_char(e.time_from, 'HH24:MI'), 'timeTo', to_char(e.time_to, 'HH24:MI'),
        'shortNotice', e.short_notice, 'createdAt', e.created_at) order by e.created_at)
      from public.waitlist_entries e join public.customers c on c.id = e.customer_id
      where e.tenant_id = p_tenant and e.status = 'active'), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(app.offer_json(o) || jsonb_build_object('customerId', o.customer_id)
        order by o.offered_at desc)
      from public.waitlist_offers o where o.tenant_id = p_tenant and o.offered_at > now() - interval '7 days'), '[]'::jsonb))
$$;

-- Salon gibt einen Termin frei (Absage durch den Salon) → Kaskade über den Trigger
create or replace function public.salon_release_slot(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.appointments set status = 'cancelled', updated_at = now()
  where id = p_appointment_id and tenant_id = app.current_tenant() and status in ('pending', 'confirmed') and hold_kind is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return app.appointment_json(p_appointment_id);
end
$$;

create or replace function public.salon_upcoming_appointments() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(app.appointment_json(a.id) || jsonb_build_object('customerName',
      c.first_name || ' ' || c.last_name, 'customerNumber', c.customer_number, 'holdKind', a.hold_kind) order by a.starts_at)
    from public.appointments a join public.customers c on c.id = a.customer_id
    where a.tenant_id = app.current_tenant() and a.starts_at > now() and a.status in ('pending', 'confirmed')
    limit 200), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- Rechte + pg_cron
revoke all on function app.offer_json(public.waitlist_offers), app.free_slot_news(uuid, timestamptz, uuid),
  app.waitlist_offer_next(uuid, uuid, timestamptz, timestamptz), app.waitlist_close_offer(uuid, text),
  app.waitlist_expire_offers(), app.waitlist_release(uuid, uuid, timestamptz, timestamptz), app.on_appointment_change()
  from public, anon, authenticated;
revoke all on function public.join_waitlist(uuid[], uuid, date, date, smallint[], text, text, boolean),
  public.leave_waitlist(uuid), public.my_waitlist(), public.my_waitlist_offers(), public.waitlist_offer(uuid),
  public.waitlist_offer_respond(uuid, boolean), public.my_appointments_v2(), public.salon_waitlist(),
  public.salon_release_slot(uuid), public.salon_upcoming_appointments() from public, anon;
grant execute on function public.join_waitlist(uuid[], uuid, date, date, smallint[], text, text, boolean),
  public.leave_waitlist(uuid), public.my_waitlist(), public.my_waitlist_offers(), public.waitlist_offer(uuid),
  public.waitlist_offer_respond(uuid, boolean), public.my_appointments_v2(), public.salon_waitlist(),
  public.salon_release_slot(uuid), public.salon_upcoming_appointments() to authenticated;
revoke all on function public.svc_crm_waitlist(uuid) from public, anon, authenticated;
grant execute on function public.svc_crm_waitlist(uuid) to service_role;

create extension if not exists pg_cron;
select cron.schedule('waitlist-expire', '* * * * *', 'select app.waitlist_expire_offers()');
