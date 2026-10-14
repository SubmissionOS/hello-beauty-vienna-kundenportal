-- Teil 4 / 1–2: Kundennummer, CRM-Verknüpfung, unveränderliches Protokoll, Schnittstellen-Schlüssel.
-- NUR ADDITIV (Rückrollung: supabase/rollback/20261014210000.down.sql).

-- ---------------------------------------------------------------- Kundennummer HB-XXXXXX
-- Zeichensatz ohne 0/O/1/I (32 Zeichen → 32^6 ≈ 1,07 Mrd. Kombinationen), zufällig, eindeutig pro Tenant.
alter table public.customers add column customer_number text
  check (customer_number is null or customer_number ~ '^HB-[2-9A-HJ-NP-Z]{6}$');
create unique index customers_tenant_number on public.customers (tenant_id, customer_number);

create or replace function app.new_customer_number(p_tenant uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_num text;
  i int;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_num := 'HB-';
    for i in 0..5 loop
      v_num := v_num || substr(v_chars, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.customers where tenant_id = p_tenant and customer_number = v_num);
  end loop;
  return v_num;
end
$$;

update public.customers set customer_number = app.new_customer_number(tenant_id) where customer_number is null;
alter table public.customers alter column customer_number set not null;

create or replace function app.assign_customer_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.customer_number is null then
    new.customer_number := app.new_customer_number(new.tenant_id);
  end if;
  return new;
end
$$;
create trigger customers_assign_number before insert on public.customers
  for each row execute function app.assign_customer_number();

-- ---------------------------------------------------------------- CRM-Verknüpfung + Protokoll
create table public.crm_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  crm_customer_ref text not null check (length(crm_customer_ref) between 1 and 100),
  status text not null default 'linked' check (status in ('linked', 'unlinked')),
  linked_by text not null,
  linked_at timestamptz not null default now(),
  unlinked_by text,
  unlinked_at timestamptz,
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create unique index crm_links_active_customer on public.crm_links (customer_id) where status = 'linked';
create unique index crm_links_active_ref on public.crm_links (tenant_id, crm_customer_ref) where status = 'linked';
alter table public.crm_links enable row level security;
revoke all on public.crm_links from anon, authenticated;

create table public.crm_audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  customer_id uuid,
  crm_customer_ref text,
  details jsonb not null default '{}'::jsonb
);
create index crm_audit_tenant on public.crm_audit_log (tenant_id, at desc);
alter table public.crm_audit_log enable row level security;
revoke all on public.crm_audit_log from anon, authenticated;

-- Unveränderlich: kein UPDATE/DELETE (auch nicht mit Secret Key). Kundinnen-Löschung anonymisiert nicht nötig –
-- das Protokoll enthält nur IDs und Aktionen, keine Inhalte.
create or replace function app.audit_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- einzige Ausnahme: der ganze Tenant wird entfernt (Kaskade)
  if tg_op = 'DELETE' and not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
    return old;
  end if;
  raise exception 'crm_audit_log ist unveränderlich' using errcode = 'P0001';
end
$$;
create trigger crm_audit_no_update before update or delete on public.crm_audit_log
  for each row execute function app.audit_immutable();

-- ---------------------------------------------------------------- Schnittstellen-Schlüssel (Geheimnis nur in der Server-Umgebung)
create table public.crm_bridge_keys (
  key_id text primary key check (key_id ~ '^[a-z0-9-]{3,40}$'),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  note text
);
create table public.crm_request_nonces (
  key_id text not null references public.crm_bridge_keys (key_id) on delete cascade,
  nonce text not null check (length(nonce) between 16 and 100),
  seen_at timestamptz not null default now(),
  primary key (key_id, nonce)
);
create table public.crm_rate (
  key_id text not null references public.crm_bridge_keys (key_id) on delete cascade,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key_id, window_start)
);
alter table public.crm_bridge_keys enable row level security;
alter table public.crm_request_nonces enable row level security;
alter table public.crm_rate enable row level security;
revoke all on public.crm_bridge_keys, public.crm_request_nonces, public.crm_rate from anon, authenticated;

-- Wiederholungsschutz + Rate-Limit in EINEM Schritt; liefert den Tenant des Schlüssels
create or replace function public.svc_crm_admit(p_key_id text, p_nonce text, p_limit_per_min int default 120)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_hits int;
begin
  select tenant_id into v_tenant from public.crm_bridge_keys where key_id = p_key_id and active;
  if v_tenant is null then raise exception 'unknown_key' using errcode = 'P0001'; end if;
  delete from public.crm_request_nonces where seen_at < now() - interval '10 minutes';
  begin
    insert into public.crm_request_nonces (key_id, nonce) values (p_key_id, p_nonce);
  exception when unique_violation then
    raise exception 'replay' using errcode = 'P0001';
  end;
  insert into public.crm_rate (key_id, window_start, hits) values (p_key_id, date_trunc('minute', now()), 1)
  on conflict (key_id, window_start) do update set hits = public.crm_rate.hits + 1
  returning hits into v_hits;
  delete from public.crm_rate where window_start < now() - interval '1 hour';
  if v_hits > p_limit_per_min then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  return v_tenant;
end
$$;

create or replace function app.audit(p_tenant uuid, p_actor text, p_action text, p_customer uuid, p_ref text, p_details jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.crm_audit_log (tenant_id, actor, action, customer_id, crm_customer_ref, details)
  values (p_tenant, p_actor, p_action, p_customer, p_ref, coalesce(p_details, '{}'::jsonb))
$$;

create or replace function app.customer_json(c public.customers) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'customerNumber', c.customer_number, 'firstName', c.first_name,
    'lastName', c.last_name, 'email', c.email, 'phone', c.phone, 'language', c.language, 'createdAt', c.created_at,
    'crmRef', (select l.crm_customer_ref from public.crm_links l where l.customer_id = c.id and l.status = 'linked'))
$$;

-- Suche (Kundennummer exakt, Name/E-Mail/Telefon als Teiltreffer) – nur im eigenen Tenant
create or replace function public.svc_crm_search(p_tenant uuid, p_query text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.customer_json(c) order by c.last_name, c.first_name), '[]'::jsonb)
  from (select * from public.customers c
        where c.tenant_id = p_tenant and c.deletion_requested_at is null
          and length(btrim(coalesce(p_query, ''))) >= 2
          and (upper(c.customer_number) = upper(btrim(p_query))
               or lower(c.email) like '%' || lower(btrim(p_query)) || '%'
               or lower(c.first_name || ' ' || c.last_name) like '%' || lower(btrim(p_query)) || '%'
               or regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g')
                  like '%' || regexp_replace(btrim(p_query), '[^0-9+]', '', 'g') || '%')
        limit 25) c
$$;

-- Vorschläge: nur bei Übereinstimmung der (per Code bestätigten) E-Mail oder der Telefonnummer – nie automatisch verknüpfen
create or replace function public.svc_crm_link_suggestions(p_tenant uuid, p_email text, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.customer_json(c) || jsonb_build_object('matchedBy', m.by) order by m.by), '[]'::jsonb)
  from public.customers c
  join lateral (select case
      when p_email is not null and lower(c.email) = lower(btrim(p_email)) then 'email'
      when p_phone is not null and c.phone is not null
           and regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g') then 'phone'
    end as by) m on m.by is not null
  where c.tenant_id = p_tenant and c.deletion_requested_at is null
$$;

create or replace function public.svc_crm_link(p_tenant uuid, p_customer uuid, p_ref text, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_l public.crm_links;
begin
  if not exists (select 1 from public.customers where id = p_customer and tenant_id = p_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crm_links where customer_id = p_customer and status = 'linked') then
    raise exception 'already_linked' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crm_links where tenant_id = p_tenant and crm_customer_ref = p_ref and status = 'linked') then
    raise exception 'ref_in_use' using errcode = 'P0001';
  end if;
  insert into public.crm_links (tenant_id, customer_id, crm_customer_ref, linked_by)
  values (p_tenant, p_customer, p_ref, p_actor) returning * into v_l;
  perform app.audit(p_tenant, p_actor, 'link', p_customer, p_ref, '{}');
  return to_jsonb(v_l);
end
$$;

create or replace function public.svc_crm_unlink(p_tenant uuid, p_customer uuid, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_l public.crm_links;
begin
  update public.crm_links set status = 'unlinked', unlinked_by = p_actor, unlinked_at = now()
  where customer_id = p_customer and tenant_id = p_tenant and status = 'linked' returning * into v_l;
  if v_l.id is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  perform app.audit(p_tenant, p_actor, 'unlink', p_customer, v_l.crm_customer_ref, '{}');
  return to_jsonb(v_l);
end
$$;

create or replace function public.svc_crm_customer(p_tenant uuid, p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.customer_json(c) from public.customers c where c.id = p_customer and c.tenant_id = p_tenant
$$;

create or replace function public.svc_crm_appointments(p_tenant uuid, p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.appointment_json(a.id) order by a.starts_at), '[]'::jsonb)
  from public.appointments a where a.customer_id = p_customer and a.tenant_id = p_tenant
$$;

-- Chat über die Schnittstelle (Absender „Salon“, Name aus dem CRM)
create or replace function public.svc_crm_chat_threads(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t order by t->>'lastAt' desc), '[]'::jsonb) from (
    select jsonb_build_object('customerId', c.id, 'customerNumber', c.customer_number,
      'name', c.first_name || ' ' || c.last_name, 'lastAt', max(m.created_at),
      'lastBody', (array_agg(m.body order by m.created_at desc))[1],
      'unread', count(*) filter (where m.sender = 'customer' and m.read_by_salon_at is null)) t
    from public.chat_messages m join public.customers c on c.id = m.customer_id
    where m.tenant_id = p_tenant group by c.id, c.customer_number, c.first_name, c.last_name) x
$$;

create or replace function public.svc_crm_chat_messages(p_tenant uuid, p_customer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
  from public.chat_messages m where m.customer_id = p_customer and m.tenant_id = p_tenant
$$;

create or replace function public.svc_crm_chat_send(p_tenant uuid, p_customer uuid, p_body text, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_m public.chat_messages;
begin
  if not exists (select 1 from public.customers where id = p_customer and tenant_id = p_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (tenant_id, customer_id, sender, sender_name, body)
  values (p_tenant, p_customer, 'salon', left(p_actor, 60), btrim(p_body)) returning * into v_m;
  perform app.enqueue_notification(p_tenant, p_customer, 'chat', array['push', 'email'],
    jsonb_build_object('title', 'Neue Nachricht von Hello Beauty', 'body', left(v_m.body, 140), 'url', '/app/nachrichten'),
    'chat:' || v_m.id);
  perform app.audit(p_tenant, p_actor, 'chat_send', p_customer, null, jsonb_build_object('messageId', v_m.id));
  return to_jsonb(v_m);
end
$$;

create or replace function public.svc_crm_chat_read(p_tenant uuid, p_customer uuid, p_actor text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.chat_messages set read_by_salon_at = now()
  where customer_id = p_customer and tenant_id = p_tenant and sender = 'customer' and read_by_salon_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Kundin: eigene Kundennummer und Verknüpfungsstatus
create or replace function public.my_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('customerNumber', c.customer_number, 'avatarPath', c.avatar_path,
    'crmLinked', exists (select 1 from public.crm_links l where l.customer_id = c.id and l.status = 'linked'))
  from public.customers c where c.id = app.my_customer_id()
$$;

-- ---------------------------------------------------------------- Rechte
revoke all on function app.new_customer_number(uuid), app.assign_customer_number(), app.audit_immutable(),
  app.audit(uuid, text, text, uuid, text, jsonb), app.customer_json(public.customers) from public, anon, authenticated;
revoke all on function public.svc_crm_admit(text, text, int), public.svc_crm_search(uuid, text),
  public.svc_crm_link_suggestions(uuid, text, text), public.svc_crm_link(uuid, uuid, text, text),
  public.svc_crm_unlink(uuid, uuid, text), public.svc_crm_customer(uuid, uuid), public.svc_crm_appointments(uuid, uuid),
  public.svc_crm_chat_threads(uuid), public.svc_crm_chat_messages(uuid, uuid), public.svc_crm_chat_send(uuid, uuid, text, text),
  public.svc_crm_chat_read(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_crm_admit(text, text, int), public.svc_crm_search(uuid, text),
  public.svc_crm_link_suggestions(uuid, text, text), public.svc_crm_link(uuid, uuid, text, text),
  public.svc_crm_unlink(uuid, uuid, text), public.svc_crm_customer(uuid, uuid), public.svc_crm_appointments(uuid, uuid),
  public.svc_crm_chat_threads(uuid), public.svc_crm_chat_messages(uuid, uuid), public.svc_crm_chat_send(uuid, uuid, text, text),
  public.svc_crm_chat_read(uuid, uuid, text) to service_role;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- Schlüssel für Hello Beauty (Geheimnis: CRM_BRIDGE_SECRET in der Server-Umgebung)
insert into public.crm_bridge_keys (key_id, tenant_id, note)
select 'hello-beauty-crm', id, 'CRM Hello Beauty (Repo hello-beauty-vienna)' from public.tenants where slug = 'hello-beauty'
on conflict (key_id) do nothing;
