-- Rückrollung von 20261015000000_crm_gemeinsame_db.sql (nur direkt nach dem Einspielen sinnvoll:
-- Bestandskundinnen ohne Portal-Konto werden dabei gelöscht, weil user_id wieder Pflicht wird)
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end $$;
drop function if exists public.consume_rate_limit(jsonb);
drop table if exists public.rate_limit_counters;
drop table if exists public.booking_requests;
drop function if exists public.staff_unlink_portal(uuid);
drop function if exists public.staff_reject_link(uuid);
drop function if exists public.staff_confirm_link(uuid);
drop function if exists public.staff_news_save(text, text, text, text, timestamptz, boolean);
drop function if exists public.staff_mark_chat_read(uuid);
drop function if exists public.staff_send_chat(uuid, text);
drop function if exists public.staff_offer_free_slot(uuid, text, int);
drop function if exists public.staff_set_appointment_status(uuid, text);
drop function if exists public.staff_cancel_appointment(uuid);
drop function if exists public.staff_reschedule_appointment(uuid, text, uuid);
drop function if exists public.staff_book_appointment(uuid, uuid, uuid, text, text);
drop view if exists public.staff_customer_stats;
drop view if exists public.staff_appointments;
drop policy if exists staff_customers_read on public.customers;
drop policy if exists staff_customers_insert on public.customers;
drop policy if exists staff_customers_update on public.customers;
revoke insert, update on public.customers from authenticated;
drop policy if exists staff_appointments_read on public.appointments;
drop policy if exists staff_chat_read on public.chat_messages;
drop policy if exists staff_members_read on public.salon_members;
drop policy if exists staff_consents_read on public.marketing_consents;
drop policy if exists staff_waitlist_read on public.waitlist_entries;
drop policy if exists staff_offers_read on public.waitlist_offers;
drop policy if exists staff_payments_read on public.payments;
drop policy if exists staff_news_read on public.news_posts;
drop policy if exists staff_audit_read on public.crm_audit_log;
drop policy if exists staff_rules_read on public.payment_rules;
revoke select on public.waitlist_entries, public.waitlist_offers, public.payments, public.news_posts,
  public.crm_audit_log, public.payment_rules from authenticated;
drop policy if exists staff_services_write on public.services;
drop policy if exists staff_services_update on public.services;
drop policy if exists staff_categories_write on public.service_categories;
drop policy if exists staff_categories_update on public.service_categories;
drop policy if exists staff_staff_write on public.staff;
drop policy if exists staff_staff_update on public.staff;
drop policy if exists staff_staff_read_all on public.staff;
drop policy if exists staff_services_read_all on public.services;
drop policy if exists staff_ss_write on public.staff_services;
drop policy if exists staff_ss_delete on public.staff_services;
drop policy if exists staff_hours_write on public.staff_hours;
drop policy if exists staff_hours_update on public.staff_hours;
drop policy if exists staff_opening_write on public.opening_hours;
drop policy if exists staff_opening_update on public.opening_hours;
revoke insert, update on public.services, public.service_categories, public.staff, public.staff_hours, public.opening_hours from authenticated;
revoke insert, delete on public.staff_services from authenticated;
drop table if exists public.link_suggestions;
drop table if exists public.app_settings;
drop table if exists public.internal_notes;
drop table if exists public.customer_private;
drop function if exists app.unlink_portal(uuid, text);
drop function if exists app.merge_customers(uuid, uuid, text);
drop function if exists app.find_link_suggestions(uuid);
drop function if exists app.phone_e164(text);
drop function if exists app.require_staff();
drop function if exists public.staff_me();
drop function if exists app.staff_actor();
drop function if exists app.is_owner();
drop function if exists app.is_staff();
drop function if exists app.staff_tenant();
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
delete from public.customers where user_id is null;
create unique index if not exists customers_tenant_email on public.customers (tenant_id, lower(email));
drop index if exists public.customers_tenant_email_portal;
drop index if exists public.customers_tenant_email_legacy;
alter table public.customers alter column email set not null;
alter table public.customers alter column user_id set not null;
