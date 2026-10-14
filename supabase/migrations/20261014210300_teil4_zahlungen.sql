-- Teil 4 / 7: Zahlungs-Vorbereitung (Mock + Stripe vorbereitet). Keine Kartendaten – nur Beträge, Status, Anbieter-Referenzen.
-- NUR ADDITIV (Rückrollung: supabase/rollback/20261014210300.down.sql).

alter table public.tenants
  add column payment_hold_minutes int not null default 15 check (payment_hold_minutes between 5 and 120),
  add column late_cancel_keep_percent int not null default 100 check (late_cancel_keep_percent between 0 and 100);

-- Regeln: pro Leistung, sonst Tenant-Standard (service_id null), sonst „vor Ort“
create table public.payment_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  service_id uuid,
  mode text not null check (mode in ('on_site', 'deposit_percent', 'deposit_fixed', 'full')),
  value numeric(8, 2) not null default 0 check (value >= 0),
  check (mode <> 'deposit_percent' or value between 1 and 100),
  check (mode <> 'deposit_fixed' or value > 0),
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete cascade
);
create unique index payment_rules_service on public.payment_rules (tenant_id, service_id) where service_id is not null;
create unique index payment_rules_default on public.payment_rules (tenant_id) where service_id is null;
alter table public.payment_rules enable row level security;
revoke all on public.payment_rules from anon, authenticated;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Buchhaltung: Zahlungen bleiben bei Löschung von Termin/Kundin erhalten (anonymisiert über set null)
  appointment_id uuid references public.appointments (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  kind text not null check (kind in ('deposit', 'full')),
  status text not null default 'requires_payment'
    check (status in ('requires_payment', 'processing', 'paid', 'failed', 'expired', 'refund_pending', 'refunded', 'partially_refunded', 'cancelled')),
  provider text not null default 'mock' check (provider in ('mock', 'stripe')),
  provider_ref text,
  idempotency_key text not null unique,
  refund_cents int not null default 0 check (refund_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_appointment on public.payments (appointment_id);
create index payments_open on public.payments (status, created_at) where status = 'requires_payment';
alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- Webhook-Ereignisse: jedes nur einmal verarbeiten (Idempotenz)
create table public.payment_events (
  provider text not null,
  event_id text not null,
  type text not null,
  payment_id uuid references public.payments (id) on delete set null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

create or replace function app.payment_json(p public.payments) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'appointmentId', p.appointment_id, 'amountCents', p.amount_cents,
    'currency', p.currency, 'kind', p.kind, 'status', p.status, 'provider', p.provider, 'refundCents', p.refund_cents,
    'createdAt', p.created_at, 'paidAt', p.paid_at)
$$;

create or replace function app.payment_rule(p_tenant uuid, p_service uuid) returns public.payment_rules
language sql stable security definer set search_path = '' as $$
  select r.* from public.payment_rules r
  where r.tenant_id = p_tenant and (r.service_id = p_service or r.service_id is null)
  order by r.service_id nulls last limit 1
$$;

-- Vorschau für die Buchung: was ist wann zu zahlen?
create or replace function public.payment_quote(p_service_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_s public.services;
  v_r public.payment_rules;
  v_total int;
  v_due int;
begin
  select * into v_s from public.services where id = p_service_id and tenant_id = app.current_tenant() and active;
  if v_s.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  v_r := app.payment_rule(v_s.tenant_id, v_s.id);
  v_total := round(v_s.price_eur * 100);
  v_due := case coalesce(v_r.mode, 'on_site')
    when 'deposit_percent' then round(v_total * v_r.value / 100)
    when 'deposit_fixed' then least(v_total, round(v_r.value * 100))
    when 'full' then v_total else 0 end;
  return jsonb_build_object('mode', coalesce(v_r.mode, 'on_site'), 'totalCents', v_total, 'dueOnlineCents', v_due,
    'holdMinutes', (select payment_hold_minutes from public.tenants where id = v_s.tenant_id));
end
$$;

-- Buchen mit Zahlungsregel: nutzt die bestehende book_appointment (Slot-Prüfung, Sperre, Rate-Limit) unverändert
create or replace function public.book_with_payment(p_service_id uuid, p_staff_id uuid, p_start text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_appt jsonb;
  v_q jsonb;
  v_hold int;
  v_p public.payments;
begin
  v_q := public.payment_quote(p_service_id);
  v_appt := public.book_appointment(p_service_id, p_staff_id, p_start,
    case when (v_q->>'dueOnlineCents')::int > 0 then 'online_demo' else 'in_salon' end);
  if (v_q->>'dueOnlineCents')::int = 0 then
    return jsonb_build_object('appointment', v_appt, 'payment', null);
  end if;
  v_hold := (v_q->>'holdMinutes')::int;
  -- ausstehende Zahlung: Termin reserviert (Status pending, unter der Doppelbuchungs-Sperre), verfällt nach X Minuten
  update public.appointments set status = 'pending', hold_kind = 'payment',
    hold_expires_at = now() + make_interval(mins => v_hold), updated_at = now()
  where id = (v_appt->>'id')::uuid;
  insert into public.payments (tenant_id, appointment_id, customer_id, amount_cents, kind, idempotency_key)
  select a.tenant_id, a.id, a.customer_id, (v_q->>'dueOnlineCents')::int,
    case when v_q->>'mode' = 'full' then 'full' else 'deposit' end, 'appt:' || a.id
  from public.appointments a where a.id = (v_appt->>'id')::uuid
  returning * into v_p;
  return jsonb_build_object('appointment', app.appointment_json(v_p.appointment_id)
    || jsonb_build_object('holdKind', 'payment', 'holdExpiresAt', now() + make_interval(mins => v_hold)),
    'payment', app.payment_json(v_p));
end
$$;

create or replace function public.my_payments() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.payment_json(p) order by p.created_at desc), '[]'::jsonb)
  from public.payments p where p.customer_id = app.my_customer_id()
$$;

-- Für den Checkout-Server: nur die eigene, noch offene Zahlung
create or replace function public.payment_for_checkout(p_payment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.payment_json(p) || jsonb_build_object('holdExpiresAt', a.hold_expires_at, 'serviceName', a.service_name)
  from public.payments p join public.appointments a on a.id = p.appointment_id
  where p.id = p_payment_id and p.customer_id = app.my_customer_id() and p.status in ('requires_payment', 'processing')
    and a.hold_kind = 'payment' and a.hold_expires_at > now()
$$;

-- ---------------------------------------------------------------- Server (Secret Key): Anbieter-Ereignisse
create or replace function public.svc_payment_set_provider(p_payment_id uuid, p_provider text, p_ref text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.payments set provider = p_provider, provider_ref = p_ref, status = 'processing', updated_at = now()
  where id = p_payment_id and status in ('requires_payment', 'processing')
$$;

-- Ergebnis: 'paid' | 'duplicate' | 'refund_needed' (Zahlung kam nach Ablauf) | 'not_found'
create or replace function public.svc_payment_succeeded(p_provider text, p_event_id text, p_payment_id uuid, p_ref text,
  p_amount_cents int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_ok boolean;
begin
  insert into public.payment_events (provider, event_id, type, payment_id)
  values (p_provider, p_event_id, 'succeeded', p_payment_id) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_p from public.payments
  where (id = p_payment_id or (p_ref is not null and provider_ref = p_ref)) for update;
  if v_p.id is null then return 'not_found'; end if;
  if v_p.status = 'paid' then return 'duplicate'; end if;
  if p_amount_cents is not null and p_amount_cents <> v_p.amount_cents then
    update public.payments set status = 'failed', updated_at = now() where id = v_p.id;
    return 'amount_mismatch';
  end if;
  update public.appointments set status = 'confirmed', hold_kind = null, hold_expires_at = null, updated_at = now()
  where id = v_p.appointment_id and hold_kind = 'payment' and status = 'pending';
  v_ok := found;
  update public.payments set status = case when v_ok then 'paid' else 'refund_pending' end,
    refund_cents = case when v_ok then 0 else v_p.amount_cents end,
    provider_ref = coalesce(p_ref, provider_ref), paid_at = now(), updated_at = now()
  where id = v_p.id;
  return case when v_ok then 'paid' else 'refund_needed' end;
end
$$;

create or replace function public.svc_payment_failed(p_provider text, p_event_id text, p_payment_id uuid, p_ref text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.payment_events (provider, event_id, type, payment_id)
  values (p_provider, p_event_id, 'failed', p_payment_id) on conflict do nothing;
  if not found then return 'duplicate'; end if;
  update public.payments set status = 'requires_payment', updated_at = now()
  where (id = p_payment_id or provider_ref = p_ref) and status = 'processing';
  return 'failed';
end
$$;

create or replace function public.svc_payment_refunded(p_provider text, p_event_id text, p_ref text, p_refunded_cents int) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.payment_events (provider, event_id, type) values (p_provider, p_event_id, 'refunded') on conflict do nothing;
  if not found then return 'duplicate'; end if;
  update public.payments set refund_cents = p_refunded_cents,
    status = case when p_refunded_cents >= amount_cents then 'refunded' else 'partially_refunded' end, updated_at = now()
  where provider_ref = p_ref or id::text = p_ref;
  return 'refunded';
end
$$;

-- Offene Erstattungen für den Server (der sie beim Anbieter auslöst)
create or replace function public.svc_refunds_pending() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.payment_json(p) || jsonb_build_object('providerRef', p.provider_ref)), '[]'::jsonb)
  from public.payments p where p.status = 'refund_pending'
$$;

-- Erstattungsregel: Absage rechtzeitig (≥ change_notice_hours) → alles zurück; später → Anteil einbehalten
create or replace function app.refund_for_cancel(p_appointment uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a public.appointments;
  v_t public.tenants;
  v_p public.payments;
begin
  select * into v_a from public.appointments where id = p_appointment;
  select * into v_t from public.tenants where id = v_a.tenant_id;
  for v_p in select * from public.payments where appointment_id = p_appointment for update loop
    if v_p.status = 'paid' then
      update public.payments set status = 'refund_pending', updated_at = now(),
        refund_cents = case when v_a.starts_at - now() >= make_interval(hours => v_t.change_notice_hours)
                            then v_p.amount_cents
                            else round(v_p.amount_cents * (100 - v_t.late_cancel_keep_percent) / 100.0) end
      where id = v_p.id;
      update public.payments set status = 'paid' where id = v_p.id and refund_cents = 0;
    elsif v_p.status in ('requires_payment', 'processing') then
      update public.payments set status = 'cancelled', updated_at = now() where id = v_p.id;
    end if;
  end loop;
end
$$;

-- Kundin sagt ab: bestehende Fristprüfung (cancel_appointment) + Erstattung
create or replace function public.cancel_with_refund(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a jsonb;
begin
  v_a := public.cancel_appointment(p_appointment_id);
  perform app.refund_for_cancel(p_appointment_id);
  return jsonb_build_object('appointment', v_a, 'payments', coalesce((select jsonb_agg(app.payment_json(p))
    from public.payments p where p.appointment_id = p_appointment_id), '[]'::jsonb));
end
$$;

-- Salon sagt ab (auch kurzfristig) → Erstattung nach Regel, Slot geht in die Wartelisten-Kaskade
create or replace function public.salon_cancel_appointment(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a jsonb;
begin
  v_a := public.salon_release_slot(p_appointment_id);
  perform app.refund_for_cancel(p_appointment_id);
  return v_a;
end
$$;

-- Unbezahlte Reservierungen verfallen (pg_cron jede Minute)
create or replace function app.expire_unpaid() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n int;
begin
  with gone as (
    update public.appointments set status = 'cancelled', updated_at = now()
    where hold_kind = 'payment' and status = 'pending' and hold_expires_at <= now()
    returning id
  )
  update public.payments p set status = 'expired', updated_at = now()
  from gone where p.appointment_id = gone.id and p.status in ('requires_payment', 'processing');
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- DSGVO-Export inkl. Chat, Warteliste, Zahlungen, Einwilligungen, Push-Geräte (Teil-2-Export bleibt unverändert)
create or replace function public.export_my_data_v2() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  return public.export_my_data() || jsonb_build_object(
    'customerNumber', (select customer_number from public.customers where id = v_id),
    'chat', coalesce((select jsonb_agg(jsonb_build_object('sender', m.sender, 'body', m.body, 'at', m.created_at) order by m.created_at)
                      from public.chat_messages m where m.customer_id = v_id), '[]'::jsonb),
    'waitlist', public.my_waitlist(),
    'waitlistOffers', coalesce((select jsonb_agg(app.offer_json(o) order by o.offered_at) from public.waitlist_offers o
                                where o.customer_id = v_id), '[]'::jsonb),
    'payments', public.my_payments(),
    'marketingConsents', coalesce((select jsonb_agg(jsonb_build_object('channel', c.channel, 'granted', c.granted,
                          'at', c.changed_at, 'source', c.source) order by c.changed_at)
                          from public.marketing_consents c where c.customer_id = v_id), '[]'::jsonb),
    'notificationPreferences', public.my_notification_preferences(),
    'pushDevices', coalesce((select jsonb_agg(jsonb_build_object('userAgent', s.user_agent, 'createdAt', s.created_at))
                             from public.push_subscriptions s where s.customer_id = v_id), '[]'::jsonb),
    'newsRead', coalesce((select jsonb_agg(jsonb_build_object('newsId', r.news_id, 'at', r.read_at))
                          from public.news_reads r where r.customer_id = v_id), '[]'::jsonb));
end
$$;

-- ---------------------------------------------------------------- Rechte + pg_cron
revoke all on function app.payment_json(public.payments), app.payment_rule(uuid, uuid), app.refund_for_cancel(uuid),
  app.expire_unpaid() from public, anon, authenticated;
revoke all on function public.payment_quote(uuid), public.book_with_payment(uuid, uuid, text), public.my_payments(),
  public.payment_for_checkout(uuid), public.cancel_with_refund(uuid), public.salon_cancel_appointment(uuid),
  public.export_my_data_v2() from public, anon;
grant execute on function public.payment_quote(uuid), public.book_with_payment(uuid, uuid, text), public.my_payments(),
  public.payment_for_checkout(uuid), public.cancel_with_refund(uuid), public.salon_cancel_appointment(uuid),
  public.export_my_data_v2() to authenticated;
revoke all on function public.svc_payment_set_provider(uuid, text, text),
  public.svc_payment_succeeded(text, text, uuid, text, int), public.svc_payment_failed(text, text, uuid, text),
  public.svc_payment_refunded(text, text, text, int), public.svc_refunds_pending() from public, anon, authenticated;
grant execute on function public.svc_payment_set_provider(uuid, text, text),
  public.svc_payment_succeeded(text, text, uuid, text, int), public.svc_payment_failed(text, text, uuid, text),
  public.svc_payment_refunded(text, text, text, int), public.svc_refunds_pending() to service_role;

select cron.schedule('payments-expire', '* * * * *', 'select app.expire_unpaid()');
