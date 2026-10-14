-- Rückrollung von 20261014220000_teil4_korrekturen.sql: vorherige Fassungen wiederherstellen
drop function if exists public.svc_demo_refresh(uuid, uuid);

create or replace function public.svc_crm_search(p_tenant uuid, p_query text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.customer_json(c) order by c.last_name, c.first_name), '[]'::jsonb)
  from (select * from public.customers c
        where c.tenant_id = p_tenant and c.deletion_requested_at is null
          and length(btrim(coalesce(p_query, ''))) >= 2
          and (upper(c.customer_number) = upper(btrim(p_query))
               or lower(c.email) like '%' || lower(btrim(p_query)) || '%'
               or lower(c.first_name || ' ' || c.last_name) like '%' || lower(btrim(p_query)) || '%'
               or regexp_replace(coalesce(c.phone, ''), '[^0-9+]', '', 'g')
                  like '%' || regexp_replace(btrim(p_query), '[^0-9+]', '', 'g') || '%')
        limit 25) c
$$;

create or replace function public.svc_crm_link_suggestions(p_tenant uuid, p_email text, p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(app.customer_json(c) || jsonb_build_object('matchedBy', m.by) order by m.by), '[]'::jsonb)
  from public.customers c
  join lateral (select case
      when p_email is not null and lower(c.email) = lower(btrim(p_email)) then 'email'
      when p_phone is not null and c.phone is not null
           and regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g') then 'phone'
    end as by) m on m.by is not null
  where c.tenant_id = p_tenant and c.deletion_requested_at is null
$$;

create or replace function public.salon_cancel_appointment(p_appointment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_a jsonb;
begin
  v_a := public.salon_release_slot(p_appointment_id);
  perform app.refund_for_cancel(p_appointment_id);
  return v_a;
end
$$;
