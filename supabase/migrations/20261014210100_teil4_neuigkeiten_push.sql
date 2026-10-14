-- Teil 4 / 4–5: Neuigkeiten & Angebote, Web-Push-Abos, Versand-Worker. NUR ADDITIV
-- (Rückrollung: supabase/rollback/20261014210100.down.sql + .down.mjs für den Bucket).

-- ---------------------------------------------------------------- Neuigkeiten
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('news', 'offer', 'free_slot')),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 2000),
  image_path text check (image_path is null or length(image_path) < 300),
  valid_until timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check (kind <> 'offer' or valid_until is not null)
);
create index news_posts_feed on public.news_posts (tenant_id, status, published_at desc);
alter table public.news_posts enable row level security;
revoke all on public.news_posts from anon, authenticated;

create table public.news_reads (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  news_id uuid not null references public.news_posts (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (customer_id, news_id),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
alter table public.news_reads enable row level security;
revoke all on public.news_reads from anon, authenticated;

create or replace function app.news_json(n public.news_posts, p_read boolean) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'imagePath', n.image_path,
    'validUntil', n.valid_until, 'status', n.status, 'publishedAt', n.published_at, 'createdAt', n.created_at, 'read', p_read)
$$;

-- Feed der Kundin: veröffentlicht, abgelaufene Angebote ausgeblendet
create or replace function public.news_feed() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.news_json(n, r.news_id is not null) order by n.published_at desc), '[]'::jsonb)
  from public.news_posts n
  left join public.news_reads r on r.news_id = n.id and r.customer_id = app.my_customer_id()
  where n.tenant_id = app.current_tenant() and n.status = 'published'
    and (n.valid_until is null or n.valid_until > now())
$$;

create or replace function public.news_unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.news_posts n
  where n.tenant_id = app.current_tenant() and n.status = 'published' and (n.valid_until is null or n.valid_until > now())
    and app.my_customer_id() is not null
    and not exists (select 1 from public.news_reads r where r.news_id = n.id and r.customer_id = app.my_customer_id())
$$;

create or replace function public.mark_news_read(p_news_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.news_reads (tenant_id, customer_id, news_id)
  select n.tenant_id, v_id, n.id from public.news_posts n
  where n.id = p_news_id and n.tenant_id = app.current_tenant() and n.status = 'published'
  on conflict do nothing;
end
$$;

-- Veröffentlichen + Versand: In-App für alle (Feed); Push/E-Mail/SMS sind Werbung → nur mit Einwilligung je Kanal
create or replace function app.news_publish(p_tenant uuid, p_news uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n public.news_posts;
  v_c record;
begin
  update public.news_posts set status = 'published', published_at = coalesce(published_at, now())
  where id = p_news and tenant_id = p_tenant and status = 'draft' returning * into v_n;
  if v_n.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  for v_c in select id from public.customers where tenant_id = p_tenant and deletion_requested_at is null loop
    perform app.enqueue_notification(p_tenant, v_c.id, 'news_promo', array['push', 'email', 'sms'],
      jsonb_build_object('title', v_n.title, 'body', left(v_n.body, 160), 'url', '/app/neuigkeiten?id=' || v_n.id),
      'news:' || v_n.id || ':' || v_c.id);
  end loop;
  return app.news_json(v_n, false);
end
$$;

create or replace function app.news_save(p_tenant uuid, p_id uuid, p_kind text, p_title text, p_body text,
  p_image_path text, p_valid_until timestamptz, p_actor text) returns public.news_posts
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n public.news_posts;
begin
  if p_image_path is not null and p_image_path not like p_tenant::text || '/%' then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.news_posts (tenant_id, kind, title, body, image_path, valid_until, created_by)
    values (p_tenant, p_kind, btrim(p_title), btrim(p_body), p_image_path, p_valid_until, p_actor) returning * into v_n;
  else
    update public.news_posts set kind = p_kind, title = btrim(p_title), body = btrim(p_body), image_path = p_image_path,
      valid_until = p_valid_until
    where id = p_id and tenant_id = p_tenant and status = 'draft' returning * into v_n;
    if v_n.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  end if;
  return v_n;
end
$$;

-- Salon (/salon)
create or replace function public.salon_news_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return coalesce((select jsonb_agg(app.news_json(n, false) order by n.created_at desc)
                   from public.news_posts n where n.tenant_id = app.current_tenant()), '[]'::jsonb);
end
$$;

create or replace function public.salon_news_save(p_id uuid, p_kind text, p_title text, p_body text,
  p_image_path text, p_valid_until timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text;
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  select display_name into v_name from public.salon_members where user_id = auth.uid() and tenant_id = app.current_tenant();
  return app.news_json(app.news_save(app.current_tenant(), p_id, p_kind, p_title, p_body, p_image_path, p_valid_until,
    'salon:' || v_name), false);
end
$$;

create or replace function public.salon_news_publish(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not app.is_salon_member() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  return app.news_publish(app.current_tenant(), p_id);
end
$$;

-- CRM-Schnittstelle
create or replace function public.svc_crm_news_create(p_tenant uuid, p_kind text, p_title text, p_body text,
  p_valid_until timestamptz, p_publish boolean, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n public.news_posts;
begin
  v_n := app.news_save(p_tenant, null, p_kind, p_title, p_body, null, p_valid_until, 'crm:' || p_actor);
  perform app.audit(p_tenant, p_actor, 'news_create', null, null, jsonb_build_object('newsId', v_n.id, 'publish', p_publish));
  if p_publish then return app.news_publish(p_tenant, v_n.id); end if;
  return app.news_json(v_n, false);
end
$$;

-- Bilder der Neuigkeiten: öffentlich lesbar (keine personenbezogenen Daten), schreiben nur das Salon-Team
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy news_images_salon_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images' and app.salon_storage_path(name));
create policy news_images_salon_update on storage.objects for update to authenticated
  using (bucket_id = 'news-images' and app.salon_storage_path(name));
create policy news_images_salon_delete on storage.objects for delete to authenticated
  using (bucket_id = 'news-images' and app.salon_storage_path(name));

-- ---------------------------------------------------------------- Web-Push-Abos (pro Gerät)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0,
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, endpoint, user_agent, created_at, last_success_at) on public.push_subscriptions to authenticated;
create policy own_push on public.push_subscriptions for select to authenticated
  using (customer_id = (select app.my_customer_id()));

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := app.my_customer_id();
begin
  if v_id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  insert into public.push_subscriptions (tenant_id, customer_id, endpoint, p256dh, auth, user_agent)
  values (app.current_tenant(), v_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set tenant_id = excluded.tenant_id, customer_id = excluded.customer_id,
    p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failure_count = 0;
  return jsonb_build_object('saved', true);
end
$$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and customer_id = app.my_customer_id()
$$;

-- ---------------------------------------------------------------- Versand-Worker (nur Server mit Secret Key)
create or replace function public.svc_queue_claim(p_limit int default 50) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_rows jsonb;
begin
  with due as (
    select q.id from public.notification_queue q
    where q.status = 'queued' and q.not_before <= now() and q.attempts < 5
    order by q.id limit p_limit for update skip locked
  ), upd as (
    update public.notification_queue q set status = 'sending', attempts = q.attempts + 1
    from due where q.id = due.id returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'channel', u.channel, 'kind', u.kind, 'payload', u.payload, 'tenantId', u.tenant_id,
    'customer', (select jsonb_build_object('email', c.email, 'phone', c.phone, 'language', c.language, 'firstName', c.first_name)
                 from public.customers c where c.id = u.customer_id),
    'push', case when u.channel = 'push' then (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint,
                 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) from public.push_subscriptions s where s.customer_id = u.customer_id) end
  )), '[]'::jsonb) into v_rows from upd u;
  return v_rows;
end
$$;

create or replace function public.svc_queue_done(p_id bigint, p_status text, p_error text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.notification_queue set
    status = case when p_status = 'retry' then 'queued' else p_status end,
    not_before = case when p_status = 'retry' then now() + make_interval(mins => 2 * attempts) else not_before end,
    last_error = left(p_error, 500),
    sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id
$$;

-- Abgelaufene Abos (404/410) sofort entfernen, sonst nach 5 Fehlversuchen
create or replace function public.svc_push_result(p_endpoint text, p_ok boolean, p_gone boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_gone then
    delete from public.push_subscriptions where endpoint = p_endpoint;
  elsif p_ok then
    update public.push_subscriptions set last_success_at = now(), failure_count = 0 where endpoint = p_endpoint;
  else
    update public.push_subscriptions set failure_count = failure_count + 1 where endpoint = p_endpoint;
    delete from public.push_subscriptions where endpoint = p_endpoint and failure_count >= 5;
  end if;
end
$$;

-- ---------------------------------------------------------------- Rechte
revoke all on function app.news_json(public.news_posts, boolean), app.news_publish(uuid, uuid),
  app.news_save(uuid, uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.news_feed(), public.news_unread_count(), public.mark_news_read(uuid),
  public.salon_news_list(), public.salon_news_save(uuid, text, text, text, text, timestamptz), public.salon_news_publish(uuid),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.news_feed(), public.news_unread_count(), public.mark_news_read(uuid),
  public.salon_news_list(), public.salon_news_save(uuid, text, text, text, text, timestamptz), public.salon_news_publish(uuid),
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;
revoke all on function public.svc_crm_news_create(uuid, text, text, text, timestamptz, boolean, text),
  public.svc_queue_claim(int), public.svc_queue_done(bigint, text, text), public.svc_push_result(text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.svc_crm_news_create(uuid, text, text, text, timestamptz, boolean, text),
  public.svc_queue_claim(int), public.svc_queue_done(bigint, text, text), public.svc_push_result(text, boolean, boolean)
  to service_role;
