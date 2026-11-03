-- New 011 metadata/count review only; no mutation RPC or row contents.
begin transaction isolation level repeatable read, read only;
with checks(label,result) as (
 select '01 context',case when current_user='postgres' and current_setting('transaction_read_only')='on'
   and current_setting('session_replication_role')='origin' then 'PASS' else 'STOP' end
 union all select '02 original private checker',case when exists(select 1 from pg_proc
   where oid=to_regprocedure('batool_order_internal.check_complete_order()') and not prosecdef
   and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""']
   and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='14fec757168512bb7397e8b03eba05db') then 'PASS' else 'STOP' end
 union all select '03 deferred triggers',case when (select count(*) from pg_trigger
   where tgfoid=to_regprocedure('batool_order_internal.check_complete_order()')
   and tgname in ('orders_complete','order_items_complete','order_details_complete') and tgdeferrable and tginitdeferred)=3 then 'PASS' else 'STOP' end
 union all select '04 accepted recovery prerequisite',case when to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is not null then 'PASS' else 'STOP' end
 union all select '05 disabled gates',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
   and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb then 'PASS' else 'STOP' end
 union all select '06 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'customers',(select count(*) from public.order_customer_details),'keys',(select count(*) from public.order_creation_keys),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
) select * from checks order by label;
rollback;
