-- Rückrollung von 20261014200000_teil3_chat_benachrichtigungen.sql (stellt den Stand von main wieder her)
drop policy if exists avatars_own_select on storage.objects;
drop policy if exists avatars_own_insert on storage.objects;
drop policy if exists avatars_own_update on storage.objects;
drop policy if exists avatars_own_delete on storage.objects;
-- Bucket „avatars“ wird über die Storage-API gelöscht (scripts/migrate-safe.mjs, Supabase sperrt direktes Löschen)

drop function if exists public.set_avatar(text);
drop function if exists public.salon_chat_threads();
drop function if exists public.salon_mark_chat_read(uuid);
drop function if exists public.salon_send_chat_message(uuid, text);
drop function if exists public.mark_chat_read();
drop function if exists public.send_chat_message(text);
drop function if exists public.set_notification_preference(text, text, boolean);
drop function if exists public.my_notification_preferences();
drop function if exists public.set_marketing_consent(text, boolean);
drop function if exists public.my_consents();
drop trigger if exists customers_log_email_consent on public.customers;
drop trigger if exists customers_log_registration_consent on public.customers;

drop table if exists public.chat_messages;
drop table if exists public.notification_queue;
drop table if exists public.notification_preferences;
drop table if exists public.marketing_consents;
drop table if exists public.salon_members;

drop function if exists app.enqueue_notification(uuid, uuid, text, text[], jsonb, text);
drop function if exists app.pref_enabled(uuid, text, text);
drop function if exists app.default_pref(text, text);
drop function if exists app.has_marketing_consent(uuid, text);
drop function if exists app.log_email_consent();
drop function if exists app.log_registration_consent();
drop function if exists app.owns_storage_path(text);
drop function if exists app.salon_storage_path(text);
drop function if exists app.is_salon_member();

alter table public.customers drop column if exists avatar_path;
