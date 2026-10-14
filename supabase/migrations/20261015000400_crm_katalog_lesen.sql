-- Team liest den Katalog ohne Origin-Host (NUR ADDITIV; Rückrollung: supabase/rollback/20261015000400.down.sql)
-- Das CRM fragt serverseitig ohne Origin-Header ab; app.current_tenant() ist dort leer. services/staff hatten schon
-- eine Team-Lese-Policy, Kategorien, Zuordnungen und Zeiten fehlten – der Join services→service_categories lieferte
-- deshalb für das Team keine einzige Leistung.
create policy staff_categories_read on public.service_categories for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_ss_read on public.staff_services for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_hours_read on public.staff_hours for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
create policy staff_opening_read on public.opening_hours for select to authenticated
  using (tenant_id = (select app.staff_tenant()));
