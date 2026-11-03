-- READ ONLY, before migration 006. Use only the privately confirmed project.
begin transaction read only;

-- 1: MUST be zero rows. Do not drop/rename anything to force application.
select 'schema' as object_type, nspname as existing_object
from pg_namespace where nspname = 'batool_order_internal'
union all
select 'relation', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'orders','order_items','order_customer_details','order_creation_keys','order_status_history',
  'orders_pkey','orders_created_at_id_idx','order_items_pkey',
  'order_items_order_id_product_id_selected_size_key','order_items_variant_idx',
  'order_customer_details_pkey','order_creation_keys_pkey','order_creation_keys_order_id_key',
  'order_status_history_pkey'
)
order by object_type,existing_object;

-- 2: all listed prerequisite columns must exist with these types.
with required(table_name,column_name,expected_type) as (values
  ('products','id','integer'),('products','name','text'),('products','price_minor','integer'),
  ('products','currency','text'),('products','active','boolean'),('products','is_demo','boolean'),
  ('products','edit_revision','integer'),
  ('product_variants','product_id','integer'),('product_variants','size','text'),
  ('product_variants','active','boolean'),('product_variants','stock_quantity','integer'),
  ('dashboard_roles','user_id','uuid'),('dashboard_roles','role','text')
)
select r.*, coalesce(c.data_type = r.expected_type,false) as type_matches
from required r left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = r.table_name and c.column_name = r.column_name
order by r.table_name,r.column_name;

-- 3: five expected tables, all RLS true; catalog FK keys also need review below.
select n.nspname,c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname in ('products','product_variants','dashboard_roles'))
   or (n.nspname = 'storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname;
select conrelid::regclass as table_name,conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in (
  'public.products'::regclass,'public.product_variants'::regclass,'public.dashboard_roles'::regclass
) and contype in ('p','u') order by table_name,conname;
-- Require products(id), product_variants(product_id,size), dashboard_roles(user_id) PKs.

-- 4: exactly three expected roles. anon/authenticated must NOT bypass RLS or
-- inherit service_role. service_role is expected to bypass RLS, not table grants.
select rolname,rolsuper,rolbypassrls,
  pg_has_role(rolname,'service_role','MEMBER') as member_of_service_role
from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname;

-- 5: baseline inspection, NOT a zero-row check. Compare with the verified
-- catalog/auth configuration; stop on unexpected write policies/custom behavior.
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies where schemaname = 'public'
and tablename in ('products','product_variants','dashboard_roles')
order by tablename,policyname;
select table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name in ('products','product_variants','dashboard_roles')
and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE','REFERENCES')
order by table_name,column_name,grantee;
-- Last query should be empty; this does not test actual user sessions.

-- 6: inspect default grants. Rows are normal on Supabase. Migration revokes
-- PUBLIC/anon/authenticated/service_role grants on NEW order objects only.
-- Stop/reconcile unexpected custom-role grants/inheritance before application.
select pg_get_userbyid(d.defaclrole) as creator,n.nspname,d.defaclobjtype,d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclnamespace = 0 or n.nspname in ('public','batool_order_internal')
order by creator,n.nspname,d.defaclobjtype;

-- 7: four true values: existing editing/revision dependencies stay intact.
select
  to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)') is not null as detail_rpc_exists,
  exists(select 1 from pg_trigger where tgrelid = 'public.products'::regclass
    and tgname = 'product_edit_revision' and not tgisinternal and tgenabled = 'O') as revision_trigger_enabled,
  not has_function_privilege('anon',
    to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)'), 'EXECUTE') as anon_detail_rpc_denied,
  has_function_privilege('authenticated',
    to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)'), 'EXECUTE') as authenticated_detail_rpc_allowed;
rollback;
