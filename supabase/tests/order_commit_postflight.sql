-- New 011 metadata/count review only; no mutation RPC or row contents.
begin transaction isolation level repeatable read, read only;
with checks(label,result) as (
 select '01 private checker context and unchanged body',case when exists(select 1 from pg_proc
   where oid=to_regprocedure('batool_order_internal.check_complete_order()') and prosecdef
   and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""']
   and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='14fec757168512bb7397e8b03eba05db') then 'PASS' else 'STOP' end
 union all select '02 no application access',case when not exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role')
   and (has_schema_privilege(oid,'batool_order_internal','USAGE') or has_function_privilege(oid,'batool_order_internal.check_complete_order()','EXECUTE')))
   and not has_table_privilege('service_role','public.orders','SELECT') then 'PASS' else 'STOP' end
 union all select '03 deferred triggers preserved',case when (select count(*) from pg_trigger
   where tgfoid=to_regprocedure('batool_order_internal.check_complete_order()')
   and tgname in ('orders_complete','order_items_complete','order_details_complete') and tgdeferrable and tginitdeferred)=3 then 'PASS' else 'STOP' end
 union all select '04 disabled gates',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
   and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
 union all select '05 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
) select * from checks order by label;
rollback;
