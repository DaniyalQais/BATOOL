begin transaction isolation level repeatable read, read only;
select '01 protected recovery tables' as label,case when (select count(*)=4 and bool_and(relrowsecurity) from pg_class where oid in
  (to_regclass('batool_checkout_internal.recovery_controls'),to_regclass('batool_checkout_internal.recovery_intents'),to_regclass('batool_checkout_internal.recovery_cases'),to_regclass('batool_checkout_internal.recovery_audit')))
  and not exists(select 1 from pg_roles r cross join (values('recovery_controls'),('recovery_intents'),('recovery_cases'),('recovery_audit')) t(n)
    where r.rolname in ('anon','authenticated','service_role') and has_table_privilege(r.oid,'batool_checkout_internal.'||t.n,'SELECT,INSERT,UPDATE,DELETE')) then 'PASS' else 'STOP' end as result
union all select '02 RPC boundaries',case when has_function_privilege('authenticated','public.owner_resolve_recovery(uuid,integer)','EXECUTE')
  and not has_function_privilege('anon','public.owner_resolve_recovery(uuid,integer)','EXECUTE')
  and not has_function_privilege('service_role','public.owner_resolve_recovery(uuid,integer)','EXECUTE')
  and has_function_privilege('service_role','public.checkout_support_result(uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.checkout_support_result(uuid,text)','EXECUTE') then 'PASS' else 'STOP' end
union all select '03 all gates closed',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
  and (select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls)
  and public.checkout_availability()='{"enabled":false,"methods":[]}'::jsonb then 'PASS' else 'STOP' end
union all select '04 new rows absent',case when (select count(*) from batool_checkout_internal.recovery_intents)=0
  and (select count(*) from batool_checkout_internal.recovery_cases)=0 and (select count(*) from batool_checkout_internal.recovery_audit)=0 then 'PASS' else 'STOP' end
union all select '05 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
order by label;
rollback;
