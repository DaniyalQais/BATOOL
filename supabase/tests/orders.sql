-- PREPARED, NOT A LIVE-PROJECT TEST. Empty disposable database only.
-- Apply 001,003,004,005,006 without seed 002. Explicitly opt in on the SAME
-- connection with: set batool.test_disposable = 'yes';
-- Execute as postgres with ON_ERROR_STOP. All fixtures roll back. On error ROLLBACK.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes' then
    raise exception 'Explicit disposable test opt-in required';
  end if;
  if exists(select 1 from public.products) or exists(select 1 from public.product_variants)
    or exists(select 1 from auth.users) or exists(select 1 from public.dashboard_roles)
    or exists(select 1 from public.product_image_assets) or exists(select 1 from storage.objects)
    or exists(select 1 from public.orders) or exists(select 1 from public.order_items)
    or exists(select 1 from public.order_customer_details) or exists(select 1 from public.order_creation_keys)
    or exists(select 1 from public.order_status_history) then
    raise exception 'Requires an EMPTY disposable database; no fixtures created';
  end if;
end;
$$;

create function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
end; $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$ declare actual text; begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual = returned_sqlstate;
    if actual = expected_state then return; end if;
    raise exception 'FAIL: expected SQLSTATE %, got %',expected_state,actual;
  end;
  raise exception 'FAIL: expected SQLSTATE %, statement succeeded',expected_state;
end; $$;
do $$ begin
  execute format('grant usage on schema %I to anon,authenticated,service_role',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
end; $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text)
  to anon,authenticated,service_role;

-- Synthetic, non-usable identities only. No passwords, invitations or real PII.
insert into auth.users(id,aud,role,email) values
  ('00000000-0000-4000-8000-000000000601','authenticated','authenticated','order-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000602','authenticated','authenticated','order-partner@example.invalid'),
  ('00000000-0000-4000-8000-000000000603','authenticated','authenticated','order-unassigned@example.invalid');
insert into public.dashboard_roles(user_id,role) values
  ('00000000-0000-4000-8000-000000000601','owner'),
  ('00000000-0000-4000-8000-000000000602','partner');
insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,active,is_demo)
values (0,'order-fixture','Original fixture','Isolated order fixture',10000,'gulnaar','Daily Pret','#000000','Test',true,true);
insert into public.product_variants(product_id,size,active,stock_quantity)
values (0,'S',true,null),(0,'M',true,5),(0,'L',false,0),(0,'XL',true,0);
select set_config('request.jwt.claims','{}',true);
-- Administrative fixture insertion is deliberately NOT an approved creation path.
-- Explicit zero fee/tax/discount values are fixture arithmetic, not business policy.
insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
values ('00000000-0000-4000-8000-000000000611','PKR',20000,0,0,0,20000);
insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
values ('00000000-0000-4000-8000-000000000611',1,0,'M','Original fixture',10000,2);
insert into public.order_customer_details(order_id,recipient_name,phone,email,address_line1,city,country_code)
values ('00000000-0000-4000-8000-000000000611','PRIVATE CANARY','0000000000','private-canary@example.invalid','PRIVATE ADDRESS','Fixture City','PK');
insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
values ('00000000-0000-4000-8000-000000000621',repeat('a',64),repeat('b',64),'00000000-0000-4000-8000-000000000611');
set constraints all immediate;
set constraints all deferred;

do $$ declare t text; r text; begin
  foreach t in array array['orders','order_items','order_customer_details','order_creation_keys','order_status_history'] loop
    perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'RLS enabled: '||t);
    foreach r in array array['anon','authenticated','service_role'] loop
      perform pg_temp.assert_true(not has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'no mutation grants: '||r||'.'||t);
      perform pg_temp.assert_true(not has_any_column_privilege(r,'public.'||t,'INSERT,UPDATE,REFERENCES'),'no column mutations: '||r||'.'||t);
    end loop;
  end loop;
  perform pg_temp.assert_true(not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='batool_order_internal' and (
      p.prosecdef or pg_get_function_result(p.oid)<>'trigger'
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE')
      or has_function_privilege('service_role',p.oid,'EXECUTE')
    )
  ),'only inaccessible invoker trigger functions');
end; $$;

-- Browser mutation denials must be privilege errors even on zero affected rows.
set local role authenticated;
do $$
declare subject text; t text;
begin
  foreach subject in array array[
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000603'
  ] loop
    perform set_config('request.jwt.claims',json_build_object('sub',subject,'role','authenticated','is_anonymous',false)::text,true);
    foreach t in array array['orders','order_items','order_customer_details','order_creation_keys','order_status_history'] loop
      perform pg_temp.expect_error(format('insert into public.%I default values',t),'42501');
      perform pg_temp.expect_error(format('update public.%I set %I = %I where false',t,
        case when t = 'orders' then 'id' else 'order_id' end,
        case when t = 'orders' then 'id' else 'order_id' end),'42501');
      perform pg_temp.expect_error(format('delete from public.%I where false',t),'42501');
      perform pg_temp.expect_error(format('truncate public.%I cascade',t),'42501');
      perform pg_temp.assert_true(not has_any_column_privilege('authenticated','public.'||t,'INSERT,UPDATE,REFERENCES'),'no column mutation grant: '||t);
    end loop;
    perform pg_temp.expect_error('select * from public.order_creation_keys','42501');
    perform pg_temp.expect_error('select batool_order_internal.guard_order()','42501');
  end loop;
end;
$$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","is_anonymous":false}',true);
select pg_temp.assert_true((select count(*)=1 from public.orders),'Owner order reads');
select pg_temp.assert_true((select count(*)=1 from public.order_items),'Owner item reads');
select pg_temp.assert_true((select count(*)=1 from public.order_customer_details where recipient_name='PRIVATE CANARY'),'Owner private reads');
select pg_temp.assert_true((select count(*)=2 from public.order_status_history),'Owner initial history reads');
select pg_temp.assert_true((select count(*)=1 from public.products),'existing Owner catalog reads');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated","is_anonymous":false}',true);
select pg_temp.assert_true((select count(*)=1 from public.orders),'Partner report reads');
select pg_temp.assert_true((select sum(total_minor)=20000 from public.orders),'Partner amount aggregation');
select pg_temp.assert_true(not exists(
  select 1 from public.orders o cross join lateral jsonb_object_keys(to_jsonb(o)) as k(key)
  where k.key <> all(array['id','created_at','updated_at','currency','subtotal_minor','shipping_minor',
    'tax_minor','discount_minor','total_minor','fulfillment_status','payment_status','status_revision'])
),'Partner JSON is report-safe');
select pg_temp.assert_true(not exists(select 1 from public.order_customer_details),'Partner PII isolation');
select pg_temp.assert_true(not exists(select 1 from public.order_items),'Partner item isolation');
select pg_temp.assert_true(not exists(select 1 from public.order_status_history),'Partner actor/history isolation');
select pg_temp.assert_true(not exists(select 1 from public.orders o join public.order_customer_details d on d.order_id=o.id),'Partner embedded/join isolation');
select pg_temp.assert_true(not exists(select 1 from public.products),'existing Partner catalog denial');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000603","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true(not exists(select 1 from public.orders),'unassigned/metadata spoof denied');
select pg_temp.assert_true(not exists(select 1 from public.order_customer_details),'unassigned private denied');
select pg_temp.assert_true(not exists(select 1 from public.order_items),'unassigned items denied');
select pg_temp.assert_true(not exists(select 1 from public.order_status_history),'unassigned history denied');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","is_anonymous":true}',true);
select pg_temp.assert_true(not exists(select 1 from public.orders),'anonymous-auth cannot inherit Owner report reads');
select pg_temp.assert_true(not exists(select 1 from public.order_customer_details),'anonymous-auth private denial');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select pg_temp.assert_true(not exists(select 1 from public.orders),'missing subject denied');
reset role;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare t text; begin
  foreach t in array array['orders','order_items','order_customer_details','order_creation_keys','order_status_history'] loop
    perform pg_temp.expect_error(format('select * from public.%I',t),'42501');
    perform pg_temp.expect_error(format('insert into public.%I default values',t),'42501');
    perform pg_temp.expect_error(format('delete from public.%I where false',t),'42501');
  end loop;
end; $$;
select pg_temp.assert_true((select count(*)=1 from public.products),'existing anonymous active catalog read');
select pg_temp.assert_true((select count(*)=3 from public.product_variants),'existing anonymous active variant read');
reset role;

set local role service_role;
do $$ declare t text; begin
  foreach t in array array['orders','order_items','order_customer_details','order_creation_keys','order_status_history'] loop
    perform pg_temp.expect_error(format('select * from public.%I',t),'42501');
    perform pg_temp.expect_error(format('insert into public.%I default values',t),'42501');
  end loop;
end; $$;
reset role;

-- Live role revocation takes effect without trusting a stale metadata role.
update public.dashboard_roles set role='partner' where user_id='00000000-0000-4000-8000-000000000601';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true(not exists(select 1 from public.order_customer_details),'live demotion hides private details');
select pg_temp.assert_true((select count(*)=1 from public.orders),'demoted Partner retains only reports');
reset role;
delete from public.dashboard_roles where user_id='00000000-0000-4000-8000-000000000601';
set local role authenticated;
select pg_temp.assert_true(not exists(select 1 from public.orders),'live role removal hides reports');
reset role;
insert into public.dashboard_roles(user_id,role) values ('00000000-0000-4000-8000-000000000601','owner');

-- Admin-only fixture writes below exercise constraints, not an application API.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated"}',true);
select pg_temp.expect_error($q$update public.orders set total_minor=1$q$,'23514');
select pg_temp.expect_error($q$update public.orders set status_revision=99,fulfillment_status='confirmed'$q$,'23514');
select pg_temp.expect_error($q$update public.orders set fulfillment_status='shipped'$q$,'23514');
select pg_temp.expect_error($q$update public.orders set payment_status='refunded'$q$,'23514');
select pg_temp.expect_error($q$update public.orders set fulfillment_status=fulfillment_status$q$,'23514');
select pg_temp.expect_error($q$update public.order_items set product_name='Overwritten'$q$,'23514');
select pg_temp.expect_error($q$delete from public.order_items$q$,'23514');
select pg_temp.expect_error($q$delete from public.orders$q$,'23514');
select pg_temp.expect_error($q$delete from public.order_customer_details$q$,'23514');
select pg_temp.expect_error($q$update public.order_customer_details set order_id=gen_random_uuid()$q$,'23514');
select pg_temp.expect_error($q$update public.order_creation_keys set request_hash=repeat('c',64)$q$,'23514');
select pg_temp.expect_error($q$update public.order_status_history set to_status='cancelled'$q$,'23514');
select pg_temp.expect_error($q$delete from public.order_status_history$q$,'23514');
select pg_temp.expect_error($q$truncate public.order_status_history$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_status_history
  (order_id,revision,status_kind,from_status,to_status,changed_at,actor_db_role,actor_session_role)
  values ('00000000-0000-4000-8000-000000000611',2,'payment','unpaid','paid',now(),current_user,session_user)$q$,'23514');

update public.orders set fulfillment_status='confirmed';
update public.orders set payment_status='failed';
update public.orders set payment_status='unpaid';
update public.orders set payment_status='paid';
update public.orders set fulfillment_status='packing';
update public.orders set fulfillment_status='shipped';
update public.orders set fulfillment_status='delivered';
update public.orders set payment_status='refunded';
select pg_temp.assert_true((select status_revision=9 and fulfillment_status='delivered' and payment_status='refunded' from public.orders),'independent status progress/revision');
select pg_temp.assert_true((select count(*)=10 from public.order_status_history),'exactly one event per changed domain plus two initial events');
select pg_temp.assert_true((select count(*)=8 from public.order_status_history
  where revision>1 and actor_user_id='00000000-0000-4000-8000-000000000601'
  and actor_db_role=current_user and actor_session_role=session_user),'derived actors recorded');
select pg_temp.assert_true(not exists(
  select 1 from (select from_status,lag(to_status) over(partition by order_id,status_kind order by revision) as previous
    from public.order_status_history) h where from_status is distinct from previous
),'history chains are continuous');
select pg_temp.expect_error($q$update public.orders set fulfillment_status='cancelled'$q$,'23514');
select pg_temp.expect_error($q$update public.orders set payment_status='paid'$q$,'23514');
update public.products set name='Renamed catalog fixture',price_minor=99999 where id=0;
select pg_temp.assert_true((select product_name='Original fixture' and unit_price_minor=10000
  and quantity=2 and line_total_minor=20000 from public.order_items),'catalog edits cannot rewrite snapshots');

-- Invalid orders/items are rolled back inside expect_error subtransactions.
select pg_temp.expect_error($q$insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
  values ('USD',1,0,0,0,1)$q$,'23514');
select pg_temp.expect_error($q$insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
  values ('PKR',1,-1,0,0,0)$q$,'23514');
select pg_temp.expect_error($q$insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
  values ('PKR',1,0,0,2,0)$q$,'23514');
select pg_temp.expect_error($q$insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor,payment_status)
  values ('PKR',1,0,0,0,1,'paid')$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,0,'S','Fixture',1,0)$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,0,'XS','Fixture',1,1)$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,0,'S','Fixture',-1,1)$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,0,'S','Fixture',9223372036854775807,2)$q$,'22003');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,999,'S','Fixture',1,1)$q$,'23503');
select pg_temp.expect_error($q$insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
  values ('00000000-0000-4000-8000-000000000621','bad',repeat('b',64),'00000000-0000-4000-8000-000000000611')$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
  values ('00000000-0000-4000-8000-000000000621',repeat('c',64),repeat('b',64),'00000000-0000-4000-8000-000000000611')$q$,'23505');
select pg_temp.expect_error($q$insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
  values ('00000000-0000-4000-8000-000000000612','PKR',1,0,0,0,1);
  insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
  values ('00000000-0000-4000-8000-000000000621',repeat('a',64),repeat('b',64),'00000000-0000-4000-8000-000000000612')$q$,'23505');
select pg_temp.expect_error($q$insert into public.orders(currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
  values ('PKR',0,0,0,0,0); set constraints all immediate$q$,'23514');
select pg_temp.expect_error($q$insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
  values ('00000000-0000-4000-8000-000000000611',2,0,'S','Fixture',1,1);
  set constraints all immediate$q$,'23514');
select pg_temp.expect_error($q$update public.order_customer_details set recipient_name='   '$q$,'23514');

-- Test-only constructor, in a temporary schema and rolled back with the suite.
-- Its optional omission deliberately constructs invalid transactions for tests.
create function pg_temp.new_order_fixture(target uuid, omit_component text default null) returns void
language plpgsql as $$ begin
  insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
    values(target,'PKR',20000,0,0,0,20000);
  if omit_component is distinct from 'items' then
    insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
      values(target,1,0,'M','Isolated fixture',10000,2);
  end if;
  if omit_component is distinct from 'details' then
    insert into public.order_customer_details(order_id,recipient_name,phone,address_line1,city,country_code)
      values(target,'Synthetic recipient','0000000000','Synthetic address','Fixture City','PK');
  end if;
  if omit_component is distinct from 'key' then
    insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
      values(target,repeat(replace(target::text,'-',''),2),repeat('d',64),target);
  end if;
end; $$;
select pg_temp.expect_error($q$select pg_temp.new_order_fixture(gen_random_uuid(),'items'); set constraints all immediate$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.new_order_fixture(gen_random_uuid(),'details'); set constraints all immediate$q$,'23514');
select pg_temp.expect_error($q$select pg_temp.new_order_fixture(gen_random_uuid(),'key'); set constraints all immediate$q$,'23514');

do $$ declare stage text; target uuid; before_events bigint; begin
  foreach stage in array array['pending','confirmed','packing'] loop
    target := gen_random_uuid();
    perform pg_temp.new_order_fixture(target);
    if stage in ('confirmed','packing') then
      update public.orders set fulfillment_status='confirmed' where id=target;
    end if;
    if stage = 'packing' then
      update public.orders set fulfillment_status='packing' where id=target;
    end if;
    update public.orders set fulfillment_status='cancelled' where id=target;
    perform pg_temp.assert_true((select fulfillment_status='cancelled' and payment_status='unpaid'
      from public.orders where id=target),'cancel from '||stage||' without changing payment');
    perform pg_temp.expect_error(format('update public.orders set fulfillment_status=%L where id=%L','confirmed',target),'23514');
  end loop;
  target := gen_random_uuid();
  perform pg_temp.new_order_fixture(target);
  update public.orders set fulfillment_status='confirmed',payment_status='paid' where id=target;
  perform pg_temp.assert_true((select status_revision=2 from public.orders where id=target),'dual-domain change increments once');
  perform pg_temp.assert_true((select count(*)=2 from public.order_status_history where order_id=target and revision=2),'two domain events share revision');
  select count(*) into before_events from public.order_status_history where order_id=target;
  perform pg_temp.expect_error(format('update public.orders set fulfillment_status=%L,payment_status=%L where id=%L','delivered','refunded',target),'23514');
  perform pg_temp.assert_true((select count(*)=before_events from public.order_status_history where order_id=target),'invalid mixed transition cannot append partial history');
  perform pg_temp.assert_true((select fulfillment_status='confirmed' and payment_status='paid' and status_revision=2 from public.orders where id=target),'invalid mixed transition rolls back atomically');
  update public.orders set fulfillment_status='cancelled' where id=target;
  perform pg_temp.assert_true((select payment_status='paid' from public.orders where id=target),'cancel does not imply refund');
  target := gen_random_uuid();
  perform pg_temp.new_order_fixture(target);
  update public.orders set payment_status='failed' where id=target;
  update public.orders set payment_status='paid' where id=target;
  perform pg_temp.assert_true((select fulfillment_status='pending' and payment_status='paid' from public.orders where id=target),'payment recovery does not imply fulfillment');
  perform pg_temp.expect_error(format('update public.orders set payment_status=%L where id=%L','failed',target),'23514');
end; $$;
set constraints all immediate;
select 'PASS: local disposable SQL order foundation assertions; NOT an HTTP/checkout test' as result;
rollback;
