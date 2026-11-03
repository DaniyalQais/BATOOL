-- One combined READ-ONLY review. Exact pending file: 20261102000900_secure_checkout.sql.
-- Run as trusted SQL administrator. Share every labeled result, never settings/credentials.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with checks(label,expected,result) as (
 select '01 execution identity','PASS: trusted postgres administrator',case when current_user='postgres' then 'PASS' else 'STOP' end
 union all select '02 dependencies','PASS: applied catalog, role, order and settings foundations',case when
   to_regclass('public.products') is not null and to_regclass('public.product_variants') is not null
   and to_regclass('public.orders') is not null and to_regclass('public.order_items') is not null
   and to_regclass('public.order_customer_details') is not null and to_regclass('public.order_creation_keys') is not null
   and to_regclass('public.order_status_history') is not null and to_regclass('public.business_settings') is not null
   and to_regprocedure('public.batool_catalog_owner()') is not null
   and to_regprocedure('batool_order_internal.reject_mutation()') is not null
   and to_regprocedure('batool_settings_internal.valid_phone(jsonb)') is not null
   and to_regprocedure('batool_settings_internal.valid_email(jsonb)') is not null
   and to_regprocedure('public.owner_save_business_settings(integer,jsonb)') is not null
   and to_regprocedure('public.owner_create_product_draft(uuid,text,text,integer,jsonb)') is not null
   then 'PASS' else 'STOP' end
 union all select '03 name conflicts','PASS: every 009 name absent',case when
   to_regnamespace('batool_checkout_internal') is null and to_regclass('public.order_checkout_details') is null
   and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('checkout_admit','checkout_quote','checkout_create','checkout_recover')) then 'PASS' else 'STOP' end
 union all select '04 default ACLs','PASS: no unexpected default grantees; otherwise REVIEW before applying',case when exists(
   select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclnamespace in (0,'public'::regnamespace) and a.grantee<>d.defaclrole and a.grantee<>0
     and a.grantee not in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))
   ) then 'REVIEW' else 'PASS' end
 union all select '05 application roles','PASS: roles present and anon/authenticated neither superuser nor BYPASSRLS',case when
   (select count(*)=3 from pg_roles where rolname in ('anon','authenticated','service_role'))
   and not exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then 'PASS' else 'STOP' end
 union all select '06 PostgreSQL','PASS: PostgreSQL 15+ sha256 and advisory lock functions available',case when
   current_setting('server_version_num')::integer>=150000 and to_regprocedure('pg_catalog.sha256(bytea)') is not null
   and to_regprocedure('pg_catalog.pg_advisory_xact_lock(bigint)') is not null then 'PASS' else 'STOP' end
 union all select '07 existing row baseline','COMPARE: save counts; migration must not change these rows',
   jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),
    'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),
    'history',(select count(*) from public.order_status_history),'products',(select count(*) from public.products),
    'variants',(select count(*) from public.product_variants),'business_settings',(select count(*) from public.business_settings),
    'notifications',(select count(*) from public.order_notification_settings))::text
 union all select '08 public intake gate','PASS: public checkout false and no available methods',case when
   public.get_public_business_settings()->'checkout_enabled'='false'::jsonb
   and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
)
select * from checks order by label;
rollback;
