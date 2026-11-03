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
expected_functions(signature,result_type,definer,volatility,body_md5,arg_names) as (values
 ('batool_settings_internal.valid_email(jsonb)','boolean',false,'i','ffc93e24ed9e9d69a990481186e2eb42',array['value']::text[]),
 ('batool_settings_internal.valid_phone(jsonb)','boolean',false,'i','ad6036a9478f06820723fadaad69e60e',array['value']::text[]),
 ('batool_settings_internal.valid_shipping(jsonb)','boolean',false,'i','e440345e67bf48ad96f2140ffde07ed8',array['value']::text[]),
 ('batool_settings_internal.valid_business(jsonb)','boolean',false,'i','1072a89b69132b83f6a7f8b603f359aa',array['value']::text[]),
 ('batool_settings_internal.valid_notifications(jsonb)','boolean',false,'i','99c728737cfb9707bcdd8620c8ad45a1',array['value']::text[]),
 ('batool_settings_internal.revise()','trigger',false,'v','4cbfb35085c0da974c075bd5a35b6853',array[]::text[]),
 ('batool_settings_internal.require_owner()','void',false,'v','4ba33955fcebcf6ef7dfa1dead50a259',array[]::text[]),
 ('public.owner_save_business_settings(integer,jsonb)','jsonb',true,'v','7fc4f0d3e20a98f0909f35925fdfba3e',array['p_expected_revision','p_settings']::text[]),
 ('public.owner_save_notification_settings(integer,jsonb)','jsonb',true,'v','0b64318bdda4b9ba4db30d0acbfdda88',array['p_expected_revision','p_settings']::text[]),
 ('public.get_public_business_settings()','jsonb',true,'s','721793a8aeab32c419857e7217276117',array[]::text[])),
function_results as (
 select e.signature,p.oid is not null as present,pg_get_userbyid(p.proowner) as owner,
   coalesce(p.proowner=(select relowner from pg_class where oid=to_regclass('public.orders')),false) as owner_matches,
   coalesce(pg_get_function_result(p.oid)=e.result_type and p.prosecdef=e.definer and p.provolatile::text=e.volatility
     and md5(regexp_replace(p.prosrc,'[[:space:]]+','','g'))=e.body_md5 and coalesce(p.proargnames,array[]::text[])=e.arg_names
     and p.proconfig @> array['search_path=""'],false) as matches_source,
   (select count(*) from pg_proc other join pg_namespace n on n.oid=other.pronamespace where n.nspname=split_part(e.signature,'.',1) and other.proname=p.proname) as overload_count
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)
),
settings_tables as (select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('business_settings','order_notification_settings')),
column_specs(column_name,type_name,not_null,default_expression) as (values
 ('id','boolean',true,'true'),('revision','integer',true,'1'),('settings','jsonb',true,null),
 ('updated_at','timestamp with time zone',true,'transaction_timestamp()'),('updated_by','uuid',false,null)),
column_results as (
 select c.relname,s.column_name,coalesce(format_type(a.atttypid,a.atttypmod)=s.type_name and a.attnotnull=s.not_null
   and pg_get_expr(d.adbin,d.adrelid) is not distinct from s.default_expression,false) as matches
 from settings_tables c cross join column_specs s left join pg_attribute a on a.attrelid=c.oid and a.attname=s.column_name and not a.attisdropped
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
),
constraints_expected(table_name,constraint_name,definition) as (values
 ('business_settings','business_settings_pkey','PRIMARY KEY (id)'),('business_settings','business_settings_id_check','CHECK (id)'),
 ('business_settings','business_settings_revision_check','CHECK ((revision > 0))'),('business_settings','business_settings_settings_check','CHECK (batool_settings_internal.valid_business(settings))'),
 ('order_notification_settings','order_notification_settings_pkey','PRIMARY KEY (id)'),('order_notification_settings','order_notification_settings_id_check','CHECK (id)'),
 ('order_notification_settings','order_notification_settings_revision_check','CHECK ((revision > 0))'),('order_notification_settings','order_notification_settings_settings_check','CHECK (batool_settings_internal.valid_notifications(settings))')),
constraint_results as (
 select e.table_name,e.constraint_name,coalesce(c.convalidated and regexp_replace(pg_get_constraintdef(c.oid),'[[:space:]]+','','g')=regexp_replace(e.definition,'[[:space:]]+','','g')
   and (c.contype<>'p' or (select indisvalid and indisready from pg_index where indexrelid=c.conindid)),false) as matches
 from constraints_expected e left join pg_constraint c on c.conrelid=to_regclass('public.'||e.table_name) and c.conname=e.constraint_name
),
table_grants as (
 select c.relname,r.role_name,has_table_privilege(p.oid,c.oid,'SELECT') as can_select,
   has_table_privilege(p.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(p.oid,c.oid,'INSERT,UPDATE,REFERENCES') as can_mutate
 from settings_tables c cross join app_roles r join pg_roles p on p.rolname=r.role_name
),
unexpected_table_acl as (
 select c.relname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,x.privilege_type
 from settings_tables c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
 where x.grantee<>c.relowner and not(x.grantee=(select oid from pg_roles where rolname='authenticated') and x.privilege_type='SELECT' and not x.is_grantable)
),
unexpected_column_acl as (
 select c.relname,a.attname from settings_tables c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where a.attacl is not null
),
function_grants as (
 select e.signature,r.role_name,coalesce(has_function_privilege(p.oid,to_regprocedure(e.signature),'EXECUTE'),false) as can_execute,
   (e.signature='public.get_public_business_settings()' and r.role_name in ('anon','authenticated'))
   or (e.signature like 'public.owner_save_%' and r.role_name='authenticated') as expected_execute
 from expected_functions e cross join app_roles r join pg_roles p on p.rolname=r.role_name
),
unexpected_function_acl as (
 select e.signature,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,x.privilege_type
 from expected_functions e join pg_proc p on p.oid=to_regprocedure(e.signature) cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
 where x.grantee<>p.proowner and not(x.privilege_type='EXECUTE' and not x.is_grantable and (
   (e.signature='public.get_public_business_settings()' and x.grantee in (select oid from pg_roles where rolname in ('anon','authenticated')))
   or (e.signature like 'public.owner_save_%' and x.grantee=(select oid from pg_roles where rolname='authenticated'))))
),
internal_schema_grants as (
 select r.role_name,has_schema_privilege(p.oid,n.oid,'USAGE,CREATE') as has_access
 from app_roles r join pg_roles p on p.rolname=r.role_name join pg_namespace n on n.nspname='batool_settings_internal'
),
unexpected_schema_acl as (
 select case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,x.privilege_type
 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x
 where n.nspname='batool_settings_internal' and x.grantee<>n.nspowner
),
policy_results as (
 select tablename,policyname,roles,cmd,permissive,
   roles=array['authenticated']::name[] and cmd='SELECT' and permissive='PERMISSIVE' and with_check is null
   and replace(replace(replace(regexp_replace(qual,'[[:space:]]+','','g'),'public.',''),'(',''),')','')='batool_catalog_owner'
   and ((tablename='business_settings' and policyname='business_settings_owner_read') or (tablename='order_notification_settings' and policyname='notification_settings_owner_read')) as matches
 from pg_policies where schemaname='public' and tablename in ('business_settings','order_notification_settings')
),
trigger_results as (
 select c.relname,t.tgname,coalesce(t.tgenabled='O' and t.tgtype=19 and t.tgfoid=to_regprocedure('batool_settings_internal.revise()')
   and not t.tgisinternal and t.tgnargs=0 and t.tgqual is null and t.tgconstraint=0,false) as matches
 from settings_tables c left join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
),
public_projection as (
 select case when (select matches_source from function_results where signature='public.get_public_business_settings()')
   then public.get_public_business_settings() else '{}'::jsonb end as value
),
results as (
 select '00_context' as check_name,'read_only on; repeatable read; replication origin; intended project privately confirmed' as expected,actual,case when ok then 'PASS' else 'STOP' end as status from context_result
 union all select '01_settings_tables_columns','Two ordinary RLS-enabled tables, ten exact columns/defaults; no additional columns',
   jsonb_build_object('tables',(select coalesce(jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,'kind',relkind,'owner',pg_get_userbyid(relowner)) order by relname),'[]'::jsonb) from settings_tables),
     'columns',(select coalesce(jsonb_agg(to_jsonb(c) order by relname,column_name),'[]'::jsonb) from column_results c)),
   case when (select count(*)=2 and bool_and(relrowsecurity and relkind='r' and relowner=(select relowner from pg_class where oid=to_regclass('public.orders'))) from settings_tables)
     and (select count(*)=10 and bool_and(matches) from column_results)
     and (select count(*)=10 from pg_attribute where attrelid in (select oid from settings_tables) and attnum>0 and not attisdropped) then 'PASS' else 'STOP' end
 union all select '02_constraints','All eight exact CHECK/PRIMARY KEY constraints validated; two primary-key indexes valid/ready; NOT NULL checked in 01',jsonb_agg(to_jsonb(c) order by table_name,constraint_name),
   case when count(*)=8 and bool_and(matches) and (select count(*)=8 from pg_constraint where conrelid in(select oid from settings_tables) and contype<>'n') then 'PASS' else 'STOP' end from constraint_results c
 union all select '03_dependency_functions','All four matches_source true; exact Owner helper, order guard, and applied draft RPC contracts',coalesce(jsonb_agg(to_jsonb(d) order by signature),'[]'::jsonb),case when count(*)=4 and bool_and(matches_source) then 'PASS' else 'STOP' end from dependency_results d
 union all select '04_platform_roles','All three present; anon/authenticated not superuser or BYPASSRLS and no inherited roles; service_role BYPASSRLS',jsonb_agg(to_jsonb(r) order by role_name),case when count(*)=3 and bool_and(present and not rolsuper and case when role_name='service_role' then rolbypassrls else not rolbypassrls and memberships='[]'::jsonb end) then 'PASS' else 'STOP' end from role_metadata r
 union all select '05_new_function_contracts','All ten function bodies/types/security/search paths/argument names match migration source; no overloads or extra internal functions',jsonb_agg(to_jsonb(f) order by signature),
   case when count(*)=10 and bool_and(matches_source and overload_count=1 and owner_matches)
     and (select count(*)=7 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='batool_settings_internal') then 'PASS' else 'STOP' end from function_results f
 union all select '06_table_grants','Authenticated SELECT only; no app table/column mutations; no PUBLIC/custom ACLs',
   jsonb_build_object('effective',(select jsonb_agg(to_jsonb(g) order by relname,role_name) from table_grants g),'unexpected_acl',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from unexpected_table_acl x),
     'unexpected_column_acl',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from unexpected_column_acl x)),
   case when (select count(*)=6 and bool_and(not can_mutate and can_select=(role_name='authenticated')) from table_grants)
     and not exists(select 1 from unexpected_table_acl) and not exists(select 1 from unexpected_column_acl) then 'PASS' else 'STOP' end
 union all select '07_function_and_schema_grants','Owner saves: authenticated only; public DTO: anon/authenticated only; internal schema/functions: no app/PUBLIC/custom grants',
   jsonb_build_object('execute',(select jsonb_agg(to_jsonb(g) order by signature,role_name) from function_grants g),
     'internal_schema',(select jsonb_agg(to_jsonb(g) order by role_name) from internal_schema_grants g),
     'unexpected_function_acl',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from unexpected_function_acl g),
     'unexpected_schema_acl',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from unexpected_schema_acl g)),
   case when (select count(*)=30 and bool_and(can_execute=expected_execute) from function_grants)
     and (select count(*)=3 and bool_and(not has_access) from internal_schema_grants)
     and not exists(select 1 from unexpected_function_acl) and not exists(select 1 from unexpected_schema_acl) then 'PASS' else 'STOP' end
 union all select '08_owner_read_policies','Exactly two authenticated SELECT Owner-helper policies; no write/public policies',coalesce(jsonb_agg(to_jsonb(p) order by tablename),'[]'::jsonb),
   case when count(*)=2 and bool_and(matches) then 'PASS' else 'STOP' end from policy_results p
 union all select '09_revision_and_order_guards','Two enabled BEFORE UPDATE revision triggers; original order guard unchanged',
   jsonb_build_object('revision_triggers',(select jsonb_agg(to_jsonb(t) order by relname) from trigger_results t),'order_guard',(select ok from order_guard)),
   case when (select count(*)=2 and bool_and(matches) from trigger_results) and (select ok from order_guard) then 'PASS' else 'STOP' end
 union all select '10_existing_row_counts','Compare pre/post: every count unchanged; counts alone do not prove unchanged row values',jsonb_object_agg(table_name,row_count order by table_name),'COMPARE' from baseline_counts
 union all select '11_initial_seed_redacted','Immediately after application BEFORE Owner edits: one row per table; revision 1, actor null; exact empty/draft/unconfigured seeds',
   jsonb_build_object('business_count',(select count(*) from public.business_settings),'notification_count',(select count(*) from public.order_notification_settings),
     'business_seed_matches',(select coalesce(bool_and(id and revision=1 and updated_by is null and settings='{"public_whatsapp":null,"support_email":null,"cod_enabled":false,"easypaisa_enabled":false,"easypaisa_account_title":null,"easypaisa_account_number":null,"jazzcash_enabled":false,"jazzcash_account_title":null,"jazzcash_account_number":null,"shipping":{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null},"payment_instructions":"","payment_instructions_state":"draft","policy_text":"","policy_state":"draft"}'::jsonb),false) from public.business_settings),
     'notification_seed_matches',(select coalesce(bool_and(id and revision=1 and updated_by is null and settings='{"emails":[],"whatsapp_numbers":[]}'::jsonb),false) from public.order_notification_settings)),
   case when (select count(*)=1 and bool_and(id and revision=1 and updated_by is null and settings='{"public_whatsapp":null,"support_email":null,"cod_enabled":false,"easypaisa_enabled":false,"easypaisa_account_title":null,"easypaisa_account_number":null,"jazzcash_enabled":false,"jazzcash_account_title":null,"jazzcash_account_number":null,"shipping":{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null},"payment_instructions":"","payment_instructions_state":"draft","policy_text":"","policy_state":"draft"}'::jsonb) from public.business_settings)
     and (select count(*)=1 and bool_and(id and revision=1 and updated_by is null and settings='{"emails":[],"whatsapp_numbers":[]}'::jsonb) from public.order_notification_settings) then 'PASS' else 'STOP' end
 union all select '12_public_projection_redacted','Exact nine public keys; PK/PKR unconfigured/null shipping; checkout false; payment methods []; no raw values printed',
   jsonb_build_object('key_count',(select count(*) from jsonb_object_keys(value)),
     'keys_match',value ?& array['public_whatsapp','support_email','currency','stock_model','shipping','payment_instructions','policy_text','checkout_enabled','available_payment_methods'],
     'shipping_unconfigured',value->'shipping'='{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb,
     'checkout_disabled',value->'checkout_enabled'='false'::jsonb,'payment_methods_empty',value->'available_payment_methods'='[]'::jsonb,
     'texts_withheld',value->'policy_text'='null'::jsonb and value->'payment_instructions'='null'::jsonb),
   case when (select count(*)=9 from jsonb_object_keys(value))
     and value ?& array['public_whatsapp','support_email','currency','stock_model','shipping','payment_instructions','policy_text','checkout_enabled','available_payment_methods']
     and value->'shipping'='{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb
     and value->'checkout_enabled'='false'::jsonb and value->'available_payment_methods'='[]'::jsonb
     and value->'policy_text'='null'::jsonb and value->'payment_instructions'='null'::jsonb then 'PASS' else 'STOP' end from public_projection
)

select check_name,expected,actual,status from results order by check_name;
rollback;
