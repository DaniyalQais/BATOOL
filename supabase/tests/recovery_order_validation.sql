-- New 013 regression only; rollback fixtures in the guarded disposable project.
-- SQL-role exercise with a live test Auth session, NOT an actual HTTP Auth test.
begin;
do $$ begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes'
    or not exists(select 1 from batool_acceptance.run where project_ref='jcbxxgjrnkhgcspbscgb' and finished)
    or (select count(*) from public.orders)<>2 then raise exception 'Disposable two-order fixture required'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('batool.probe_user'),
    'session_id',current_setting('batool.probe_session'),'role','authenticated','is_anonymous',false)::text,true);
end $$;
update batool_checkout_internal.recovery_controls set enabled=true,verification_policy_ref=gen_random_uuid();
create temporary table recovery_validation_probe(foundation uuid,checkout uuid,cnew uuid,cold uuid,ccommitted uuid,cmissing uuid,ccheckout uuid);
insert into recovery_validation_probe values(gen_random_uuid(),(select id from public.orders order by id limit 1),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on recovery_validation_probe to authenticated;
do $$ declare p recovery_validation_probe; c uuid; begin
  select * into strict p from recovery_validation_probe;
  insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor) values(p.foundation,'PKR',0,0,0,0,0);
  insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
    values(p.foundation,1,0,'M','SYNTHETIC FOUNDATION FIXTURE',0,1);
  insert into public.order_customer_details(order_id,recipient_name,phone,address_line1,city,country_code)
    values(p.foundation,'Synthetic regression customer','923000000000','Synthetic regression address','Synthetic city','PK');
  insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id) values(gen_random_uuid(),repeat('1',64),repeat('2',64),p.foundation);
  foreach c in array array[p.cnew,p.cold,p.ccommitted,p.cmissing,p.ccheckout] loop
    perform public.checkout_support_open(c,repeat('a',64));
  end loop;
  -- Construct only rollback legacy cases using the preserved original function.
  perform batool_checkout_internal.verify_recovery_v012(p.cold,1,'verify',null,p.foundation,gen_random_uuid(),true);
  perform batool_checkout_internal.verify_recovery_v012(p.ccommitted,1,'verify',null,p.foundation,gen_random_uuid(),true);
  perform batool_checkout_internal.resolve_recovery_v012(p.ccommitted,2);
end $$;
set constraints all immediate;
set local role authenticated;
do $$ declare p record; result jsonb; begin
  select * into strict p from recovery_validation_probe;
  begin
    perform public.owner_verify_recovery(p.cnew,1,'verify',null,p.foundation,gen_random_uuid(),false);
    raise exception 'FAIL: attestation bypass';
  exception when sqlstate 'PT400' then null; end;
  begin
    perform public.owner_verify_recovery(p.cnew,99,'verify',null,p.foundation,gen_random_uuid(),true);
    raise exception 'FAIL: stale verification';
  exception when sqlstate 'PT409' then null; end;
  result:=public.owner_verify_recovery(p.cnew,1,'verify',null,p.foundation,gen_random_uuid(),true);
  if result->>'state'<>'escalated' or result->'original_order'<>'null'::jsonb then raise exception 'FAIL: foundation reference accepted'; end if;
  result:=public.owner_verify_recovery(p.cmissing,1,'verify',null,gen_random_uuid(),gen_random_uuid(),true);
  if result->>'state'<>'escalated' then raise exception 'FAIL: missing identity accepted'; end if;
  begin
    perform public.owner_resolve_recovery(p.cold,1);
    raise exception 'FAIL: stale legacy resolution';
  exception when sqlstate 'PT409' then null; end;
  result:=public.owner_resolve_recovery(p.cold,2);
  if result->>'state'<>'escalated' then raise exception 'FAIL: legacy verified case not blocked'; end if;
  result:=public.owner_resolve_recovery(p.ccommitted,3);
  if result->>'state'<>'escalated' then raise exception 'FAIL: legacy committed case not blocked'; end if;
  result:=public.owner_verify_recovery(p.ccheckout,1,'verify',null,p.checkout,gen_random_uuid(),true);
  if result->>'state'<>'verified' then raise exception 'FAIL: checkout reference rejected'; end if;
  result:=public.owner_resolve_recovery(p.ccheckout,2);
  if result->>'state'<>'committed' then raise exception 'FAIL: checkout receipt path lost'; end if;
  begin
    perform batool_checkout_internal.supported_checkout_order(p.checkout);
    raise exception 'FAIL: private helper exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare p recovery_validation_probe; begin
  select * into strict p from recovery_validation_probe;
  if public.checkout_support_result(p.cnew,repeat('a',64))<>'{"state":"escalated"}'::jsonb
    or public.checkout_support_result(p.cold,repeat('a',64))<>'{"state":"escalated"}'::jsonb
    or public.checkout_support_result(p.ccommitted,repeat('a',64))<>'{"state":"escalated"}'::jsonb then raise exception 'FAIL: unsupported receipt/replacement exposed'; end if;
  if (select count(*) from public.orders)<>3 or (select stock_quantity from public.product_variants where product_id=0 and size='M')<>3
    or exists(select 1 from batool_checkout_internal.quotes where order_id=p.foundation) then raise exception 'FAIL: order/stock/quote changed'; end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role') and
    (has_function_privilege(oid,'batool_checkout_internal.verify_recovery_v012(uuid,integer,text,uuid,uuid,uuid,boolean)','EXECUTE')
      or has_function_privilege(oid,'batool_checkout_internal.resolve_recovery_v012(uuid,integer)','EXECUTE')
      or has_function_privilege(oid,'batool_checkout_internal.supported_checkout_order(uuid)','EXECUTE'))) then raise exception 'FAIL: private grants'; end if;
end $$;
rollback;
select 'PASS new 013 rollback regression: foundation/missing/stale legacy cases blocked, checkout path preserved, no surviving orders or stock changes';
