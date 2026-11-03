-- Forward fix discovered by real hosted PostgREST acceptance. Do not replay 006.
-- Changes only the private deferred checker execution context, never row data,
-- order/stock logic, application table grants, RLS, or readiness flags.
begin;
set local lock_timeout='5s';
do $review$ begin
  if current_user<>'postgres' or current_setting('session_replication_role')<>'origin'
    or to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is null
    or not exists(select 1 from pg_proc where oid=to_regprocedure('batool_order_internal.check_complete_order()')
      and pg_get_userbyid(proowner)=current_user and not prosecdef
      and proconfig @> array['search_path=""']
      and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='14fec757168512bb7397e8b03eba05db')
  then raise exception 'STOP: expected accepted 006/010 checker and administrator required'; end if;
  if (select count(*) from pg_trigger where tgfoid=to_regprocedure('batool_order_internal.check_complete_order()')
    and tgname in ('orders_complete','order_items_complete','order_details_complete') and tgdeferrable and tginitdeferred)<>3
  then raise exception 'STOP: expected deferred order completeness triggers required'; end if;
  if not (select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed)
    from batool_checkout_internal.readiness)
  then raise exception 'STOP: keep all intake readiness disabled'; end if;
end; $review$;

-- PostgREST commits after the creator's SECURITY DEFINER context has returned.
-- Deferred triggers must still read the protected order/item/customer/key rows.
-- Preserve the exact checker body and its empty search_path. It is a trigger
-- function in a non-exposed schema, not a callable application RPC.
alter function batool_order_internal.check_complete_order() security definer;
revoke all on function batool_order_internal.check_complete_order() from public,anon,authenticated,service_role;
commit;
