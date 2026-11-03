-- One read-only review. Expected: every check PASS; retain fingerprint row privately
-- for exact postflight comparison. Do not apply anything automatically.
begin read only;
select check_name,case when ok then 'PASS' else 'STOP' end result,expected
from (values
 ('01 prerequisites',to_regprocedure('public.owner_save_catalog_product(integer,integer,text,text,integer,boolean,jsonb,text,text,text,boolean)') is not null
   and to_regprocedure('public.owner_attach_product_image(integer,integer,text,text)') is not null
   and to_regprocedure('batool_checkout_internal.snapshot(jsonb,text)') is not null
   and to_regclass('batool_checkout_internal.recovery_controls') is not null,'Accepted catalog/checkout/recovery prerequisites exist'),
 ('02 pending migration',to_regclass('batool_catalog_internal.merchandise_approvals') is null
   and to_regprocedure('public.owner_product_media_ready()') is null
   and to_regprocedure('public.owner_approve_catalog_merchandise(integer,integer,boolean)') is null
   and not exists(select 1 from storage.buckets where id='product-image-validator-assets')
   and not exists(select 1 from pg_policies where schemaname='storage' and policyname='batool_decoder_private'),'New 014 objects absent; STOP if already present'),
 ('03 unchanged snapshot',(select md5(replace(prosrc,E'\r\n',E'\n'))='336bc010a9fe2c3ba90b020505375fcd'
   from pg_proc where oid=to_regprocedure('batool_checkout_internal.snapshot(jsonb,text)')),'Original trusted snapshot matches; unexpected changes require review'),
 ('04 RLS',(select bool_and(relrowsecurity) from pg_class where oid in ('public.products'::regclass,'public.product_variants'::regclass,
   'public.product_image_assets'::regclass,'storage.objects'::regclass)),'Existing four tables retain RLS'),
 ('05 no direct catalog writes',not exists(select 1 from information_schema.column_privileges
   where table_schema='public' and table_name in ('products','product_variants','product_image_assets')
     and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE')),'No browser column/table write grants'),
 ('06 receipt service only',has_function_privilege('service_role','public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','EXECUTE')
   and not has_function_privilege('authenticated','public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','EXECUTE')
   and not has_function_privilege('anon','public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','EXECUTE'),'Only trusted service registration'),
 ('07 production gates closed',not exists(select 1 from batool_checkout_internal.readiness
   where enabled or cod_ready or easypaisa_manual_ready or jazzcash_manual_ready)
   and not exists(select 1 from batool_checkout_internal.recovery_controls where enabled)
   and not exists(select 1 from public.business_settings where (settings->>'cod_enabled')::boolean
     or (settings->>'easypaisa_enabled')::boolean or (settings->>'jazzcash_enabled')::boolean),'Checkout, all payments and recovery remain false'),
 ('08 image buckets',(select count(*)=2 from storage.buckets where (id='product-images' and public and file_size_limit=5242880)
   or (id='product-image-uploads' and not public and file_size_limit=5242880)),'Existing validated/public and staging/private buckets unchanged')
) checks(check_name,ok,expected) order by check_name;
select '09 PRESERVE these hashes; exact equality required after migration' label,
 (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.products p) products,
 (select md5(coalesce(jsonb_agg(to_jsonb(v) order by product_id,size)::text,'')) from public.product_variants v) stock,
 (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) from public.orders o) orders;
rollback;
