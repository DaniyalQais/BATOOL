-- Migration 007: one labeled result set. No RPCs, nextval/setval or data writes.
-- Run only in the privately confirmed project, as its trusted SQL administrator.
begin transaction isolation level repeatable read, read only;
with
required_tables(schema_name,table_name) as (values
 ('public','products'),('public','product_variants'),('public','product_image_assets'),
 ('public','dashboard_roles'),('public','orders'),('public','order_items'),
 ('public','order_customer_details'),('public','order_status_history'),('public','order_creation_keys'),
 ('auth','users'),('storage','objects'),('storage','buckets')),
expected_products(id,slug) as (values
 (0,'gulnaar'),(2,'meher'),(3,'saba'),(7,'mira'),(8,'noor'),(11,'zeenat')),
new_names as (
 select 'schema' kind,nspname name from pg_namespace where nspname='batool_catalog_internal'
 union all select 'column',attname from pg_attribute
   where attrelid='public.products'::regclass and not attisdropped and attname in ('draft_managed','archived')
 union all select 'function',p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('owner_create_product_draft','owner_save_catalog_product')
 union all select 'constraint',conname from pg_constraint where conrelid='public.products'::regclass
   and conname in ('products_permanent_ids','products_draft_identity','products_slug_length','products_tag_length')
 union all select 'trigger',tgrelid::regclass::text||'.'||tgname from pg_trigger
   where tgrelid in ('public.products'::regclass,'public.product_variants'::regclass) and not tgisinternal
   and tgname in ('products_draft_guard','products_complete_draft','variants_complete_draft',
     'variants_identity','products_no_truncate','variants_no_truncate')),
expected_columns(table_name,column_name,type_name) as (values
 ('products','id','integer'),('products','slug','text'),('products','name','text'),('products','description','text'),
 ('products','price_minor','integer'),('products','currency','text'),('products','image_slug','text'),
 ('products','image_note','text'),('products','subcategory','text'),('products','color','text'),('products','tag','text'),
 ('products','category','text'),('products','piece_count','integer'),('products','is_demo','boolean'),
 ('products','active','boolean'),('products','sort_order','integer'),('products','edit_revision','integer'),
 ('products','main_image_path','text'),('products','main_image_width','integer'),
 ('products','main_image_height','integer'),('products','image_alt','text'),
 ('product_variants','product_id','integer'),('product_variants','size','text'),
 ('product_variants','active','boolean'),('product_variants','stock_quantity','integer'),
 ('dashboard_roles','user_id','uuid'),('dashboard_roles','role','text'),
 ('product_image_assets','image_path','text'),('product_image_assets','product_id','integer'),
 ('product_image_assets','uploaded_by','uuid'),('product_image_assets','width','integer'),
 ('product_image_assets','height','integer'),('product_image_assets','byte_size','integer'),
 ('product_image_assets','sha256','text'),('product_image_assets','attached_at','timestamp with time zone')),
-- Whitespace-normalized body hashes from applied migration source 001/004/005.
-- Any mismatch requires review; even a comment edit can change a source hash.
expected_functions(signature,result_type,definer,volatility,body_md5,arg_names) as (values
 ('public.batool_catalog_updated_at()','trigger',false,'v','077bb7aa35a4fed76f447b242607c205',array[]::text[]),
 ('public.batool_product_revision()','trigger',false,'v','4aba5178a32335ffddbb461296ffd6d9',array[]::text[]),
 ('public.batool_variant_revision()','trigger',true,'v','c02a456d0258bb1d97ac16a161054d49',array[]::text[]),
 ('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)','jsonb',true,'v','53eb44401d1e92d74157c45535e716d8',array['p_product_id','p_expected_revision','p_name','p_description','p_price_minor','p_active','p_stocks']),
 ('public.batool_catalog_owner()','boolean',true,'s','a87175634ff5ebbfe49e2fcbb3353df8',array[]::text[]),
 ('public.batool_image_upload_path(text,uuid)','boolean',false,'i','dc7e21294d8e2720bc3e9b8aa63a5f3a',array['p_name','p_user']),
 ('public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','void',true,'v','7eae250a9560dc519b2ad33a84aad6e5',array['p_product_id','p_user_id','p_image_path','p_width','p_height','p_byte_size','p_sha256']),
 ('public.owner_attach_product_image(integer,integer,text,text)','jsonb',true,'v','086101715cc3212e8ff19ee761886d1f',array['p_product_id','p_expected_revision','p_image_path','p_alt'])),
function_report as (
 select e.signature,p.oid is not null as present,
   coalesce(p.prorettype::regtype::text=e.result_type and p.prosecdef=e.definer
     and p.provolatile::text=e.volatility and p.prokind='f' and not p.proretset
     and coalesce(p.proargnames,array[]::text[])=e.arg_names
     and p.proconfig=array['search_path=""'],false) as contract_matches,
   coalesce(md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')))=e.body_md5,false) as source_matches,
   pg_get_userbyid(p.proowner) as owner,p.proconfig,
   has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
   has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
   has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,p.proacl::text as acl
 from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature)),
results(check_name,expected,actual) as (
 select '00_context','read_only on; create_schema/create_public/reference_auth_id/owner_accounts_present true; trusted administrator owns target objects',
   jsonb_build_object('current_role',current_user,'read_only',current_setting('transaction_read_only'),
     'create_schema',has_database_privilege(current_user,current_database(),'CREATE'),
     'create_public',has_schema_privilege(current_user,'public','CREATE'),
     'reference_auth_id',has_column_privilege(current_user,'auth.users','id','REFERENCES'),
     'owner_accounts_present',exists(select 1 from public.dashboard_roles r join auth.users u on u.id=r.user_id where r.role='owner'))
 union all select '01_new_object_conflicts','[] (zero conflicts)',
   coalesce((select jsonb_agg(to_jsonb(n) order by kind,name) from new_names n),'[]'::jsonb)
 union all select '02_required_tables','12 present tables; all 9 public tables have RLS enabled; review owners',
   (select jsonb_agg(jsonb_build_object('table',r.schema_name||'.'||r.table_name,'present',c.oid is not null,
     'kind',c.relkind,'rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner)) order by r.schema_name,r.table_name)
    from required_tables r left join pg_class c on c.oid=to_regclass(format('%I.%I',r.schema_name,r.table_name)))
 union all select '03_columns','Every type_matches true; image_slug/subcategory/color/tag NOT NULL before 007; edit_revision NOT NULL/default 1',
   (select jsonb_agg(jsonb_build_object('table',e.table_name,'column',e.column_name,'type',format_type(a.atttypid,a.atttypmod),
     'type_matches',coalesce(format_type(a.atttypid,a.atttypmod)=e.type_name,false),'not_null',a.attnotnull,
     'default',pg_get_expr(d.adbin,d.adrelid)) order by e.table_name,e.column_name)
    from expected_columns e left join pg_attribute a on a.attrelid=to_regclass('public.'||e.table_name)
      and a.attname=e.column_name and not a.attisdropped
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum)
 union all select '04_id_allocation','integer; default/owned_sequence null; identity empty; sequence_dependencies []; max_id 11; proposed_next 12; reserved/unexpected IDs 0',
   (select jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid),
     'identity',a.attidentity,'owned_sequence',pg_get_serial_sequence('public.products','id'),
     'max_id',(select max(id) from public.products),'proposed_next',greatest(12::bigint,(select coalesce(max(id)::bigint+1,12) from public.products)),
     'reserved_ids',(select count(*) from public.products where id in (9,10)),
     'unexpected_ids',(select count(*) from public.products where id not in (0,2,3,7,8,11)),
     'sequence_dependencies',coalesce((select jsonb_agg(s.oid::regclass::text) from pg_depend dep join pg_class s on s.oid=dep.objid and s.relkind='S'
       where dep.classid='pg_class'::regclass and dep.refclassid='pg_class'::regclass and dep.refobjid=a.attrelid and dep.refobjsubid=a.attnum),'[]'::jsonb))
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.products'::regclass and a.attname='id')
 union all select '05_retained_products','6 rows; identity_matches true; variants 4/sizes [L,M,S,XL]; active rows have 4 active variants; all issue/missing counts 0',
   jsonb_build_object('rows',(select jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'image_slug',p.image_slug,'active',p.active,
     'identity_matches',coalesce(p.slug=e.slug and p.image_slug=e.slug,false),
     'variants',(select count(*) from public.product_variants v where v.product_id=p.id),
     'sizes',(select jsonb_agg(v.size order by v.size) from public.product_variants v where v.product_id=p.id),
     'active_variants',(select count(*) from public.product_variants v where v.product_id=p.id and v.active)) order by p.id)
     from public.products p left join expected_products e on e.id=p.id),
     'missing_retained_ids',(select count(*) from expected_products e where not exists(select 1 from public.products p where p.id=e.id)),
     'new_constraint_issues',(select count(*) from public.products where id not in (0,2,3,7,8,11) or char_length(slug)>160 or char_length(btrim(tag)) not between 1 and 80),
     'image_reference_issues',(select count(*) from public.products p where p.main_image_path is not null and not exists
       (select 1 from public.product_image_assets a where a.image_path=p.main_image_path and a.product_id=p.id and a.width=p.main_image_width and a.height=p.main_image_height)))
 union all select '06_function_contracts','8 present; every contract_matches/source_matches true. Owner update/attach anon false/auth true; registration anon/auth false/service true. Review other ACLs; 007 revokes service execution on Owner mutations',
   (select jsonb_agg(to_jsonb(f) order by signature) from function_report f)
 union all select '07_existing_triggers','4 enabled (O) foundation triggers: products_updated_at, product_edit_revision, variants_updated_at, variant_edit_revision; review definitions/extras',
   coalesce((select jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,
     'definition',pg_get_triggerdef(oid)) order by tgrelid::regclass::text,tgname) from pg_trigger
     where tgrelid in ('public.products'::regclass,'public.product_variants'::regclass) and not tgisinternal),'[]'::jsonb)
 union all select '08_constraints','Validated products PK(id), named UNIQUE products_slug_key(slug), variants PK(product_id,size), image FK/checks including product_image_asset_path, role/Auth and order-item/variant FKs; review definitions',
   (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'type',c.contype,
     'validated',c.convalidated,'index_valid',i.indisvalid,'definition',pg_get_constraintdef(c.oid)) order by c.conrelid::regclass::text,c.conname)
    from pg_constraint c left join pg_index i on i.indexrelid=c.conindid where c.conrelid in
      ('public.products'::regclass,'public.product_variants'::regclass,'public.product_image_assets'::regclass,
       'public.dashboard_roles'::regclass,'public.order_items'::regclass))
 union all select '09_policies','Review expressions: 6 public catalog/role/image SELECT policies; 4 restrictive Storage guards + 2 Owner staging policies. Extra/custom policies require review; names alone prove nothing',
   (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where
     (schemaname='public' and tablename in ('products','product_variants','product_image_assets','dashboard_roles'))
     or (schemaname='storage' and tablename='objects'))
 union all select '10_effective_browser_privileges','anon/auth: superuser/bypassrls/service_member false. SELECT products/variants true; SELECT roles/assets only auth. Every listed table/column write privilege false',
   (select jsonb_agg(jsonb_build_object('role',r.rolname,'superuser',r.rolsuper,'bypassrls',r.rolbypassrls,
     'service_member',pg_has_role(r.oid,'service_role','MEMBER'),
     'inherited_roles',coalesce((select jsonb_agg(parent.rolname order by parent.rolname) from pg_roles parent
       where parent.oid<>r.oid and pg_has_role(r.oid,parent.oid,'USAGE')),'[]'::jsonb),
     'tables',(select jsonb_agg(jsonb_build_object('table',t,'select',has_table_privilege(r.oid,t,'SELECT'),
       'insert',has_table_privilege(r.oid,t,'INSERT'),'update',has_table_privilege(r.oid,t,'UPDATE'),
       'delete',has_table_privilege(r.oid,t,'DELETE'),'truncate',has_table_privilege(r.oid,t,'TRUNCATE'),
       'column_insert',has_any_column_privilege(r.oid,t,'INSERT'),'column_update',has_any_column_privilege(r.oid,t,'UPDATE')) order by t)
       from unnest(array['public.products','public.product_variants','public.product_image_assets','public.dashboard_roles']) as tables(t))) order by r.rolname)
     from pg_roles r where r.rolname in ('anon','authenticated'))
 union all select '11_dependencies','Review tracked function/table dependents; expected catalog/image/role/order-item objects. PL/pgSQL string-body references are not exhaustive; source checks also required',
   coalesce((select jsonb_agg(jsonb_build_object('referenced',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),
     'dependent',pg_describe_object(d.classid,d.objid,d.objsubid),'kind',d.deptype)
     order by d.refclassid,d.refobjid,d.classid,d.objid,d.objsubid) from pg_depend d where
     (d.refclassid='pg_proc'::regclass and d.refobjid in
       (to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)'),
        to_regprocedure('public.owner_attach_product_image(integer,integer,text,text)'),to_regprocedure('public.batool_image_upload_path(text,uuid)')))
     or (d.refclassid='pg_class'::regclass and d.refobjid in
       ('public.products'::regclass,'public.product_variants'::regclass,'public.product_image_assets'::regclass))), '[]'::jsonb)
 union all select '12_default_privileges','Review executor defaults, global/public/schema grants and inherited custom roles. No unreviewed application grant may survive 007 revokes',
   coalesce((select jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),
     'schema',case when defaclnamespace=0 then '(global)' else defaclnamespace::regnamespace::text end,
     'object_type',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl),'[]'::jsonb)
 union all select '13_catalog_baseline','Save for post-007 comparison: counts/hashes unchanged after excluding two new product columns. Fingerprints are not authorization evidence',
   jsonb_build_object('products_count',(select count(*) from public.products),
     'products_md5',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.products p),
     'variants_count',(select count(*) from public.product_variants),
     'variants_md5',(select md5(coalesce(jsonb_agg(to_jsonb(v) order by product_id,size)::text,'[]')) from public.product_variants v),
     'roles_count',(select count(*) from public.dashboard_roles),
     'roles_md5',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by user_id)::text,'[]')) from public.dashboard_roles r),
     'image_receipts_count',(select count(*) from public.product_image_assets),
     'image_receipts_md5',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by image_path)::text,'[]')) from public.product_image_assets a))
 union all select '14_platform_dependencies','Every function present/type_matches true; every platform column type_matches true',
   jsonb_build_object('functions',(select jsonb_agg(jsonb_build_object('function',f.signature,'present',p.oid is not null,
     'type_matches',coalesce(p.prorettype::regtype::text=f.result_type,false)) order by f.signature)
     from (values ('auth.uid()','uuid'),('auth.jwt()','jsonb'),
       ('pg_catalog.nextval(regclass)','bigint'),('pg_catalog.setval(regclass,bigint,boolean)','bigint'),
       ('pg_catalog.hashtextextended(text,bigint)','bigint'),('pg_catalog.pg_advisory_xact_lock(bigint)','void')) as f(signature,result_type)
     left join pg_proc p on p.oid=to_regprocedure(f.signature)),
     'columns',(select jsonb_agg(jsonb_build_object('table',e.table_name,'column',e.column_name,
       'type_matches',coalesce(format_type(a.atttypid,a.atttypmod)=e.type_name,false)) order by e.table_name,e.column_name)
       from (values ('auth.users','id','uuid'),('storage.objects','bucket_id','text'),
         ('storage.objects','name','text'),('storage.objects','metadata','jsonb'),('storage.objects','owner_id','text')) as e(table_name,column_name,type_name)
       left join pg_attribute a on a.attrelid=to_regclass(e.table_name) and a.attname=e.column_name and not a.attisdropped))
 union all select '15_unexpected_function_overloads','[] (only the eight expected foundation function signatures)',
   coalesce((select jsonb_agg(jsonb_build_object('function',p.oid::regprocedure::text,
     'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'acl',p.proacl::text) order by p.oid::regprocedure::text)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
     and p.proname in ('batool_catalog_updated_at','batool_product_revision','batool_variant_revision',
       'owner_update_catalog_product','batool_catalog_owner','batool_image_upload_path',
       'register_product_image_asset','owner_attach_product_image')
     and not exists(select 1 from expected_functions e where to_regprocedure(e.signature)=p.oid)),'[]'::jsonb)
)
select check_name,expected,actual from results order by check_name;
rollback;
