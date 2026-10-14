-- Rückrollung von 20261015000400_crm_katalog_lesen.sql
drop policy if exists staff_categories_read on public.service_categories;
drop policy if exists staff_ss_read on public.staff_services;
drop policy if exists staff_hours_read on public.staff_hours;
drop policy if exists staff_opening_read on public.opening_hours;
