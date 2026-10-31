-- READ ONLY: intended BATOOL project's SQL Editor, before migration 005.
begin transaction read only;
-- First result MUST be empty. Stop/reconcile any existing new object.
select 'bucket' as object_type, id || ' (' || name || ')' as existing_object from storage.buckets
where id in ('product-image-uploads','product-images') or name in ('product-image-uploads','product-images')
union all
select 'table', c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='product_image_assets'
union all
select 'column', table_name || '.' || column_name from information_schema.columns
where table_schema='public' and table_name='products'
and column_name in ('main_image_path','main_image_width','main_image_height','image_alt')
union all
select 'constraint', c.conname from pg_constraint c
where c.conrelid='public.products'::regclass and c.conname in ('products_main_image_valid','products_main_image_path_fkey')
union all
select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('batool_catalog_owner','batool_image_upload_path','register_product_image_asset','owner_attach_product_image')
union all
select 'policy', tablename || '.' || policyname from pg_policies
where (schemaname='storage' and tablename='objects' and policyname in (
  'batool_images_insert_guard','batool_images_read_guard','batool_images_update_guard','batool_images_delete_guard',
  'batool_owner_image_upload','batool_owner_image_upload_read'))
or (schemaname='public' and tablename='product_image_assets' and policyname='owner_image_assets_read')
order by object_type,existing_object;

-- Required existing revision support and platform tables/RLS.
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='edit_revision') as revision_column_exists,
  to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)') is not null as detail_rpc_exists,
  exists(select 1 from pg_trigger where tgrelid='public.products'::regclass and tgname='product_edit_revision' and not tgisinternal and tgenabled='O') as revision_trigger_enabled;
select n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('products','product_variants','dashboard_roles'))
   or (n.nspname='storage' and c.relname in ('objects','buckets'))
order by n.nspname,c.relname;

-- Review all existing policies, especially restrictive policies affecting new buckets.
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies where (schemaname='storage' and tablename in ('objects','buckets'))
or (schemaname='public' and tablename in ('products','product_variants','dashboard_roles'))
order by schemaname,tablename,policyname;
select table_schema,table_name,column_name,grantee,privilege_type
from information_schema.column_privileges
where table_schema='public' and table_name in ('products','product_variants','dashboard_roles')
and grantee in ('PUBLIC','anon','authenticated') and privilege_type in ('INSERT','UPDATE','REFERENCES');
rollback;
