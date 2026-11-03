-- Read-only. Run once AFTER separately approved manual 014 application.
-- Expected: every check PASS, then compare all three hashes with preflight.
begin read only;
select check_name,case when ok then 'PASS' else 'STOP' end result,expected
from (values
 ('01 private decoder bucket',(select not public and file_size_limit=8388608 and allowed_mime_types=array['application/gzip']::text[]
   from storage.buckets where id='product-image-validator-assets'),'Private 8 MiB gzip-only bucket; no client access'),
 ('02 restrictive browser guard',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
   and policyname='batool_decoder_private' and permissive='RESTRICTIVE' and cmd='ALL'
   and roles @> array['anon','authenticated']::name[]),'Restrictive guard covers both browser roles'),
 ('03 private approval',(select relrowsecurity from pg_class where oid='batool_catalog_internal.merchandise_approvals'::regclass)
   and not has_schema_privilege('authenticated','batool_catalog_internal','USAGE')
   and not has_table_privilege('authenticated','batool_catalog_internal.merchandise_approvals','INSERT')
   and not has_table_privilege('service_role','batool_catalog_internal.merchandise_approvals','INSERT'),'RLS and private schema/approval ACLs'),
 ('04 Owner approval RPC',has_function_privilege('authenticated','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE')
   and not has_function_privilege('anon','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE')
   and not has_function_privilege('service_role','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE')
   and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.owner_approve_catalog_merchandise(integer,integer,boolean)'::regprocedure),'Authenticated entrypoint; live Owner guard inside, empty search path'),
 ('05 checkout photo guard',position('batool_catalog_internal.orderable_product(product.id)' in
   pg_get_functiondef('batool_checkout_internal.snapshot(jsonb,text)'::regprocedure))>0
   and not has_function_privilege('authenticated','batool_catalog_internal.orderable_product(integer)','EXECUTE')
   and not has_function_privilege('anon','public.checkout_quote(uuid,jsonb,text)','EXECUTE'),'Same snapshot hardened; private and service-only RPC restrictions retained'),
 ('06 no automatic approval',not exists(select 1 from batool_catalog_internal.merchandise_approvals),'No product approval/backfill from migration'),
 ('07 gates closed',not exists(select 1 from batool_checkout_internal.readiness where enabled or cod_ready or easypaisa_manual_ready or jazzcash_manual_ready)
   and not exists(select 1 from batool_checkout_internal.recovery_controls where enabled)
   and not exists(select 1 from public.business_settings where (settings->>'cod_enabled')::boolean or (settings->>'easypaisa_enabled')::boolean or (settings->>'jazzcash_enabled')::boolean),'Checkout/payment/recovery configuration stays closed')
) checks(check_name,ok,expected) order by check_name;
select '08 MUST equal preflight; no order/stock/catalog changes' label,
 (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'')) from public.products p) products,
 (select md5(coalesce(jsonb_agg(to_jsonb(v) order by product_id,size)::text,'')) from public.product_variants v) stock,
 (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) from public.orders o) orders;
rollback;
