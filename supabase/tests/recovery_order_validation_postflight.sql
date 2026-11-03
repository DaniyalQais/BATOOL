begin transaction isolation level repeatable read, read only;
select '01 private helpers restricted' as label,case when not exists(select 1 from pg_roles r cross join (values
  ('batool_checkout_internal.supported_checkout_order(uuid)'),('batool_checkout_internal.verify_recovery_v012(uuid,integer,text,uuid,uuid,uuid,boolean)'),('batool_checkout_internal.resolve_recovery_v012(uuid,integer)')) f(signature)
  where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,f.signature,'EXECUTE'))
  and (select count(*)=3 and bool_and(prosecdef and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""']) from pg_proc where oid in
    (to_regprocedure('batool_checkout_internal.supported_checkout_order(uuid)'),to_regprocedure('public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean)'),to_regprocedure('public.owner_resolve_recovery(uuid,integer)'))) then 'PASS' else 'STOP' end as result
union all select '02 public wrappers authenticated only',case when not exists(select 1 from pg_roles r cross join(values
  ('public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean)'),('public.owner_resolve_recovery(uuid,integer)')) f(signature)
  where r.rolname in('anon','authenticated','service_role') and has_function_privilege(r.oid,f.signature,'EXECUTE') is distinct from (r.rolname='authenticated')) then 'PASS' else 'STOP' end
union all select '03 gates closed',case when (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
  and (select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls)
  and public.checkout_availability()='{"enabled":false,"methods":[]}'::jsonb then 'PASS' else 'STOP' end
union all select '04 baseline counts',jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items),'keys',(select count(*) from public.order_creation_keys),'customers',(select count(*) from public.order_customer_details),'history',(select count(*) from public.order_status_history),'context',(select count(*) from public.order_checkout_details),'products',(select count(*) from public.products),'variants',(select count(*) from public.product_variants))::text
order by label;
rollback;
