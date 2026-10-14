-- CRM-Ansichten nur für das Team (NUR ADDITIV; Rückrollung: supabase/rollback/20261015000300.down.sql)
-- Über security_invoker sah eine Kundin bisher ihre EIGENEN Zeilen auch in den CRM-Ansichten (keine fremden Daten,
-- aber CRM-Sicht). Jetzt liefern beide Ansichten nur für Mitglieder des Salon-Teams Zeilen.
create or replace view public.staff_appointments with (security_invoker = true) as
select a.id, a.customer_id, c.first_name || ' ' || c.last_name as customer_name, c.customer_number,
  a.service_id, a.service_name, a.category_key, a.staff_id, a.staff_name,
  app.to_wall(a.starts_at, app.tenant_tz(a.tenant_id)) as start, a.starts_at, a.ends_at, a.duration_minutes, a.price_eur,
  case when a.status = 'confirmed' and a.ends_at < now() then 'completed' else a.status::text end as status,
  a.status::text as raw_status, a.payment::text as payment, a.hold_kind, a.hold_expires_at, a.created_at,
  (c.user_id is not null) as portal_account
from public.appointments a
join public.customers c on c.id = a.customer_id
where (select app.is_staff());

create or replace view public.staff_customer_stats with (security_invoker = true) as
select c.id as customer_id,
  max(a.starts_at) filter (where a.status in ('confirmed', 'completed') and a.ends_at < now()) as last_visit,
  count(a.id) filter (where a.status in ('confirmed', 'completed') and a.ends_at < now())::int as visit_count,
  count(a.id) filter (where a.status in ('pending', 'confirmed') and a.starts_at > now() and a.hold_kind is distinct from 'waitlist_offer')::int as upcoming_count
from public.customers c left join public.appointments a on a.customer_id = c.id
where (select app.is_staff())
group by c.id;
