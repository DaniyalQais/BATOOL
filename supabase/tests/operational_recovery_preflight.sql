begin transaction isolation level repeatable read, read only;
select '01 accepted 011 prerequisite' as label,case when exists(select 1 from pg_proc where oid=to_regprocedure('batool_order_internal.check_complete_order()') and prosecdef)
  and to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is not null and current_user='postgres' then 'PASS' else 'STOP' end as result
union all select '02 new migration absent',case when to_regprocedure('public.checkout_support_open(uuid,text)') is null and to_regclass('batool_checkout_internal.recovery_cases') is null then 'PASS' else 'STOP' end
union all select '03 existing gates closed',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
  and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
union all select '04 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
order by label;
rollback;
