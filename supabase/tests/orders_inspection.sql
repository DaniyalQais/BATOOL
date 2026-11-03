-- READ ONLY post-006 configuration inspection. Never selects customer rows.
begin transaction read only;
select c.relname,c.relrowsecurity,c.relacl from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('orders','order_items','order_customer_details','order_creation_keys','order_status_history')
order by c.relname;
select table_name,column_name,data_type,is_nullable,column_default,is_generated
from information_schema.columns where table_schema='public'
and table_name in ('orders','order_items','order_customer_details','order_creation_keys','order_status_history')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies where schemaname='public' and tablename in
  ('orders','order_items','order_customer_details','order_creation_keys','order_status_history')
order by tablename,policyname;
select c.relname,r.role_name,
  has_table_privilege(r.role_name,c.oid,'SELECT') as can_select,
  has_table_privilege(r.role_name,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as any_mutation_grant,
  has_any_column_privilege(r.role_name,c.oid,'INSERT,UPDATE,REFERENCES') as any_column_mutation_grant
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('anon'::text),('authenticated'::text),('service_role'::text)) r(role_name)
where n.nspname='public' and c.relname in
  ('orders','order_items','order_customer_details','order_creation_keys','order_status_history')
order by c.relname,r.role_name;
-- SELECT true for authenticated on four tables, never keys; no mutation grants.
select conrelid::regclass as table_name,conname,convalidated,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (
  'public.orders'::regclass,'public.order_items'::regclass,'public.order_customer_details'::regclass,
  'public.order_creation_keys'::regclass,'public.order_status_history'::regclass)
order by table_name,conname;
select tgrelid::regclass as table_name,tgname,tgenabled,pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in (
  'public.orders'::regclass,'public.order_items'::regclass,'public.order_customer_details'::regclass,
  'public.order_creation_keys'::regclass,'public.order_status_history'::regclass)
order by table_name,tgname;
select p.proname,pg_get_function_result(p.oid) as returns,p.prosecdef,p.proconfig,p.proacl,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='batool_order_internal' order by p.proname;
select nspname,nspacl,
  has_schema_privilege('anon',oid,'USAGE') as anon_usage,
  has_schema_privilege('authenticated',oid,'USAGE') as authenticated_usage,
  has_schema_privilege('service_role',oid,'USAGE') as service_usage
from pg_namespace where nspname='batool_order_internal';
rollback;
