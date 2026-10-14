-- Rückrollung von 20261014230000_teil4_demo_robust.sql: Fassung aus 20261014220000 wiederherstellen

create or replace function public.svc_demo_refresh(p_tenant uuid, p_customer uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_t public.tenants;
  v_e public.waitlist_entries;
  v_s public.services;
  v_staff public.staff;
  v_day date;
  v_min int;
  v_start timestamptz;
  v_end timestamptz;
  v_exp timestamptz;
  v_hold uuid;
  v_offer uuid;
  v_pay_appt uuid;
  v_cat text;
  v_due int;
  v_r public.payment_rules;
begin
  select * into v_t from public.tenants where id = p_tenant;
  if not exists (select 1 from public.customers where id = p_customer and tenant_id = p_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- alte Demo-Reste aufräumen: nicht angenommene Angebote samt Reservierung, verfallene Zahlungs-Reservierungen
  delete from public.waitlist_offers where customer_id = p_customer and status <> 'accepted';
  delete from public.appointments where customer_id = p_customer and hold_kind = 'waitlist_offer';
  delete from public.payments where customer_id = p_customer and status in ('expired', 'cancelled', 'requires_payment', 'processing');
  delete from public.appointments where customer_id = p_customer and hold_kind = 'payment';

  -- Angebot: erster freier Slot für die erste Wunschleistung, 2–10 Tage voraus, 10–16 Uhr
  select * into v_e from public.waitlist_entries
  where customer_id = p_customer and tenant_id = p_tenant and status = 'active' order by created_at limit 1;
  if v_e.id is not null then
    select s.* into v_s from public.services s where s.id = v_e.service_ids[1] and s.active;
    <<slots>>
    for v_day in select generate_series(current_date + 2, current_date + 10, interval '1 day')::date loop
      continue when not (extract(dow from v_day)::smallint = any (v_e.weekdays));
      for v_min in select generate_series(600, 960 - v_s.duration_minutes, 30) loop
        for v_staff in select f.* from public.staff f join public.staff_services ss on ss.staff_id = f.id
                       where ss.service_id = v_s.id and f.active order by f.sort_order loop
          v_start := (v_day + make_interval(mins => v_min)) at time zone v_t.time_zone;
          v_end := v_start + make_interval(mins => v_s.duration_minutes);
          if app.slot_ok(p_tenant, v_staff.id, v_start, v_end, null) then
            v_exp := now() + make_interval(secs => greatest(v_t.offer_window_min_minutes * 60,
                       least(v_t.offer_window_max_minutes * 60, extract(epoch from v_start - now()) / v_t.offer_window_divisor)));
            select key into v_cat from public.service_categories where id = v_s.category_id;
            insert into public.appointments (tenant_id, customer_id, service_id, staff_id, service_name, category_key, staff_name,
              starts_at, ends_at, duration_minutes, price_eur, status, payment, hold_kind, hold_expires_at)
            values (p_tenant, p_customer, v_s.id, v_staff.id, v_s.name, v_cat, v_staff.display_name, v_start, v_end,
              v_s.duration_minutes, v_s.price_eur, 'pending', 'in_salon', 'waitlist_offer', v_exp)
            returning id into v_hold;
            insert into public.waitlist_offers (tenant_id, entry_id, customer_id, appointment_id, staff_id, service_id,
              slot_starts_at, slot_ends_at, starts_at, ends_at, expires_at)
            values (p_tenant, v_e.id, p_customer, v_hold, v_staff.id, v_s.id, v_start, v_end, v_start, v_end, v_exp)
            returning id into v_offer;
            exit slots;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  -- offene Test-Zahlung: Laser-Leistung mit Anzahlung laut Zahlungsregel, 12–20 Tage voraus
  select s.* into v_s from public.services s join public.service_categories k on k.id = s.category_id
  where s.tenant_id = p_tenant and s.active and k.key = 'laser' order by s.sort_order limit 1;
  if v_s.id is not null then
    v_r := app.payment_rule(p_tenant, v_s.id);
    v_due := case coalesce(v_r.mode, 'on_site')
      when 'deposit_percent' then round(v_s.price_eur * 100 * v_r.value / 100)
      when 'deposit_fixed' then least(round(v_s.price_eur * 100), round(v_r.value * 100))
      when 'full' then round(v_s.price_eur * 100) else 0 end;
    if coalesce(v_due, 0) > 0 then
      <<pay>>
      for v_day in select generate_series(current_date + 12, current_date + 20, interval '1 day')::date loop
        continue when extract(dow from v_day) = 0;
        for v_staff in select f.* from public.staff f join public.staff_services ss on ss.staff_id = f.id
                       where ss.service_id = v_s.id and f.active order by f.sort_order loop
          v_start := (v_day + time '15:00') at time zone v_t.time_zone;
          v_end := v_start + make_interval(mins => v_s.duration_minutes);
          if app.slot_ok(p_tenant, v_staff.id, v_start, v_end, null) then
            select key into v_cat from public.service_categories where id = v_s.category_id;
            insert into public.appointments (tenant_id, customer_id, service_id, staff_id, service_name, category_key, staff_name,
              starts_at, ends_at, duration_minutes, price_eur, status, payment, hold_kind, hold_expires_at)
            values (p_tenant, p_customer, v_s.id, v_staff.id, v_s.name, v_cat, v_staff.display_name, v_start, v_end,
              v_s.duration_minutes, v_s.price_eur, 'pending', 'online_demo', 'payment',
              now() + make_interval(mins => v_t.payment_hold_minutes))
            returning id into v_pay_appt;
            insert into public.payments (tenant_id, appointment_id, customer_id, amount_cents, kind, idempotency_key)
            values (p_tenant, v_pay_appt, p_customer, v_due, 'deposit', 'appt:' || v_pay_appt);
            exit pay;
          end if;
        end loop;
      end loop;
    end if;
  end if;

  return jsonb_build_object('offerId', v_offer, 'paymentAppointmentId', v_pay_appt);
end
$$;
revoke all on function public.svc_demo_refresh(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_demo_refresh(uuid, uuid) to service_role;
