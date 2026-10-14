-- Korrektur (additiv): staff_appointments ohne Join auf tenants (für das Team per Domain-Policy unsichtbar).
-- Zeitzone über eine Definer-Funktion; Spalten unverändert.
create or replace function app.tenant_tz(p_tenant uuid) returns text
language sql stable security definer set search_path = '' as $$
  select time_zone from public.tenants where id = p_tenant
$$;
revoke all on function app.tenant_tz(uuid) from public, anon;
grant execute on function app.tenant_tz(uuid) to authenticated, service_role;

create or replace view public.staff_appointments with (security_invoker = true) as
select a.id, a.customer_id, c.first_name || ' ' || c.last_name as customer_name, c.customer_number,
  a.service_id, a.service_name, a.category_key, a.staff_id, a.staff_name,
  app.to_wall(a.starts_at, app.tenant_tz(a.tenant_id)) as start, a.starts_at, a.ends_at, a.duration_minutes, a.price_eur,
  case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end as status,
  a.status::text as raw_status, a.payment::text as payment, a.hold_kind, a.hold_expires_at, a.created_at,
  (c.user_id is not null) as portal_account
from public.appointments a
join public.customers c on c.id = a.customer_id;

-- Team-Liste über eine Funktion statt Policy: Die Policy liefert mehrere Mitgliedschaften und bricht Clients,
-- die „meine Mitgliedschaft“ ohne Filter lesen (/salon im Portal).
drop policy if exists staff_members_read on public.salon_members;
create or replace function public.staff_team() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', m.user_id, 'displayName', m.display_name, 'role', m.role,
    'email', u.email) order by m.role, m.display_name), '[]'::jsonb)
  from public.salon_members m join auth.users u on u.id = m.user_id
  where m.tenant_id = app.staff_tenant()
$$;
revoke all on function public.staff_team() from public, anon;
grant execute on function public.staff_team() to authenticated;
