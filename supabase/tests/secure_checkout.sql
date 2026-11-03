-- EMPTY DISPOSABLE DATABASE ONLY. No real Auth or hosted API is exercised.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if current_setting('batool.test_disposable',true) is distinct from 'yes'
   or exists(select 1 from auth.users) or exists(select 1 from public.products)
   or exists(select 1 from public.orders) or exists(select 1 from batool_checkout_internal.quotes)
   or (select enabled from batool_checkout_internal.readiness) then raise exception 'Requires empty disposable checkout database'; end if;
end; $$;
\i supabase/tests/secure_checkout_fixtures.sql
create temp table context(quote jsonb,receipt jsonb);
grant select,update on context to service_role;
insert into context values(null,null);
-- Shopper roles cannot invoke privileged RPCs or bypass private-table grants.
set local role anon;
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1}]','cod')$q$,'42501');
select pg_temp.expect_error('select * from public.order_checkout_details','42501');
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select public.checkout_create(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),pg_temp.customer())$q$,'42501');
select pg_temp.expect_error('update public.business_settings set settings=settings','42501');
reset role;
set local role service_role;
select pg_temp.expect_error('select * from batool_checkout_internal.readiness','42501');
select pg_temp.expect_error('select * from public.order_customer_details','42501');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1,"unit_price_minor":1}]','cod')$q$,'PT400');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1},{"id":0,"size":"S","quantity":1}]','cod')$q$,'PT400');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":3,"size":"S","quantity":1}]','cod')$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":6}]','cod')$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1}]','easypaisa')$q$,'PT503');
reset role;
update public.product_variants set stock_quantity=null where product_id=0 and size='L';
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"L","quantity":1}]','cod')$q$,'PT409');
update public.business_settings set settings=jsonb_set(settings,'{shipping}','{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}');
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1}]','cod')$q$,'PT503');
update public.business_settings set settings=jsonb_set(settings,'{shipping}','{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":25001}');
-- Exact quote, changed trusted price must reject without taking stock/order writes.
update context set quote=public.checkout_quote('00000000-0000-4000-8000-000000000911','[{"id":2,"size":"M","quantity":2},{"id":0,"size":"S","quantity":1}]','cod');
update public.products set price_minor=price_minor+1 where id=0;
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(select (quote->>'quote_id')::uuid from context),pg_temp.customer())$q$,'PT409');
select pg_temp.assert_true(not exists(select 1 from public.orders) and (select stock_quantity=5 from public.product_variants where product_id=0 and size='S'),'price change rollback');
update public.products set price_minor=price_minor-1 where id=0;
-- Insufficient later line rolls back the entire attempt.
update public.product_variants set stock_quantity=1 where product_id=2 and size='M';
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(select (quote->>'quote_id')::uuid from context),pg_temp.customer())$q$,'PT409');
select pg_temp.assert_true(not exists(select 1 from public.orders) and (select stock_quantity=5 from public.product_variants where product_id=0 and size='S'),'insufficient later line atomicity');
update public.product_variants set stock_quantity=5 where product_id=2 and size='M';
-- An injected failure AFTER decrements/items/private details/key insertion proves rollback.
create function pg_temp.fail_checkout() returns trigger language plpgsql as $$ begin raise exception using errcode='P0001',message='Synthetic rollback'; end; $$;
create trigger synthetic_checkout_failure before insert on public.order_checkout_details for each row execute function pg_temp.fail_checkout();
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(select (quote->>'quote_id')::uuid from context),pg_temp.customer())$q$,'P0001');
drop trigger synthetic_checkout_failure on public.order_checkout_details;
select pg_temp.assert_true(not exists(select 1 from public.orders) and not exists(select 1 from public.order_items)
 and not exists(select 1 from public.order_customer_details) and not exists(select 1 from public.order_creation_keys)
 and not exists(select 1 from public.order_status_history) and (select stock_quantity=5 from public.product_variants where product_id=0 and size='S'),'late failure full rollback');
set local role service_role;
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(select (quote->>'quote_id')::uuid from context),pg_temp.customer()||'{"payment_status":"paid"}')$q$,'PT400');
update context set receipt=public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(quote->>'quote_id')::uuid,pg_temp.customer());
select pg_temp.assert_true((select receipt=public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(quote->>'quote_id')::uuid,pg_temp.customer()) from context),'identical retry same receipt');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911','00000000-0000-4000-8000-000000000921',(select (quote->>'quote_id')::uuid from context),jsonb_set(pg_temp.customer(),'{city}','"Different"'))$q$,'PT409');
select pg_temp.assert_true(public.checkout_recover('00000000-0000-4000-8000-000000000912','00000000-0000-4000-8000-000000000921') is null,'cross-scope recovery denied');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000912',gen_random_uuid(),(select (quote->>'quote_id')::uuid from context),pg_temp.customer())$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000000911',gen_random_uuid(),(select (quote->>'quote_id')::uuid from context),pg_temp.customer())$q$,'PT409');
reset role;
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert_true((select count(*)=1 from public.orders) and (select count(*)=2 from public.order_items)
 and (select stock_quantity=4 from public.product_variants where product_id=0 and size='S')
 and (select stock_quantity=3 from public.product_variants where product_id=2 and size='M')
 and (select subtotal_minor=500005 and shipping_minor=25001 and total_minor=525006 and payment_status='unpaid' from public.orders),'trusted totals, one decrement, unpaid');
update public.business_settings set settings=jsonb_set(settings,'{shipping}','{"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0}');
select pg_temp.assert_true((select shipping_minor=25001 and total_minor=525006 from public.orders),'historical shipping snapshot');
select pg_temp.assert_true((public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"S","quantity":1}]','cod')->>'shipping_minor')='0','explicit free shipping quote');
-- Wallet configuration and handling are independent gates, always unpaid.
update public.business_settings set settings=settings||'{"easypaisa_enabled":true,"easypaisa_account_title":"SYNTHETIC WALLET","easypaisa_account_number":"00000000000"}';
select pg_temp.expect_error($q$select public.checkout_quote(gen_random_uuid(),'[{"id":0,"size":"M","quantity":1}]','easypaisa')$q$,'PT503');
update batool_checkout_internal.readiness set easypaisa_manual_ready=true;
update context set quote=public.checkout_quote('00000000-0000-4000-8000-000000000913','[{"id":0,"size":"M","quantity":1}]','easypaisa');
update context set receipt=public.checkout_create('00000000-0000-4000-8000-000000000913',gen_random_uuid(),(quote->>'quote_id')::uuid,pg_temp.customer());
select pg_temp.assert_true((select bool_and(payment_status='unpaid') from public.orders)
 and exists(select 1 from public.order_checkout_details where payment_method='easypaisa' and verification_mode='manual_wallet'),'wallet never auto-paid');
-- Populated row isolation; synthetic JWT settings do not verify real sessions.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000902"}',true);
select pg_temp.assert_true((select count(*)=2 from public.orders) and not exists(select 1 from public.order_items)
 and not exists(select 1 from public.order_customer_details) and not exists(select 1 from public.order_checkout_details),'partner report only');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000903","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true(not exists(select 1 from public.orders) and not exists(select 1 from public.order_customer_details)
 and not exists(select 1 from public.order_checkout_details),'unassigned cannot spoof owner');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000901","is_anonymous":true}',true);
select pg_temp.assert_true(not exists(select 1 from public.order_customer_details) and not exists(select 1 from public.order_checkout_details),'anonymous Auth claim denied');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000901"}',true);
select pg_temp.assert_true((select count(*)=2 from public.order_customer_details) and (select count(*)=3 from public.order_items)
 and (select count(*)=2 from public.order_checkout_details),'owner retrieves complete saved orders');
select pg_temp.expect_error('update public.order_checkout_details set payment_method=''cod''','42501');
reset role;
select pg_temp.assert_true((public.get_public_business_settings()->>'checkout_enabled')='false'
 and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb,'public checkout stays disabled');
rollback;
select 'PASS secure checkout atomicity, pricing, shipping, stock, retries, isolation and wallet assertions';
