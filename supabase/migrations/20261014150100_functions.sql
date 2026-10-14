-- Schreibende und rechnende Funktionen. Alle: SECURITY DEFINER, fester search_path, Tenant aus app.current_tenant().
-- Fehler werden als P0001 mit Code-Text gemeldet (slot_taken, rate_limited, …) – der Adapter übersetzt sie.

-- ---------------------------------------------------------------- JSON-Formen (= Adapter-Typen)
create or replace function app.profile_json(c public.customers) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'firstName', c.first_name, 'lastName', c.last_name, 'email', c.email, 'phone', c.phone,
    'language', c.language, 'notifyEmail', c.notify_email, 'notifySms', c.notify_sms,
    'marketingConsent', c.marketing_consent, 'marketingConsentAt', c.marketing_consent_at,
    'privacyNoticeAt', c.privacy_notice_at, 'createdAt', c.created_at)
$$;

create or replace function app.appointment_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'customerId', a.customer_id, 'serviceId', a.service_id, 'serviceName', a.service_name,
    'categoryId', a.category_key, 'staffId', a.staff_id, 'staffName', a.staff_name,
    'start', app.to_wall(a.starts_at, t.time_zone), 'durationMinutes', a.duration_minutes,
    'priceEur', a.price_eur,
    'status', case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end,
    'payment', a.payment::text, 'createdAt', a.created_at)
  from public.appointments a join public.tenants t on t.id = a.tenant_id
  where a.id = p_id
$$;

-- ---------------------------------------------------------------- Slot-Prüfung (einzige Stelle)
-- Liegt [p_start, p_end) bei p_staff innerhalb der Öffnungs- bzw. Arbeitszeit und ist frei?
create or replace function app.slot_ok(p_tenant uuid, p_staff uuid, p_start timestamptz, p_end timestamptz, p_ignore uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_ls timestamp;
  v_le timestamp;
  v_dow int;
  v_oh public.opening_hours;
  v_sh public.staff_hours;
begin
  select time_zone into v_tz from public.tenants where id = p_tenant;
  v_ls := p_start at time zone v_tz;
  v_le := p_end at time zone v_tz;
  if v_ls::date <> v_le::date then
    return false;
  end if;
  v_dow := extract(dow from v_ls);

  select * into v_oh from public.opening_hours where tenant_id = p_tenant and weekday = v_dow;
  if not found or v_ls::time < v_oh.opens or v_le::time > v_oh.closes then
    return false;
  end if;

  if exists (select 1 from public.staff_hours h where h.staff_id = p_staff) then
    select * into v_sh from public.staff_hours h where h.staff_id = p_staff and h.weekday = v_dow;
    if not found or v_ls::time < v_sh.starts or v_le::time > v_sh.ends then
      return false;
    end if;
  end if;

  return not exists (
    select 1 from public.appointments a
    where a.staff_id = p_staff
      and a.status in ('pending', 'confirmed')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_start, p_end, '[)')
      and (p_ignore is null or a.id <> p_ignore));
end
$$;

-- ---------------------------------------------------------------- Freie Zeiten (öffentlich lesbar, ohne Personenbezug)
create or replace function public.available_slots(p_service_id uuid, p_staff_id uuid, p_date date)
returns table (start text, staff_id uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.current_tenant();
  v_t public.tenants;
  v_s public.services;
  v_oh public.opening_hours;
  v_today date;
  v_cur timestamp;
  v_st timestamptz;
  v_en timestamptz;
  v_m record;
begin
  if v_tenant is null then
    return;
  end if;
  select * into v_t from public.tenants where id = v_tenant;
  select * into v_s from public.services where id = p_service_id and tenant_id = v_tenant and active;
  if not found then
    return;
  end if;
  v_today := (now() at time zone v_t.time_zone)::date;
  if p_date < v_today or p_date > v_today + v_t.booking_horizon_days then
    return;
  end if;
  select * into v_oh from public.opening_hours where tenant_id = v_tenant and weekday = extract(dow from p_date);
  if not found then
    return;
  end if;

  v_cur := p_date + v_oh.opens;
  while v_cur + make_interval(mins => v_s.duration_minutes) <= p_date + v_oh.closes loop
    v_st := v_cur at time zone v_t.time_zone;
    v_en := v_st + make_interval(mins => v_s.duration_minutes);
    if v_st >= now() + make_interval(mins => v_t.booking_lead_minutes) then
      for v_m in
        select f.id from public.staff f
        join public.staff_services ss on ss.staff_id = f.id and ss.service_id = v_s.id
        where f.tenant_id = v_tenant and f.active and (p_staff_id is null or f.id = p_staff_id)
        order by f.sort_order, f.id
      loop
        if app.slot_ok(v_tenant, v_m.id, v_st, v_en, null) then
          start := app.to_wall(v_st, v_t.time_zone);
          staff_id := v_m.id;
          return next;
          exit;
        end if;
      end loop;
    end if;
    v_cur := v_cur + make_interval(mins => v_t.slot_step_minutes);
  end loop;
end
$$;

-- ---------------------------------------------------------------- Registrierung
create or replace function public.register_customer(
  p_first_name text, p_last_name text, p_phone text, p_language text, p_marketing boolean)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := app.current_tenant();
  v_email text := lower(auth.jwt() ->> 'email');
  v_c public.customers;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_tenant is null then raise exception 'tenant_unknown' using errcode = 'P0001'; end if;
  if v_email is null then raise exception 'email_missing' using errcode = 'P0001'; end if;

  select * into v_c from public.customers where tenant_id = v_tenant and user_id = v_uid;
  if found then
    if v_c.deletion_requested_at is not null then raise exception 'not_found' using errcode = 'P0001'; end if;
    return app.profile_json(v_c);
  end if;
  if exists (select 1 from public.customers where tenant_id = v_tenant and lower(email) = v_email) then
    raise exception 'email_taken' using errcode = 'P0001';
  end if;

  insert into public.customers (tenant_id, user_id, first_name, last_name, email, phone, language,
                                marketing_consent, marketing_consent_at)
  values (v_tenant, v_uid, trim(p_first_name), trim(p_last_name), v_email, nullif(trim(coalesce(p_phone, '')), ''),
          coalesce(nullif(p_language, ''), 'de'), coalesce(p_marketing, false),
          case when coalesce(p_marketing, false) then now() end)
  returning * into v_c;
  return app.profile_json(v_c);
end
$$;

-- ---------------------------------------------------------------- Profil
create or replace function public.update_profile(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
  v_c public.customers;
  v_phone text;
  v_marketing boolean;
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_c from public.customers where id = v_id;

  v_phone := case when p_patch ? 'phone' then nullif(trim(coalesce(p_patch ->> 'phone', '')), '') else v_c.phone end;
  v_marketing := coalesce((p_patch ->> 'marketingConsent')::boolean, v_c.marketing_consent);

  update public.customers set
    first_name = coalesce(nullif(trim(p_patch ->> 'firstName'), ''), first_name),
    last_name = coalesce(nullif(trim(p_patch ->> 'lastName'), ''), last_name),
    phone = v_phone,
    language = coalesce(p_patch ->> 'language', language),
    notify_email = coalesce((p_patch ->> 'notifyEmail')::boolean, notify_email),
    notify_sms = case when v_phone is null then false else coalesce((p_patch ->> 'notifySms')::boolean, notify_sms) end,
    marketing_consent = v_marketing,
    marketing_consent_at = case
      when v_marketing = marketing_consent then marketing_consent_at
      when v_marketing then now()
      else null end
  where id = v_id
  returning * into v_c;
  return app.profile_json(v_c);
end
$$;

-- ---------------------------------------------------------------- Buchen
create or replace function public.book_appointment(p_service_id uuid, p_staff_id uuid, p_start text, p_payment text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant();
  v_cust uuid := app.my_customer_id();
  v_t public.tenants;
  v_s public.services;
  v_staff uuid;
  v_st timestamptz;
  v_en timestamptz;
  v_hour int;
  v_day int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if v_tenant is null then raise exception 'tenant_unknown' using errcode = 'P0001'; end if;
  if v_cust is null then raise exception 'not_registered' using errcode = 'P0001'; end if;
  if p_payment not in ('in_salon', 'online_demo') then raise exception 'invalid_payment' using errcode = 'P0001'; end if;

  select * into v_t from public.tenants where id = v_tenant;
  select * into v_s from public.services where id = p_service_id and tenant_id = v_tenant and active;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  -- Rate-Limit je Kundin
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
    from public.booking_attempts where customer_id = v_cust and created_at > now() - interval '1 day';
  if v_hour >= v_t.max_bookings_per_hour or v_day >= v_t.max_bookings_per_day then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_st := app.from_wall(p_start, v_t.time_zone);
  v_en := v_st + make_interval(mins => v_s.duration_minutes);
  if v_st < now() + make_interval(mins => v_t.booking_lead_minutes)
     or v_st > now() + make_interval(days => v_t.booking_horizon_days) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;

  if p_staff_id is null then
    select f.id into v_staff
    from public.staff f join public.staff_services ss on ss.staff_id = f.id and ss.service_id = v_s.id
    where f.tenant_id = v_tenant and f.active and app.slot_ok(v_tenant, f.id, v_st, v_en, null)
    order by f.sort_order, f.id limit 1;
    if v_staff is null then raise exception 'slot_taken' using errcode = 'P0001'; end if;
  else
    if not exists (select 1 from public.staff f join public.staff_services ss on ss.staff_id = f.id and ss.service_id = v_s.id
                   where f.id = p_staff_id and f.tenant_id = v_tenant and f.active) then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if not app.slot_ok(v_tenant, p_staff_id, v_st, v_en, null) then
      raise exception 'slot_taken' using errcode = 'P0001';
    end if;
    v_staff := p_staff_id;
  end if;

  insert into public.booking_attempts (tenant_id, customer_id) values (v_tenant, v_cust);

  begin
    insert into public.appointments (tenant_id, customer_id, service_id, staff_id, service_name, category_key, staff_name,
                                     starts_at, ends_at, duration_minutes, price_eur, status, payment)
    select v_tenant, v_cust, v_s.id, v_staff, v_s.name, c.key, f.display_name,
           v_st, v_en, v_s.duration_minutes, v_s.price_eur, 'confirmed', p_payment::public.payment_method
    from public.service_categories c, public.staff f
    where c.id = v_s.category_id and f.id = v_staff
    returning id into v_id;
  exception when exclusion_violation then
    -- gleichzeitige Buchung desselben Slots: Postgres hat die zweite abgewiesen
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  return app.appointment_json(v_id);
end
$$;

-- ---------------------------------------------------------------- Absagen / Verschieben (mit Frist)
create or replace function public.cancel_appointment(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cust uuid := app.my_customer_id();
  v_a public.appointments;
  v_notice int;
begin
  if v_cust is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_a from public.appointments where id = p_id and customer_id = v_cust for update;
  if not found or v_a.status not in ('pending', 'confirmed') then raise exception 'not_found' using errcode = 'P0001'; end if;
  select change_notice_hours into v_notice from public.tenants where id = v_a.tenant_id;
  if v_a.starts_at < now() + make_interval(hours => v_notice) then raise exception 'too_late' using errcode = 'P0001'; end if;
  update public.appointments set status = 'cancelled', updated_at = now() where id = p_id;
  return app.appointment_json(p_id);
end
$$;

create or replace function public.reschedule_appointment(p_id uuid, p_new_start text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_cust uuid := app.my_customer_id();
  v_a public.appointments;
  v_t public.tenants;
  v_st timestamptz;
  v_en timestamptz;
begin
  if v_cust is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_a from public.appointments where id = p_id and customer_id = v_cust for update;
  if not found or v_a.status not in ('pending', 'confirmed') then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_t from public.tenants where id = v_a.tenant_id;
  if v_a.starts_at < now() + make_interval(hours => v_t.change_notice_hours) then raise exception 'too_late' using errcode = 'P0001'; end if;

  v_st := app.from_wall(p_new_start, v_t.time_zone);
  v_en := v_st + make_interval(mins => v_a.duration_minutes);
  if v_st < now() + make_interval(mins => v_t.booking_lead_minutes)
     or v_st > now() + make_interval(days => v_t.booking_horizon_days)
     or not app.slot_ok(v_t.id, v_a.staff_id, v_st, v_en, v_a.id) then
    raise exception 'slot_taken' using errcode = 'P0001';
  end if;
  begin
    update public.appointments set starts_at = v_st, ends_at = v_en, updated_at = now() where id = p_id;
  exception when exclusion_violation then
    raise exception 'slot_taken' using errcode = 'P0001';
  end;
  return app.appointment_json(p_id);
end
$$;

-- ---------------------------------------------------------------- DSGVO
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
  v_c public.customers;
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into v_c from public.customers where id = v_id;
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', app.profile_json(v_c),
    'appointments', coalesce((
      select jsonb_agg(app.appointment_json(a.id) order by a.starts_at)
      from public.appointments a where a.customer_id = v_id), '[]'::jsonb));
end
$$;

-- Sagt künftige Termine ab und sperrt den Datensatz. Das endgültige Löschen erledigt die Serverroute
-- /api/account/delete mit dem Secret Key (Kundin + ggf. Auth-User).
create or replace function public.request_account_deletion() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.appointments set status = 'cancelled', updated_at = now()
    where customer_id = v_id and status in ('pending', 'confirmed') and starts_at > now();
  update public.customers set deletion_requested_at = now() where id = v_id;
end
$$;

-- ---------------------------------------------------------------- Rechte
revoke all on all functions in schema app from public, anon, authenticated;
grant execute on function app.request_host(), app.current_tenant(), app.to_wall(timestamptz, text), app.my_customer_id()
  to anon, authenticated, service_role;

revoke all on function public.available_slots(uuid, uuid, date) from public;
revoke all on function public.register_customer(text, text, text, text, boolean) from public, anon;
revoke all on function public.update_profile(jsonb) from public, anon;
revoke all on function public.book_appointment(uuid, uuid, text, text) from public, anon;
revoke all on function public.cancel_appointment(uuid) from public, anon;
revoke all on function public.reschedule_appointment(uuid, text) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.request_account_deletion() from public, anon;

grant execute on function public.available_slots(uuid, uuid, date) to anon, authenticated;
grant execute on function public.register_customer(text, text, text, text, boolean),
  public.update_profile(jsonb),
  public.book_appointment(uuid, uuid, text, text),
  public.cancel_appointment(uuid),
  public.reschedule_appointment(uuid, text),
  public.export_my_data(),
  public.request_account_deletion()
  to authenticated;
