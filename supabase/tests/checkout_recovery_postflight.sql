-- New 010 read-only review. No mutation RPCs or private-value output.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with
-- BEGIN GENERATED SOURCES
sources(signature,body_md5) as (values
 ('public.checkout_create(uuid,uuid,uuid,jsonb)','1654b5b0eb8039d7202186202e5aebfc'),
 ('public.checkout_resolution(uuid,uuid,uuid)','3d6c58e7bdedba5c313a2083f0a5980c'),
 ('public.checkout_resolve(uuid,uuid,uuid)','caff3f4eae76fb602ff52f5dbd32032e'),
 ('public.checkout_replacement_quote(uuid,uuid,jsonb,text)','1990c5ba4ef8e8114d6b2718609eaeba'),
 ('batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)','58519386f8a878944a9dcb1a69fc3dc4')),
-- END GENERATED SOURCES
rpc(signature) as (values ('public.checkout_create(uuid,uuid,uuid,jsonb)'),('public.checkout_resolve(uuid,uuid,uuid)'),
 ('public.checkout_resolution(uuid,uuid,uuid)'),('public.checkout_replacement_quote(uuid,uuid,jsonb,text)')),
checks(label,expected,result) as (
 select '01 resolution storage','PASS: new private empty table with protected access',case when
   to_regclass('batool_checkout_internal.intent_resolutions') is not null
   and not exists(select 1 from batool_checkout_internal.intent_resolutions)
   and not exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
     and (has_schema_privilege(oid,'batool_checkout_internal','USAGE')
       or has_table_privilege(oid,'batool_checkout_internal.intent_resolutions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')))
   then 'PASS' else 'STOP' end
 union all select '02 RPC boundary','PASS: four service-only SECURITY DEFINER RPCs, empty search path',case when
   (select count(*)=4 and bool_and(coalesce(p.oid is not null and p.prosecdef and p.proconfig @> array['search_path=""']
     and has_function_privilege('service_role',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')
     and not has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.privilege_type='EXECUTE'
       and a.grantee not in (p.proowner,(select oid from pg_roles where rolname='service_role'))),false))
    from rpc r left join pg_proc p on p.oid=to_regprocedure(r.signature)) then 'PASS' else 'STOP' end
 union all select '03 base not callable','PASS: preserved 009 creator is private and has no application execution grant',case when
   to_regprocedure('batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)') is not null
   and not exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
     and has_function_privilege(oid,'batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)','EXECUTE')) then 'PASS' else 'STOP' end
 union all select '04 source fingerprints','PASS: five function bodies, including unchanged private 009 transaction',case when
   (select count(*)=5 and bool_and(coalesce(md5(regexp_replace(p.prosrc,'[[:space:]]+','','g'))=s.body_md5,false))
    from sources s left join pg_proc p on p.oid=to_regprocedure(s.signature)) then 'PASS' else 'STOP' end
 union all select '05 disabled gates','PASS: readiness false; public checkout false and methods empty',case when
   (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed)
    from batool_checkout_internal.readiness)
   and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb
   and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
 union all select '06 existing count baseline','COMPARE: all twelve counts match preflight',
   jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),
     'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),
     'history',(select count(*) from public.order_status_history),'checkout_context',(select count(*) from public.order_checkout_details),
     'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants),
     'business_settings',(select count(*) from public.business_settings),'notifications',(select count(*) from public.order_notification_settings),
     'quotes',(select count(*) from batool_checkout_internal.quotes),'rate_windows',(select count(*) from batool_checkout_internal.rate_windows))::text
)
select * from checks order by label;
rollback;
