begin transaction isolation level repeatable read, read only;
select '01 exact accepted 012 functions' as label,case when current_user='postgres' and current_setting('session_replication_role')='origin'
  and exists(select 1 from pg_proc where oid=to_regprocedure('public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean)') and prosecdef
    and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""'] and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='6f008d62ef7f6c726b7361c29e770111')
  and exists(select 1 from pg_proc where oid=to_regprocedure('public.owner_resolve_recovery(uuid,integer)') and prosecdef
    and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""'] and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='12da8553b4b62e22f9eb7a7a697a7df0') then 'PASS' else 'STOP' end as result
union all select '02 new helper absent',case when to_regprocedure('batool_checkout_internal.supported_checkout_order(uuid)') is null then 'PASS' else 'STOP' end
union all select '03 gates closed',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
  and (select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls) then 'PASS' else 'STOP' end
union all select '04 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
order by label;
rollback;
