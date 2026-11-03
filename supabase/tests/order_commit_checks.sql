-- NEW regression only. Requires the owned hosted fixture and 011.
-- Synthetic SQL-role evidence, distinct from actual Auth-session/HTTP checks.
begin;
set local statement_timeout='30s';
do $guard$ begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes'
    or not exists(select 1 from batool_acceptance.run where project_ref='jcbxxgjrnkhgcspbscgb')
    or exists(select 1 from public.orders) or exists(select 1 from auth.users)
    or (select count(*) from public.products)<>1
    or not exists(select 1 from public.products where id=0 and slug='hosted-acceptance-only' and price_minor=100001)
  then raise exception 'STOP: owned zero-order disposable hosted fixture required'; end if;
end; $guard$;
update batool_checkout_internal.readiness set enabled=true,cod_ready=true,zero_tax_reviewed=true;
update public.business_settings set settings=settings||'{"cod_enabled":true}'::jsonb;
create temporary table commit_probe_scope(id uuid, key uuid);
insert into commit_probe_scope values(gen_random_uuid(),gen_random_uuid());
grant select on commit_probe_scope to service_role;
set local role service_role;
select public.checkout_create(id,key,(public.checkout_quote(id,'[{"id":0,"size":"M","quantity":1}]'::jsonb,'cod')->>'quote_id')::uuid,
  '{"recipient_name":"Synthetic acceptance customer","phone":"923000000000","email":null,"address_line1":"Synthetic fixture address","address_line2":null,"city":"Synthetic city","region":null,"postal_code":null,"country_code":"PK"}'::jsonb)
from commit_probe_scope;
-- This executes AFTER leaving the creator's privileged function context.
set constraints all immediate;
reset role;
do $complete$ begin
  if (select count(*) from public.orders)<>1 or (select stock_quantity from public.product_variants where product_id=0 and size='M')<>4
    or has_table_privilege('service_role','public.orders','SELECT')
    or has_function_privilege('service_role','batool_order_internal.check_complete_order()','EXECUTE')
  then raise exception 'FAIL: complete order or private execution boundary'; end if;
end; $complete$;
set constraints all deferred;
do $incomplete$ begin
  begin
    insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
      values('PKR',0,0,0,0,0);
    set constraints all immediate;
  exception when check_violation then return;
  end;
  raise exception 'FAIL: incomplete order accepted';
end; $incomplete$;
rollback;
