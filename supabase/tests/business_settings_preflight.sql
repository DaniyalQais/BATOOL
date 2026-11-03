-- Generated from repository migrations by scripts/prepare-business-settings-review.mjs.
-- Exact pending file: 20261102000800_owner_business_settings.sql. No mutation RPCs or private values printed.
-- Run the entire file as the trusted SQL administrator; return ALL labeled rows.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with

app_roles(role_name) as (values ('anon'),('authenticated'),('service_role')),
required_tables(table_name) as (values ('public.products'),('public.product_variants'),('public.dashboard_roles'),('public.product_image_assets'),('public.orders'),('public.order_items'),('public.order_customer_details'),('public.order_creation_keys'),('public.order_status_history'),('batool_catalog_internal.creation_requests'),('auth.users'),('storage.objects'),('storage.buckets')),
platform_functions(signature,result_type) as (values ('auth.uid()','uuid'),('auth.jwt()','jsonb')),
platform_results as (select e.signature,coalesce(pg_get_function_result(p.oid)=e.result_type,false) as matches from platform_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
dependency_functions(signature,result_type,definer,volatility,body_md5,arg_names) as (values
 ('public.batool_catalog_owner()','boolean',true,'s','c384e8c4b2174d0a2be534f4e3dfdcb4',array[]::text[]),
 ('batool_order_internal.guard_order()','trigger',false,'v','d6f4728b194e98484bdaf9d7e3aaa76a',array[]::text[]),
 ('public.owner_create_product_draft(uuid,text,text,integer,jsonb)','jsonb',true,'v','8d0e2afefcafd3e239d7f0277bd9b2de',array['p_request_key','p_name','p_description','p_price_minor','p_stocks']::text[]),
 ('public.owner_save_catalog_product(integer,integer,text,text,integer,boolean,jsonb,text,text,text,boolean)','jsonb',true,'v','145eb8b4c1322651eec7d51e39b2cb25',array['p_product_id','p_expected_revision','p_name','p_description','p_price_minor','p_active','p_stocks','p_subcategory','p_color','p_tag','p_archived']::text[])),
dependency_results as (
 select e.signature,p.oid is not null as present,
   coalesce(pg_get_function_result(p.oid)=e.result_type and p.prosecdef=e.definer and p.provolatile::text=e.volatility
     and md5(regexp_replace(p.prosrc,'[[:space:]]+','','g'))=e.body_md5
     and coalesce(p.proargnames,array[]::text[])=e.arg_names
     and p.proconfig @> array['search_path=""'],false) as matches_source
 from dependency_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
),
role_metadata as (
 select r.role_name,p.oid is not null as present,p.rolsuper,p.rolbypassrls,
   coalesce((select jsonb_agg(parent.rolname order by parent.rolname) from pg_auth_members m
     join pg_roles parent on parent.oid=m.roleid where m.member=p.oid),'[]'::jsonb) as memberships
 from app_roles r left join pg_roles p on p.rolname=r.role_name
),
baseline_counts as (
 -- Only constant repository table names are interpolated into read-only COUNT queries.
 select table_name,case when to_regclass(table_name) is null then null else
   ((xpath('/table/row/n/text()',query_to_xml(format('select count(*) as n from %s',to_regclass(table_name)),false,false,'')))[1]::text)::bigint end as row_count
 from required_tables
),
default_grants as (
 select pg_get_userbyid(d.defaclrole) as creator,case when d.defaclnamespace=0 then '(global)' else d.defaclnamespace::regnamespace::text end as schema_name,
   d.defaclobjtype,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,x.privilege_type,x.is_grantable,
   x.grantee<>d.defaclrole and x.grantee<>0 and x.grantee not in (select oid from pg_roles where rolname in ('anon','authenticated','service_role')) as custom_grant
 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x
 where (d.defaclnamespace=0 or d.defaclnamespace=to_regnamespace('public')) and d.defaclobjtype in ('r','f')
),
context_result as (
 select current_setting('transaction_read_only')='on' and current_setting('transaction_isolation')='repeatable read'
   and current_setting('session_replication_role')='origin' as ok,
 jsonb_build_object('read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
   'sql_role',current_user,'replication_role',current_setting('session_replication_role'),
   'migration_file','20261102000800_owner_business_settings.sql','migration_ledger','not used: SQL Editor application may not populate CLI history') as actual
),
order_guard as (
 select count(*)=1 and coalesce(bool_and(t.tgenabled='O' and t.tgtype=23 and not t.tgisinternal and t.tgnargs=0 and t.tgqual is null),false) as ok
 from pg_trigger t where t.tgrelid=to_regclass('public.orders') and t.tgname='orders_guard'
   and t.tgfoid=to_regprocedure('batool_order_internal.guard_order()')
),
new_objects as (
 select 'schema' as kind,nspname as name from pg_namespace where nspname='batool_settings_internal'
 union all select 'relation',n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('business_settings','order_notification_settings','business_settings_pkey','order_notification_settings_pkey')
 union all select 'type',n.nspname||'.'||t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace
 where n.nspname='public' and t.typname in ('business_settings','order_notification_settings','_business_settings','_order_notification_settings')
 union all select 'function',p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('owner_save_business_settings','owner_save_notification_settings','get_public_business_settings')
),
required_columns(table_name,column_name,type_name) as (values
 ('public.dashboard_roles','user_id','uuid'),('public.dashboard_roles','role','text'),
 ('public.orders','shipping_minor','bigint'),('public.orders','total_minor','bigint'),
 ('public.products','draft_managed','boolean'),('public.products','archived','boolean'),
 ('batool_catalog_internal.creation_requests','owner_id','uuid'),('batool_catalog_internal.creation_requests','product_id','integer'),('auth.users','id','uuid')),
column_results as (
 select e.*,coalesce(format_type(a.atttypid,a.atttypmod)=e.type_name,false) as matches
 from required_columns e left join pg_attribute a on a.attrelid=to_regclass(e.table_name) and a.attname=e.column_name and not a.attisdropped
),
role_grants as (
 select r.role_name,has_table_privilege(p.oid,c.oid,'SELECT') as can_select,
   has_table_privilege(p.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(p.oid,c.oid,'INSERT,UPDATE,REFERENCES') as can_mutate
 from app_roles r join pg_roles p on p.rolname=r.role_name join pg_class c on c.oid=to_regclass('public.dashboard_roles') where r.role_name<>'service_role'
),
results as (
 select '00_context' as check_name,'read_only on; repeatable read; replication origin; intended project privately confirmed' as expected,actual,case when ok then 'PASS' else 'STOP' end as status from context_result
 union all select '01_pending_name_collisions','[]; ANY existing object/overload means STOP, do not replay or drop anything',coalesce(jsonb_agg(to_jsonb(o) order by kind,name),'[]'::jsonb),case when count(*)=0 then 'PASS' else 'STOP' end from new_objects o
 union all select '02_prerequisite_tables_columns','13 tables present; 9 column types match; Auth uid/jwt return types match; applied draft sequence present',
   jsonb_build_object('missing_tables',(select coalesce(jsonb_agg(table_name),'[]'::jsonb) from required_tables where to_regclass(table_name) is null),
     'columns',(select jsonb_agg(to_jsonb(c) order by table_name,column_name) from column_results c),
     'auth_functions',(select jsonb_agg(to_jsonb(p) order by signature) from platform_results p),
     'draft_sequence_present',exists(select 1 from pg_class where oid=to_regclass('batool_catalog_internal.product_ids') and relkind='S')),
   case when not exists(select 1 from required_tables where to_regclass(table_name) is null) and not exists(select 1 from column_results where not matches)
     and (select bool_and(matches) from platform_results)
     and exists(select 1 from pg_class where oid=to_regclass('batool_catalog_internal.product_ids') and relkind='S') then 'PASS' else 'STOP' end
 union all select '03_dependency_functions','All four matches_source true; exact Owner helper, order guard, and applied draft RPC contracts',coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]'::jsonb),case when count(*)=4 and bool_and(matches_source) then 'PASS' else 'STOP' end from dependency_results d
 union all select '04_platform_roles','All three present; anon/authenticated not superuser or BYPASSRLS and no inherited roles; service_role BYPASSRLS',jsonb_agg(to_jsonb(r) order by role_name),case when count(*)=3 and bool_and(present and not rolsuper and case when role_name='service_role' then rolbypassrls else not rolbypassrls and memberships='[]'::jsonb end) then 'PASS' else 'STOP' end from role_metadata r
 union all select '05_default_acl_review','Standard default grants are explicitly revoked by the pending migration; any custom-role grant requires review before application',
   coalesce(jsonb_agg(to_jsonb(d) order by creator,schema_name,defaclobjtype,grantee,privilege_type),'[]'::jsonb),case when count(*) filter(where custom_grant)=0 then 'PASS' else 'REVIEW' end from default_grants d
 union all select '06_role_table_rls_and_grants','RLS true; only dashboard_role_read_self SELECT policy; anon cannot read; authenticated can read; neither can mutate',
   jsonb_build_object('rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.dashboard_roles')),false),
     'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,'qual',qual,'with_check',with_check)),'[]'::jsonb) from pg_policies where schemaname='public' and tablename='dashboard_roles'),
     'grants',(select jsonb_agg(to_jsonb(g) order by role_name) from role_grants g)),
   case when coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.dashboard_roles')),false)
     and (select count(*)=1 and bool_and(policyname='dashboard_role_read_self' and cmd='SELECT' and roles=array['authenticated']::name[]) from pg_policies where schemaname='public' and tablename='dashboard_roles')
     and (select count(*)=2 and bool_and(not can_mutate and can_select=(role_name='authenticated')) from role_grants) then 'PASS' else 'STOP' end
 union all select '07_order_snapshot_guard','true; enabled existing BEFORE INSERT/UPDATE guard; function source also checked in 03',to_jsonb(ok),case when ok then 'PASS' else 'STOP' end from order_guard
 union all select '08_sql_administrator','Trusted SQL administrator owns order table (required for COMMENT); can CREATE schema and public objects',
   jsonb_build_object('owns_orders',coalesce((select relowner=(select oid from pg_roles where rolname=current_user) from pg_class where oid=to_regclass('public.orders')),false),
     'create_schema',has_database_privilege(current_user,current_database(),'CREATE'),'create_public',has_schema_privilege(current_user,'public','CREATE')),
   case when coalesce((select relowner=(select oid from pg_roles where rolname=current_user) from pg_class where oid=to_regclass('public.orders')),false)
     and has_database_privilege(current_user,current_database(),'CREATE') and has_schema_privilege(current_user,'public','CREATE') then 'PASS' else 'STOP' end
 union all select '09_existing_row_counts','Compare pre/post: every count unchanged; counts alone do not prove unchanged row values',jsonb_object_agg(table_name,row_count order by table_name),'COMPARE' from baseline_counts
)

select check_name,expected,actual,status from results order by check_name;
rollback;
