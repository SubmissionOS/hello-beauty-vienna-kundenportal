-- Rückrollung von 20261015000200_verknuepfung_protokoll.sql
update public.link_suggestions set status = 'rejected' where status = 'unlinked';
delete from public.link_suggestions where portal_customer_id is null;
alter table public.link_suggestions drop constraint link_suggestions_status_check;
alter table public.link_suggestions add constraint link_suggestions_status_check
  check (status in ('open', 'confirmed', 'rejected'));
alter table public.link_suggestions drop constraint link_suggestions_portal_customer_id_tenant_id_fkey;
alter table public.link_suggestions add constraint link_suggestions_portal_customer_id_tenant_id_fkey
  foreign key (portal_customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade;
alter table public.link_suggestions alter column portal_customer_id set not null;

create or replace function app.unlink_portal(p_customer uuid, p_actor text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_c public.customers;
  v_new uuid;
begin
  select * into v_c from public.customers where id = p_customer for update;
  if v_c.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_c.user_id is null then raise exception 'not_linked' using errcode = 'P0001'; end if;
  update public.customers set user_id = null where id = v_c.id;
  insert into public.customers (tenant_id, user_id, first_name, last_name, email, phone, language, notify_email,
                                marketing_consent, marketing_consent_at, privacy_notice_at)
  values (v_c.tenant_id, v_c.user_id, v_c.first_name, v_c.last_name, v_c.email, v_c.phone, v_c.language, v_c.notify_email,
          v_c.marketing_consent, v_c.marketing_consent_at, v_c.privacy_notice_at)
  returning id into v_new;
  -- die Bestandskundin behält ihre E-Mail nur, wenn sie nicht mit der neuen Portal-Zeile kollidiert (gleiche Person)
  perform app.audit(v_c.tenant_id, p_actor, 'unlink', v_c.id, null, jsonb_build_object('newPortalCustomerId', v_new));
  update public.link_suggestions set status = 'rejected', decided_at = now(), decided_by = p_actor
    where legacy_customer_id = v_c.id and status = 'confirmed';
  return jsonb_build_object('legacyCustomerId', v_c.id, 'portalCustomerId', v_new);
end
$$;
