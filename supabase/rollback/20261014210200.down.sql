-- Rückrollung von 20261014210200_teil4_warteliste.sql
select cron.unschedule('waitlist-expire') where exists (select 1 from cron.job where jobname = 'waitlist-expire');
drop trigger if exists appointments_waitlist_release on public.appointments;
drop function if exists public.salon_upcoming_appointments();
drop function if exists public.salon_release_slot(uuid);
drop function if exists public.salon_waitlist();
drop function if exists public.svc_crm_waitlist(uuid);
drop function if exists public.my_appointments_v2();
drop function if exists public.waitlist_offer_respond(uuid, boolean);
drop function if exists public.waitlist_offer(uuid);
drop function if exists public.my_waitlist_offers();
drop function if exists public.my_waitlist();
drop function if exists public.leave_waitlist(uuid);
drop function if exists public.join_waitlist(uuid[], uuid, date, date, smallint[], text, text, boolean);
drop function if exists app.on_appointment_change();
drop function if exists app.waitlist_release(uuid, uuid, timestamptz, timestamptz);
drop function if exists app.waitlist_expire_offers();
drop function if exists app.waitlist_close_offer(uuid, text);
drop function if exists app.waitlist_offer_next(uuid, uuid, timestamptz, timestamptz);
drop function if exists app.free_slot_news(uuid, timestamptz, uuid);
drop function if exists app.offer_json(public.waitlist_offers);
drop table if exists public.waitlist_offers;
drop table if exists public.waitlist_entries;
-- Reservierungen aus Angeboten entfernen, bevor die Spalten verschwinden
delete from public.appointments where hold_kind = 'waitlist_offer';
alter table public.appointments drop column if exists hold_kind, drop column if exists hold_expires_at;
alter table public.tenants drop column if exists offer_window_divisor, drop column if exists offer_window_min_minutes,
  drop column if exists offer_window_max_minutes, drop column if exists short_notice_hours,
  drop column if exists waitlist_free_slot_news;
