-- Teil 3 (nachgezogen): Salon-Zugänge, Werbe-Einwilligung pro Kanal, Benachrichtigungs-Einstellungen,
-- Chat, Benachrichtigungs-Warteschlange, Profilbild. NUR ADDITIV (Rückrollung: supabase/rollback/20261014200000.down.sql).

-- ---------------------------------------------------------------- Salon-Zugänge (/salon)
create table public.salon_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  display_name text not null check (length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
alter table public.salon_members enable row level security;
revoke all on public.salon_members from anon, authenticated;
grant select on public.salon_members to authenticated;
create policy own_membership on public.salon_members for select to authenticated
  using (user_id = (select auth.uid()) and tenant_id = (select app.current_tenant()));

create or replace function app.is_salon_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m
                 where m.user_id = auth.uid() and m.tenant_id = app.current_tenant())
$$;

-- ---------------------------------------------------------------- Kundinnen: Profilbild
alter table public.customers add column avatar_path text check (avatar_path is null or length(avatar_path) < 300);

-- ---------------------------------------------------------------- Werbe-Einwilligung pro Kanal (unveränderliche Historie)
create table public.marketing_consents (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  channel text not null check (channel in ('email', 'sms', 'push')),
  granted boolean not null,
  changed_at timestamptz not null default now(),
  source text not null default 'app' check (source in ('app', 'registrierung', 'salon', 'migration')),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index marketing_consents_customer on public.marketing_consents (customer_id, channel, changed_at desc);
alter table public.marketing_consents enable row level security;
revoke all on public.marketing_consents from anon, authenticated;
grant select on public.marketing_consents to authenticated;
create policy own_consents on public.marketing_consents for select to authenticated
  using (customer_id = (select app.my_customer_id()));

-- aktueller Stand je Kanal
create or replace function app.has_marketing_consent(p_customer uuid, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.granted from public.marketing_consents c
                   where c.customer_id = p_customer and c.channel = p_channel
                   order by c.changed_at desc, c.id desc limit 1), false)
$$;

-- Bestand: bisherige E-Mail-Einwilligung als Historie übernehmen
insert into public.marketing_consents (tenant_id, customer_id, channel, granted, changed_at, source)
select tenant_id, id, 'email', true, coalesce(marketing_consent_at, created_at), 'migration'
from public.customers where marketing_consent;

-- Änderungen über die bestehende update_profile-Funktion (main) ebenfalls protokollieren
create or replace function app.log_email_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.marketing_consent is distinct from old.marketing_consent then
    insert into public.marketing_consents (tenant_id, customer_id, channel, granted, source)
    values (new.tenant_id, new.id, 'email', new.marketing_consent, 'app');
  end if;
  return new;
end
$$;
create trigger customers_log_email_consent after update of marketing_consent on public.customers
  for each row execute function app.log_email_consent();

-- Einwilligung bei der Registrierung (register_customer aus Teil 2) ebenfalls protokollieren
create or replace function app.log_registration_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.marketing_consent then
    insert into public.marketing_consents (tenant_id, customer_id, channel, granted, changed_at, source)
    values (new.tenant_id, new.id, 'email', true, coalesce(new.marketing_consent_at, now()), 'registrierung');
  end if;
  return new;
end
$$;
create trigger customers_log_registration_consent after insert on public.customers
  for each row execute function app.log_registration_consent();

create or replace function public.set_marketing_consent(p_channel text, p_granted boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
  v_tenant uuid := app.current_tenant();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_channel not in ('email', 'sms', 'push') then raise exception 'invalid_channel' using errcode = 'P0001'; end if;
  if p_channel = 'email' then
    -- hält die Spalte aus Teil 2 synchron (Trigger schreibt die Historie)
    update public.customers set marketing_consent = p_granted,
      marketing_consent_at = case when p_granted then now() else null end
    where id = v_id and marketing_consent is distinct from p_granted;
    if not found and not exists (select 1 from public.marketing_consents where customer_id = v_id and channel = 'email') then
      insert into public.marketing_consents (tenant_id, customer_id, channel, granted) values (v_tenant, v_id, 'email', p_granted);
    end if;
  else
    insert into public.marketing_consents (tenant_id, customer_id, channel, granted) values (v_tenant, v_id, p_channel, p_granted);
  end if;
  return public.my_consents();
end
$$;

create or replace function public.my_consents() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(ch, jsonb_build_object('granted', coalesce(c.granted, false), 'changedAt', c.changed_at)), '{}'::jsonb)
  from unnest(array['email', 'sms', 'push']) ch
  left join lateral (select m.granted, m.changed_at from public.marketing_consents m
                     where m.customer_id = app.my_customer_id() and m.channel = ch
                     order by m.changed_at desc, m.id desc limit 1) c on true
$$;

-- ---------------------------------------------------------------- Benachrichtigungs-Einstellungen pro Kanal und Typ
create table public.notification_preferences (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  kind text not null check (kind in ('reminder', 'chat', 'news', 'offer', 'waitlist', 'payment')),
  channel text not null check (channel in ('inapp', 'email', 'sms', 'push')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (customer_id, kind, channel),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select on public.notification_preferences to authenticated;
create policy own_prefs on public.notification_preferences for select to authenticated
  using (customer_id = (select app.my_customer_id()));

-- Standard, solange die Kundin nichts geändert hat
create or replace function app.default_pref(p_kind text, p_channel text) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_channel = 'inapp' then true
    when p_kind = 'reminder' then p_channel = 'email'
    when p_kind = 'chat' then p_channel in ('push', 'email')
    when p_kind = 'waitlist' then p_channel in ('push', 'sms', 'email')
    when p_kind = 'payment' then p_channel = 'email'
    when p_kind = 'news' then false
    when p_kind = 'offer' then p_channel in ('push', 'email')  -- greift nur mit Werbe-Einwilligung (§ 174 TKG)
    else false end
$$;

create or replace function app.pref_enabled(p_customer uuid, p_kind text, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.enabled from public.notification_preferences p
                   where p.customer_id = p_customer and p.kind = p_kind and p.channel = p_channel),
                  app.default_pref(p_kind, p_channel))
$$;

create or replace function public.my_notification_preferences() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(k, (select jsonb_object_agg(ch, app.pref_enabled(app.my_customer_id(), k, ch))
                               from unnest(array['inapp', 'email', 'sms', 'push']) ch))
  from unnest(array['reminder', 'chat', 'news', 'offer', 'waitlist', 'payment']) k
  where app.my_customer_id() is not null
$$;

create or replace function public.set_notification_preference(p_kind text, p_channel text, p_enabled boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.notification_preferences (tenant_id, customer_id, kind, channel, enabled)
  values (app.current_tenant(), v_id, p_kind, p_channel, p_enabled)
  on conflict (customer_id, kind, channel) do update set enabled = excluded.enabled, updated_at = now();
  return public.my_notification_preferences();
end
$$;

-- ---------------------------------------------------------------- Benachrichtigungs-Warteschlange (nur Server)
create table public.notification_queue (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid,
  channel text not null check (channel in ('inapp', 'email', 'sms', 'push')),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  not_before timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index notification_queue_due on public.notification_queue (status, not_before) where status = 'queued';
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

-- Einreihen mit allen Regeln: Einstellungen je Typ/Kanal; Werbung nur mit Einwilligung des Kanals; SMS nur mit Nummer
create or replace function app.enqueue_notification(
  p_tenant uuid, p_customer uuid, p_kind text, p_channels text[], p_payload jsonb, p_dedupe text default null)
returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ch text;
  v_n int := 0;
  v_marketing boolean := p_kind in ('offer', 'news_promo');
  v_phone text;
begin
  select phone into v_phone from public.customers where id = p_customer;
  foreach v_ch in array p_channels loop
    if v_ch <> 'inapp' and v_marketing and not app.has_marketing_consent(p_customer, v_ch) then continue; end if;
    if not app.pref_enabled(p_customer, case when p_kind = 'news_promo' then 'offer' else p_kind end, v_ch) then continue; end if;
    if v_ch = 'sms' and v_phone is null then continue; end if;
    insert into public.notification_queue (tenant_id, customer_id, channel, kind, payload, dedupe_key)
    values (p_tenant, p_customer, v_ch, p_kind, p_payload, case when p_dedupe is null then null else p_dedupe || ':' || v_ch end)
    on conflict (dedupe_key) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- ---------------------------------------------------------------- Chat Kundin ↔ Salon
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  sender text not null check (sender in ('customer', 'salon')),
  sender_name text,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_by_customer_at timestamptz,
  read_by_salon_at timestamptz,
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
create index chat_messages_thread on public.chat_messages (customer_id, created_at);
create index chat_messages_tenant on public.chat_messages (tenant_id, created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
create policy own_chat on public.chat_messages for select to authenticated
  using (customer_id = (select app.my_customer_id()));
create policy salon_chat on public.chat_messages for select to authenticated
  using (tenant_id = (select app.current_tenant()) and (select app.is_salon_member()));

create or replace function public.send_chat_message(p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
  v_tenant uuid := app.current_tenant();
  v_m public.chat_messages;
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if (select count(*) from public.chat_messages where customer_id = v_id and sender = 'customer'
      and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (tenant_id, customer_id, sender, body)
  values (v_tenant, v_id, 'customer', btrim(p_body)) returning * into v_m;
  return to_jsonb(v_m);
end
$$;

create or replace function public.mark_chat_read() returns void
language sql volatile security definer set search_path = '' as $$
  update public.chat_messages set read_by_customer_at = now()
  where customer_id = app.my_customer_id() and sender = 'salon' and read_by_customer_at is null
$$;

-- Salon-Seite (für /salon und die CRM-Schnittstelle)
create or replace function public.salon_send_chat_message(p_customer_id uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid := app.current_tenant();
  v_name text;
  v_m public.chat_messages;
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and tenant_id = v_tenant) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select display_name into v_name from public.salon_members where user_id = auth.uid() and tenant_id = v_tenant;
  insert into public.chat_messages (tenant_id, customer_id, sender, sender_name, body)
  values (v_tenant, p_customer_id, 'salon', v_name, btrim(p_body)) returning * into v_m;
  perform app.enqueue_notification(v_tenant, p_customer_id, 'chat', array['push', 'email'],
    jsonb_build_object('title', 'Neue Nachricht von Hello Beauty', 'body', left(v_m.body, 140), 'url', '/app/nachrichten'),
    'chat:' || v_m.id);
  return to_jsonb(v_m);
end
$$;

create or replace function public.salon_mark_chat_read(p_customer_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  update public.chat_messages set read_by_salon_at = now()
  where customer_id = p_customer_id and tenant_id = app.current_tenant() and sender = 'customer' and read_by_salon_at is null;
end
$$;

create or replace function public.salon_chat_threads() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(t order by t->>'lastAt' desc) from (
      select jsonb_build_object(
        'customerId', c.id, 'name', c.first_name || ' ' || c.last_name,
        'lastAt', max(m.created_at),
        'lastBody', (array_agg(m.body order by m.created_at desc))[1],
        'unread', count(*) filter (where m.sender = 'customer' and m.read_by_salon_at is null)) t
      from public.chat_messages m join public.customers c on c.id = m.customer_id
      where m.tenant_id = app.current_tenant()
      group by c.id, c.first_name, c.last_name) x), '[]'::jsonb);
end
$$;

-- ---------------------------------------------------------------- Profilbild (Storage)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Pfad: <tenant_id>/<customer_id>/<datei> – nur die eigene Kundin schreibt/liest, Salon-Team liest
create or replace function app.owns_storage_path(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.customers c
                 where c.user_id = auth.uid()
                   and c.tenant_id::text = (storage.foldername(p_name))[1]
                   and c.id::text = (storage.foldername(p_name))[2])
$$;
create or replace function app.salon_storage_path(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salon_members m
                 where m.user_id = auth.uid() and m.tenant_id::text = (storage.foldername(p_name))[1])
$$;

create policy avatars_own_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (app.owns_storage_path(name) or app.salon_storage_path(name)));
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app.owns_storage_path(name));
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and app.owns_storage_path(name));
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and app.owns_storage_path(name));

create or replace function public.set_avatar(p_path text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_path is not null and not (p_path like app.current_tenant()::text || '/' || v_id::text || '/%') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  update public.customers set avatar_path = p_path where id = v_id;
  return jsonb_build_object('avatarPath', p_path);
end
$$;

-- ---------------------------------------------------------------- Rechte der neuen Funktionen
revoke all on function app.is_salon_member(), app.has_marketing_consent(uuid, text), app.default_pref(text, text),
  app.pref_enabled(uuid, text, text), app.enqueue_notification(uuid, uuid, text, text[], jsonb, text),
  app.owns_storage_path(text), app.salon_storage_path(text), app.log_email_consent(), app.log_registration_consent()
  from public, anon, authenticated;
grant execute on function app.is_salon_member(), app.owns_storage_path(text), app.salon_storage_path(text)
  to authenticated, service_role;
grant execute on function app.enqueue_notification(uuid, uuid, text, text[], jsonb, text) to service_role;

revoke all on function public.set_marketing_consent(text, boolean), public.my_consents(),
  public.my_notification_preferences(), public.set_notification_preference(text, text, boolean),
  public.send_chat_message(text), public.mark_chat_read(), public.salon_send_chat_message(uuid, text),
  public.salon_mark_chat_read(uuid), public.salon_chat_threads(), public.set_avatar(text) from public, anon;
grant execute on function public.set_marketing_consent(text, boolean), public.my_consents(),
  public.my_notification_preferences(), public.set_notification_preference(text, text, boolean),
  public.send_chat_message(text), public.mark_chat_read(), public.salon_send_chat_message(uuid, text),
  public.salon_mark_chat_read(uuid), public.salon_chat_threads(), public.set_avatar(text) to authenticated;
