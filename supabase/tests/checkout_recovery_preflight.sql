-- New 010 review only. Do not rerun accepted 009 application/postflight.
-- Metadata/counts/flags only; no checkout mutation RPC or private-value output.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with checks(label,expected,result) as (
 select '01 context','PASS: postgres, read-only, replication origin',case when current_user='postgres'
   and current_setting('transaction_read_only')='on' and current_setting('session_replication_role')='origin' then 'PASS' else 'STOP' end
 union all select '02 preserved creator','PASS: exact 009 creation function, owned by current administrator',case when
   (select p.prosecdef and p.provolatile='v' and pg_get_userbyid(p.proowner)=current_user
     and p.proconfig @> array['search_path=""'] and pg_get_function_result(p.oid)='jsonb'
     and md5(regexp_replace(p.prosrc,'[[:space:]]+','','g'))='58519386f8a878944a9dcb1a69fc3dc4'
    from pg_proc p where p.oid=to_regprocedure('public.checkout_create(uuid,uuid,uuid,jsonb)')) then 'PASS' else 'STOP' end
 union all select '03 dependencies','PASS: accepted 009 schema, tables and quote/recovery helpers exist',case when
   to_regclass('batool_checkout_internal.quotes') is not null and to_regclass('batool_checkout_internal.readiness') is not null
   and to_regclass('public.order_creation_keys') is not null and to_regclass('public.order_checkout_details') is not null
   and to_regprocedure('public.checkout_quote(uuid,jsonb,text)') is not null
   and to_regprocedure('public.checkout_recover(uuid,uuid)') is not null
   and has_schema_privilege(current_user,'batool_checkout_internal','CREATE') then 'PASS' else 'STOP' end
 union all select '04 new names absent','PASS: new table, private base and three new RPC names absent',case when
   to_regclass('batool_checkout_internal.intent_resolutions') is null
   and to_regprocedure('batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)') is null
   and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
     and p.proname in ('checkout_resolve','checkout_resolution','checkout_replacement_quote')) then 'PASS' else 'STOP' end
 union all select '05 current-creator defaults','PASS: no custom-recipient defaults for postgres in affected scopes',case when exists(
   select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
   where d.defaclrole=(select oid from pg_roles where rolname=current_user)
     and d.defaclnamespace in (0,'public'::regnamespace,'batool_checkout_internal'::regnamespace)
     and a.grantee<>d.defaclrole and a.grantee<>0
     and a.grantee not in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))
   ) then 'REVIEW' else 'PASS' end
 union all select '06 disabled gates','PASS: readiness false and public checkout/methods unavailable',case when
   (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed)
     from batool_checkout_internal.readiness)
   and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb
   and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
 union all select '07 existing count baseline','COMPARE: save counts; 010 does not insert/delete existing rows',
   jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),
     'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),
     'history',(select count(*) from public.order_status_history),'checkout_context',(select count(*) from public.order_checkout_details),
     'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants),
     'business_settings',(select count(*) from public.business_settings),'notifications',(select count(*) from public.order_notification_settings),
     'quotes',(select count(*) from batool_checkout_internal.quotes),'rate_windows',(select count(*) from batool_checkout_internal.rate_windows))::text
)
select * from checks order by label;
rollback;
