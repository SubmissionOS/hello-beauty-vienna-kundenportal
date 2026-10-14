-- Rückrollung von 20261014210300_teil4_zahlungen.sql
select cron.unschedule('payments-expire') where exists (select 1 from cron.job where jobname = 'payments-expire');
drop function if exists public.export_my_data_v2();
drop function if exists public.salon_cancel_appointment(uuid);
drop function if exists public.cancel_with_refund(uuid);
drop function if exists public.svc_refunds_pending();
drop function if exists public.svc_payment_refunded(text, text, text, int);
drop function if exists public.svc_payment_failed(text, text, uuid, text);
drop function if exists public.svc_payment_succeeded(text, text, uuid, text, int);
drop function if exists public.svc_payment_set_provider(uuid, text, text);
drop function if exists public.payment_for_checkout(uuid);
drop function if exists public.my_payments();
drop function if exists public.book_with_payment(uuid, uuid, text);
drop function if exists public.payment_quote(uuid);
drop function if exists app.expire_unpaid();
drop function if exists app.refund_for_cancel(uuid);
drop function if exists app.payment_rule(uuid, uuid);
drop function if exists app.payment_json(public.payments);
drop table if exists public.payment_events;
drop table if exists public.payments;
drop table if exists public.payment_rules;
-- unbezahlte Reservierungen als normale ausstehende Termine wären für main unbekannt → entfernen
delete from public.appointments where hold_kind = 'payment' and status = 'pending';
alter table public.tenants drop column if exists payment_hold_minutes, drop column if exists late_cancel_keep_percent;
