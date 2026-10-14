-- Rückrollung von 20261015000100_crm_ansicht_zeitzone.sql: Ansicht wie in 20261015000000
create or replace view public.staff_appointments with (security_invoker = true) as
select a.id, a.customer_id, c.first_name || ' ' || c.last_name as customer_name, c.customer_number,
  a.service_id, a.service_name, a.category_key, a.staff_id, a.staff_name,
  app.to_wall(a.starts_at, t.time_zone) as start, a.starts_at, a.ends_at, a.duration_minutes, a.price_eur,
  case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end as status,
  a.status::text as raw_status, a.payment::text as payment, a.hold_kind, a.hold_expires_at, a.created_at,
  (c.user_id is not null) as portal_account
from public.appointments a
join public.customers c on c.id = a.customer_id
join public.tenants t on t.id = a.tenant_id;
drop function if exists app.tenant_tz(uuid);
drop function if exists public.staff_team();
create policy staff_members_read on public.salon_members for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
