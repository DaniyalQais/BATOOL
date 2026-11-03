-- NEW tests only. EMPTY DISPOSABLE database through 010, no seed 002.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
 if current_setting('batool.test_disposable',true) is distinct from 'yes'
   or exists(select 1 from auth.users) or exists(select 1 from public.products)
   or exists(select 1 from public.orders) or exists(select 1 from batool_checkout_internal.quotes)
   or exists(select 1 from batool_checkout_internal.intent_resolutions)
   or (select enabled from batool_checkout_internal.readiness) then raise exception 'Requires empty disposable recovery database'; end if;
end; $$;
\i supabase/tests/secure_checkout_fixtures.sql
create temp table recovery_context(old_quote jsonb,new_quote jsonb,resolution jsonb,receipt jsonb);
grant select,update on recovery_context to service_role;
insert into recovery_context default values;
-- Already committed order: expiry and disabled readiness cannot retire it.
update recovery_context set old_quote=public.checkout_quote('00000000-0000-4000-8000-000000001001','[{"id":0,"size":"S","quantity":1}]','cod');
update recovery_context set receipt=public.checkout_create('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001011',(old_quote->>'quote_id')::uuid,pg_temp.customer());
update batool_checkout_internal.quotes set expires_at=clock_timestamp()-interval '1 minute';
update batool_checkout_internal.readiness set enabled=false;
set local role service_role;
select pg_temp.assert_true((select public.checkout_recover('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001011')=receipt from recovery_context),'original scope/key recovery');
select pg_temp.assert_true((select public.checkout_resolve('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001011',(old_quote->>'quote_id')::uuid)->'receipt'=receipt from recovery_context),'committed resolve returns receipt while disabled');
reset role;
select pg_temp.assert_true(not exists(select 1 from batool_checkout_internal.intent_resolutions)
 and (select count(*)=1 from public.orders) and (select stock_quantity=4 from public.product_variants where product_id=0 and size='S'),'committed order never retired or deducted twice');
update batool_checkout_internal.readiness set enabled=true;
-- An expired uncommitted intent is durably retired, with one replacement key.
update recovery_context set old_quote=public.checkout_quote('00000000-0000-4000-8000-000000001002','[{"id":0,"size":"M","quantity":1}]','cod');
update batool_checkout_internal.quotes set expires_at=clock_timestamp()-interval '1 minute' where id=(select (old_quote->>'quote_id')::uuid from recovery_context);
select pg_temp.assert_true((select public.checkout_resolution('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001012',(old_quote->>'quote_id')::uuid) is null from recovery_context),'absence alone does not resolve');
update recovery_context set resolution=public.checkout_resolve('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001012',(old_quote->>'quote_id')::uuid);
select pg_temp.assert_true((select resolution->>'status'='retired' and resolution=public.checkout_resolve('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001012',(old_quote->>'quote_id')::uuid) from recovery_context),'lost resolve response returns same durable replacement identity');
select pg_temp.assert_true((select stock_quantity=5 from public.product_variants where product_id=0 and size='M') and (select count(*)=1 from public.orders),'retirement never deducts stock/creates order');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001012',(select (old_quote->>'quote_id')::uuid from recovery_context),pg_temp.customer())$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000001002',gen_random_uuid(),(select (old_quote->>'quote_id')::uuid from recovery_context),pg_temp.customer())$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_resolve('00000000-0000-4000-8000-000000001003',gen_random_uuid(),(select (old_quote->>'quote_id')::uuid from recovery_context))$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_resolve('00000000-0000-4000-8000-000000001002',gen_random_uuid(),(select (old_quote->>'quote_id')::uuid from recovery_context))$q$,'PT409');
update recovery_context set new_quote=public.checkout_quote('00000000-0000-4000-8000-000000001002','[{"id":0,"size":"L","quantity":1}]','cod');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000001012',(select (new_quote->>'quote_id')::uuid from recovery_context),pg_temp.customer())$q$,'PT409');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000001002',(select (resolution->>'replacement_key')::uuid from recovery_context),(select (new_quote->>'quote_id')::uuid from recovery_context),pg_temp.customer())$q$,'PT409');
-- New replacement quotes still require readiness; cached recovery is separate.
update batool_checkout_internal.readiness set enabled=false;
select pg_temp.expect_error($q$select public.checkout_replacement_quote('00000000-0000-4000-8000-000000001002',(select (resolution->>'resolution_id')::uuid from recovery_context),'[{"id":0,"size":"M","quantity":1}]','cod')$q$,'PT503');
update batool_checkout_internal.readiness set enabled=true;
update recovery_context set new_quote=public.checkout_replacement_quote('00000000-0000-4000-8000-000000001002',(resolution->>'resolution_id')::uuid,'[{"id":0,"size":"M","quantity":1}]','cod');
select pg_temp.assert_true((select new_quote=public.checkout_replacement_quote('00000000-0000-4000-8000-000000001002',(resolution->>'resolution_id')::uuid,'[{"id":2,"size":"XL","quantity":2}]','cod') from recovery_context),'lost quote response and different-tab request recover the same pinned quote');
select pg_temp.expect_error($q$select public.checkout_create('00000000-0000-4000-8000-000000001002',gen_random_uuid(),(select (new_quote->>'quote_id')::uuid from recovery_context),pg_temp.customer())$q$,'PT409');
set local role service_role;
update recovery_context set receipt=public.checkout_create('00000000-0000-4000-8000-000000001002',(resolution->>'replacement_key')::uuid,(new_quote->>'quote_id')::uuid,pg_temp.customer());
select pg_temp.assert_true((select receipt=public.checkout_create('00000000-0000-4000-8000-000000001002',(resolution->>'replacement_key')::uuid,(new_quote->>'quote_id')::uuid,pg_temp.customer()) from recovery_context),'replacement lost create response remains idempotent');
select pg_temp.assert_true((select public.checkout_resolve('00000000-0000-4000-8000-000000001002',(resolution->>'replacement_key')::uuid,(new_quote->>'quote_id')::uuid)->'receipt'=receipt from recovery_context),'cannot invalidate committed replacement');
select pg_temp.expect_error($q$select batool_checkout_internal.create_order_v009(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),pg_temp.customer())$q$,'42501');
select pg_temp.expect_error('select * from batool_checkout_internal.intent_resolutions','42501');
reset role;
select pg_temp.assert_true((select count(*)=2 from public.orders)
 and (select stock_quantity=4 from public.product_variants where product_id=0 and size='M'),'one replacement order/decrement');
-- Atomic retirement rollback after its insert, before quote invalidation.
update recovery_context set old_quote=public.checkout_quote('00000000-0000-4000-8000-000000001004','[{"id":0,"size":"XL","quantity":1}]','cod');
create function pg_temp.fail_resolution() returns trigger language plpgsql as $$ begin raise exception using errcode='P0001',message='Synthetic resolution rollback'; end; $$;
create trigger synthetic_resolution_failure before update on batool_checkout_internal.quotes for each row execute function pg_temp.fail_resolution();
select pg_temp.expect_error($q$select public.checkout_resolve('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001014',(select (old_quote->>'quote_id')::uuid from recovery_context))$q$,'P0001');
drop trigger synthetic_resolution_failure on batool_checkout_internal.quotes;
select pg_temp.assert_true(not exists(select 1 from batool_checkout_internal.intent_resolutions where scope_id='00000000-0000-4000-8000-000000001004')
 and (select expires_at>clock_timestamp() from batool_checkout_internal.quotes where id=(select (old_quote->>'quote_id')::uuid from recovery_context)),'retirement insert and invalidation roll back together');
-- Successive expiry/recovery chains can be resumed from an older tab.
update recovery_context set resolution=public.checkout_resolve('00000000-0000-4000-8000-000000001004','00000000-0000-4000-8000-000000001014',(old_quote->>'quote_id')::uuid);
update recovery_context set new_quote=public.checkout_replacement_quote('00000000-0000-4000-8000-000000001004',(resolution->>'resolution_id')::uuid,'[{"id":0,"size":"XL","quantity":1}]','cod');
select pg_temp.assert_true((select public.checkout_resolve('00000000-0000-4000-8000-000000001004',(resolution->>'replacement_key')::uuid,(new_quote->>'quote_id')::uuid)->>'status'='retired' from recovery_context),'uncommitted successor can be resolved');
select pg_temp.assert_true((select public.checkout_replacement_quote('00000000-0000-4000-8000-000000001004',(resolution->>'resolution_id')::uuid,'[{"id":0,"size":"XL","quantity":1}]','cod')=new_quote from recovery_context),'older tab recovers finite original successor DTO to resolve its exact identity');
set local role anon;
select pg_temp.expect_error($q$select public.checkout_resolve(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())$q$,'42501');
select pg_temp.expect_error($q$select public.checkout_resolution(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.expect_error($q$select public.checkout_replacement_quote(gen_random_uuid(),gen_random_uuid(),'[]','cod')$q$,'42501');
select pg_temp.expect_error($q$select public.checkout_create(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),pg_temp.customer())$q$,'42501');
reset role;
select pg_temp.assert_true(public.get_public_business_settings()->'checkout_enabled'='false'::jsonb
 and public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb,'public intake unchanged');
set constraints all immediate;
rollback;
select 'PASS recovery expiry, committed receipt, permanent invalidation, pinned replacement, failure rollback and grants';
