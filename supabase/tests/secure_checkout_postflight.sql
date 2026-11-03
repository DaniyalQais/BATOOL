-- Combined READ-ONLY postflight for 20261102000900_secure_checkout.sql.
-- No customer/account/notification values or credentials printed; no mutation RPCs.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with
-- BEGIN GENERATED SOURCES
sources(signature,body_md5) as (values
 ('public.checkout_admit(text)','0207dbbe3d5925cf68eab3d0a32f1941'),
 ('batool_checkout_internal.cart(jsonb)','fe95912193676d9f56d5cf3d4cc92023'),
 ('batool_checkout_internal.customer(jsonb)','0fc40744f76933da77fe5df7534dcc13'),
 ('batool_checkout_internal.snapshot(jsonb,text)','12b1747bfc052848af2998d49b010f5e'),
 ('public.checkout_quote(uuid,jsonb,text)','908979db00d1ad2784bb6e3d05803592'),
 ('public.checkout_recover(uuid,uuid)','f4faa925ba144b8c64868741d2fffd58'),
 ('public.checkout_create(uuid,uuid,uuid,jsonb)','58519386f8a878944a9dcb1a69fc3dc4')),
-- END GENERATED SOURCES
rpc(signature) as (values ('public.checkout_admit(text)'),('public.checkout_quote(uuid,jsonb,text)'),
 ('public.checkout_create(uuid,uuid,uuid,jsonb)'),('public.checkout_recover(uuid,uuid)')),
checks(label,expected,result) as (
 select '01 objects','PASS: private schema, three private tables and Owner context table',case when
   to_regclass('batool_checkout_internal.readiness') is not null and to_regclass('batool_checkout_internal.quotes') is not null
   and to_regclass('batool_checkout_internal.rate_windows') is not null and to_regclass('public.order_checkout_details') is not null
   then 'PASS' else 'STOP' end
 union all select '02 operational gate','PASS: one row; every readiness flag false',case when
   (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed)
     from batool_checkout_internal.readiness) then 'PASS' else 'STOP' end
 union all select '03 RPC contracts','PASS: four SECURITY DEFINER RPCs, empty search path, service-only execution',case when
   (select count(*)=4 and bool_and(coalesce(p.oid is not null and p.prosecdef and p.proconfig @> array['search_path=""']
      and has_function_privilege('service_role',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.privilege_type='EXECUTE' and a.grantee not in (p.proowner,(select oid from pg_roles where rolname='service_role'))),false))
    from rpc r left join pg_proc p on p.oid=to_regprocedure(r.signature)) then 'PASS' else 'STOP' end
 union all select '04 internal access','PASS: no application-role private schema access',case when not exists(
   select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
   and has_schema_privilege(oid,'batool_checkout_internal','USAGE')) then 'PASS' else 'STOP' end
 union all select '05 context authorization','PASS: RLS, authenticated SELECT only, Owner policy and immutable triggers',case when
   (select relrowsecurity from pg_class where oid='public.order_checkout_details'::regclass)
   and has_table_privilege('authenticated','public.order_checkout_details','SELECT')
   and not has_table_privilege('anon','public.order_checkout_details','SELECT')
   and not has_table_privilege('service_role','public.order_checkout_details','SELECT')
   and not exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
     and has_table_privilege(oid,'public.order_checkout_details','INSERT,UPDATE,DELETE,TRUNCATE'))
   and (select count(*)=1 and bool_and(polcmd='r' and pg_get_expr(polqual,polrelid) like '%batool_catalog_owner%')
     from pg_policy where polrelid='public.order_checkout_details'::regclass)
   and (select count(*)=2 from pg_trigger where tgrelid='public.order_checkout_details'::regclass and not tgisinternal and tgenabled='O') then 'PASS' else 'STOP' end
 union all select '06 new data','PASS: no quotes, rate buckets or checkout context created by application',case when
   not exists(select 1 from batool_checkout_internal.quotes) and not exists(select 1 from batool_checkout_internal.rate_windows)
   and not exists(select 1 from public.order_checkout_details) then 'PASS' else 'STOP' end
 union all select '07 existing row baseline','COMPARE: all counts equal saved preflight',
   jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),
    'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),
    'history',(select count(*) from public.order_status_history),'products',(select count(*) from public.products),
    'variants',(select count(*) from public.product_variants),'business_settings',(select count(*) from public.business_settings),
    'notifications',(select count(*) from public.order_notification_settings))::text
 union all select '08 public intake gate','PASS: public checkout false and no available methods',case when
   public.get_public_business_settings()->'checkout_enabled'='false'::jsonb
   and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
 union all select '09 function source fingerprints','PASS: exact seven checkout function bodies match the prepared migration',case when
   (select count(*)=7 and bool_and(coalesce(md5(regexp_replace(p.prosrc,'[[:space:]]+','','g'))=s.body_md5,false))
     from sources s left join pg_proc p on p.oid=to_regprocedure(s.signature)) then 'PASS' else 'STOP' end
)
select * from checks order by label;
rollback;
