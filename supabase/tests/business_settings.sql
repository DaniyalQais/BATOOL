-- EMPTY DISPOSABLE DATABASE ONLY. Never production.
-- Passed on local PostgreSQL 18.4 with Auth/Storage stubs; not run on Supabase.
-- Apply 001,003,004,005,006,007,008 without demo seed 002.
-- Same connection: set batool.test_disposable='yes'; use psql ON_ERROR_STOP.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes' then raise exception 'Disposable opt-in required'; end if;
  if exists(select 1 from auth.users) or exists(select 1 from public.dashboard_roles)
    or exists(select 1 from public.products) or exists(select 1 from public.orders)
    or (select count(*)<>1 from public.business_settings)
    or (select count(*)<>1 from public.order_notification_settings)
    or exists(select 1 from public.business_settings where revision<>1)
    or exists(select 1 from public.order_notification_settings where revision<>1) then
    raise exception 'Requires empty disposable database with fresh settings seed';
  end if;
end; $$;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception 'FAIL: %',label; end if;
end; $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=expected then return; end if;
    raise exception 'FAIL: expected SQLSTATE %, got %',expected,actual;
  end;
  raise exception 'FAIL: expected SQLSTATE %, statement succeeded',expected;
end; $$;
do $$ begin
  execute format('grant usage on schema %I to anon,authenticated,service_role',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
end; $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text) to anon,authenticated,service_role;
create temp table settings_context as select settings from public.business_settings;
grant select,update on settings_context to authenticated;
insert into auth.users(id,aud,role,email) values
 ('00000000-0000-4000-8000-000000000801','authenticated','authenticated','settings-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000802','authenticated','authenticated','settings-partner@example.invalid'),
 ('00000000-0000-4000-8000-000000000803','authenticated','authenticated','settings-unassigned@example.invalid'),
 ('00000000-0000-4000-8000-000000000804','authenticated','authenticated','settings-second-owner@example.invalid');
insert into public.dashboard_roles(user_id,role) values
 ('00000000-0000-4000-8000-000000000801','owner'),
 ('00000000-0000-4000-8000-000000000802','partner'),
 ('00000000-0000-4000-8000-000000000804','owner');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_error('select * from public.business_settings','42501');
select pg_temp.expect_error('select * from public.order_notification_settings','42501');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,'{}')$q$,'42501');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{}')$q$,'42501');
select pg_temp.assert_true(public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb,'anonymous public methods closed');
select pg_temp.assert_true(public.get_public_business_settings()->'shipping'='{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}'::jsonb,'new shipping is unconfigured, never implicitly free');
reset role;

set local role authenticated;
-- Role metadata cannot authorize either private reads or writes.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true((select count(*)=0 from public.business_settings),'Partner cannot read raw business settings');
select pg_temp.assert_true((select count(*)=0 from public.order_notification_settings),'Partner cannot read private recipients');
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','42501');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[]}')$q$,'42501');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000803","role":"authenticated","user_metadata":{"role":"owner"}}',true);
select pg_temp.assert_true((select count(*)=0 from public.business_settings),'unassigned cannot read raw settings');
select pg_temp.assert_true((select count(*)=0 from public.order_notification_settings),'unassigned cannot read recipients');
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','42501');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[]}')$q$,'42501');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated","is_anonymous":true}',true);
select pg_temp.assert_true((select count(*)=0 from public.business_settings),'anonymous Auth Owner claim cannot read');
select pg_temp.assert_true((select count(*)=0 from public.order_notification_settings),'anonymous Auth cannot read recipients');
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','42501');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[]}')$q$,'42501');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','42501');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',true);
select pg_temp.assert_true((select count(*)=1 from public.business_settings),'Owner reads settings');
select pg_temp.assert_true((select count(*)=1 from public.order_notification_settings),'Owner reads separate recipients');
select pg_temp.expect_error('update public.business_settings set revision=99','42501');
select pg_temp.expect_error($q$insert into public.business_settings(settings) values('{}')$q$,'42501');
select pg_temp.expect_error('delete from public.business_settings','42501');
select pg_temp.expect_error('truncate public.business_settings','42501');
select pg_temp.expect_error('update public.order_notification_settings set revision=99','42501');
select pg_temp.expect_error($q$insert into public.order_notification_settings(settings) values('{}')$q$,'42501');
select pg_temp.expect_error('delete from public.order_notification_settings','42501');
select pg_temp.expect_error('truncate public.order_notification_settings','42501');
select pg_temp.expect_error('select * from batool_settings_internal.valid_business(null)','42501');

-- Required keys/types, null payloads, unconfirmed terms, wallet prerequisites, shipping consistency.
select pg_temp.expect_error('select public.owner_save_business_settings(null,settings) from pg_temp.settings_context','22023');
select pg_temp.expect_error('select public.owner_save_business_settings(1,null)','22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,'{}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings || '{"backend_ready":true}') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings - 'cod_enabled') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings || '{"easypaisa_enabled":true}') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings || '{"cod_enabled":"true"}') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings || '{"policy_state":"approved"}') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,jsonb_set(settings,'{shipping,fee_minor}','1')) from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,jsonb_set(settings,'{shipping,country_code}','"US"')) from pg_temp.settings_context$q$,'22023');
do $$ declare shipping jsonb; begin
  for shipping in select v from jsonb_array_elements('[
    {"country_code":"PK","currency":"PKR","fee_minor":0},
    {"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":0},
    {"country_code":"PK","currency":"PKR","mode":"free","fee_minor":1},
    {"country_code":"PK","currency":"PKR","mode":"free","fee_minor":null},
    {"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":null},
    {"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":-1},
    {"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":1.5},
    {"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":"25050"},
    {"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":2147483648},
    {"country_code":"PK","currency":"PKR","mode":null,"fee_minor":0},
    {"country_code":"PK","currency":"PKR","mode":"express","fee_minor":0},
    {"country_code":"US","currency":"PKR","mode":"flat_rate","fee_minor":25050},
    {"country_code":"PK","currency":"USD","mode":"flat_rate","fee_minor":25050},
    {"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0,"extra":true}
  ]'::jsonb) as inputs(v) loop
    perform pg_temp.expect_error(format('select public.owner_save_business_settings(1,settings || jsonb_build_object(''shipping'',%L::jsonb)) from pg_temp.settings_context', shipping::text),'22023');
  end loop;
end; $$;
select pg_temp.expect_error($q$select public.owner_save_business_settings(1,settings || '{"public_whatsapp":"https://example.invalid"}') from pg_temp.settings_context$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":["bad"],"whatsapp_numbers":[]}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":["same@example.invalid","SAME@example.invalid"],"whatsapp_numbers":[]}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[null]}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[],"public":true}')$q$,'22023');
select pg_temp.assert_true((select revision=1 from public.business_settings),'invalid saves did not change revision');

update pg_temp.settings_context set settings=settings || '{
  "public_whatsapp":"920000000000","support_email":"public-fixture@example.invalid","cod_enabled":true,
  "easypaisa_enabled":true,"easypaisa_account_title":"SYNTHETIC WALLET CANARY","easypaisa_account_number":"00000000000",
  "jazzcash_enabled":true,"jazzcash_account_title":"SYNTHETIC WALLET CANARY","jazzcash_account_number":"00000000001",
  "payment_instructions":"DRAFT PAYMENT CANARY","policy_text":"DRAFT POLICY CANARY"
}';
select pg_temp.assert_true((public.owner_save_business_settings(1,settings)->>'revision')::integer=2,'Owner save increments revision') from pg_temp.settings_context;
select pg_temp.assert_true((select updated_by='00000000-0000-4000-8000-000000000801'::uuid from public.business_settings),'actor derived from auth.uid');
select pg_temp.assert_true((public.owner_save_notification_settings(1,'{"emails":["PRIVATE-CANARY@example.invalid"],"whatsapp_numbers":["920000000001"]}')->>'revision')::integer=2,'private recipients save');
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','PT409');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(1,'{"emails":[],"whatsapp_numbers":[]}')$q$,'PT409');
select pg_temp.assert_true(public.get_public_business_settings()->'payment_instructions'='null'::jsonb,'draft instructions withheld');
select pg_temp.assert_true(public.get_public_business_settings()->'policy_text'='null'::jsonb,'draft policy withheld');
select pg_temp.assert_true(public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb,'enabled wallet intent cannot enable shopper payments');
select pg_temp.assert_true(public.get_public_business_settings()->'checkout_enabled'='false'::jsonb,'checkout stays closed');

-- A second Owner's stale snapshot also conflicts; newest revision may approve text.
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000804","role":"authenticated"}',true);
select pg_temp.expect_error('select public.owner_save_business_settings(1,settings) from pg_temp.settings_context','PT409');
select public.owner_save_business_settings(2,settings || '{"payment_instructions":"SYNTHETIC APPROVED INSTRUCTIONS","payment_instructions_state":"approved","policy_text":"SYNTHETIC APPROVED POLICY","policy_state":"approved"}') from pg_temp.settings_context;
select pg_temp.assert_true(public.get_public_business_settings()->>'policy_text'='SYNTHETIC APPROVED POLICY','explicitly approved policy projected');
select pg_temp.assert_true(public.get_public_business_settings()->>'payment_instructions'='SYNTHETIC APPROVED INSTRUCTIONS','explicitly approved instructions projected');
reset role;
-- Demotion takes effect despite previously valid JWT subject/metadata.
update public.dashboard_roles set role='partner' where user_id='00000000-0000-4000-8000-000000000804';
set local role authenticated;
select pg_temp.expect_error('select public.owner_save_business_settings(3,settings) from pg_temp.settings_context','42501');
select pg_temp.expect_error($q$select public.owner_save_notification_settings(2,'{"emails":[],"whatsapp_numbers":[]}')$q$,'42501');
reset role;

set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(public.get_public_business_settings()->>'support_email'='public-fixture@example.invalid','public contact exposed');
select pg_temp.assert_true(public.get_public_business_settings()::text !~ 'PRIVATE-CANARY|SYNTHETIC WALLET|00000000001|DRAFT', 'no recipient/wallet/draft canaries');
select pg_temp.assert_true((select count(*)=9 from jsonb_object_keys(public.get_public_business_settings())),'exact public allowlist');
reset role;
set local role service_role;
select pg_temp.expect_error('select * from public.order_notification_settings','42501');
select pg_temp.expect_error('update public.business_settings set revision=99','42501');
reset role;

-- Trusted writes also invalidate open editor revisions, and constraints still apply.
update public.business_settings set revision=1;
select pg_temp.assert_true((select revision=4 from public.business_settings),'trusted edit cannot choose revision');
select pg_temp.expect_error($q$update public.business_settings set settings=jsonb_set(settings,'{shipping,fee_minor}','500')$q$,'23514');
select pg_temp.assert_true((select revision=4 from public.business_settings),'failed constraint rolls back revision');

-- Only Owner can choose shipping through the same revision-checked settings RPC.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated"}',true);
select public.owner_save_business_settings(4,settings || '{"shipping":{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":25050}}') from pg_temp.settings_context;
select pg_temp.assert_true(public.get_public_business_settings()->'shipping'='{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":25050}'::jsonb,'public flat shipping amount is preserved');
select pg_temp.expect_error($q$select public.owner_save_business_settings(4,settings || '{"shipping":{"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0}}') from pg_temp.settings_context$q$,'PT409');
reset role;

-- Administrative test fixture only, not an order-creation endpoint. Snapshot the
-- trusted stored charge in an order with all required immutable child records.
insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,active,is_demo)
values (0,'shipping-fixture','Shipping fixture','Disposable fixture',10000,'gulnaar','Daily Pret','#000000','Test',false,true);
insert into public.product_variants(product_id,size,active,stock_quantity)
values (0,'S',true,5),(0,'M',true,5),(0,'L',true,5),(0,'XL',true,5);
insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
select '00000000-0000-4000-8000-000000000811','PKR',10000,(settings->'shipping'->>'fee_minor')::bigint,0,0,10000+(settings->'shipping'->>'fee_minor')::bigint
from public.business_settings;
insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
values ('00000000-0000-4000-8000-000000000811',1,0,'M','Shipping fixture',10000,1);
insert into public.order_customer_details(order_id,recipient_name,phone,address_line1,city,country_code)
values ('00000000-0000-4000-8000-000000000811','Synthetic recipient','0000000000','Synthetic address','Fixture City','PK');
insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id)
values ('00000000-0000-4000-8000-000000000821',repeat('a',64),repeat('b',64),'00000000-0000-4000-8000-000000000811');
set constraints all immediate;
set constraints all deferred;
create temp table order_charge_snapshot as select to_jsonb(o) as snapshot from public.orders o;
grant select on order_charge_snapshot to authenticated;
set local role authenticated;
select public.owner_save_business_settings(5,settings || '{"shipping":{"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0}}') from pg_temp.settings_context;
select pg_temp.assert_true(public.get_public_business_settings()->'shipping'='{"country_code":"PK","currency":"PKR","mode":"free","fee_minor":0}'::jsonb,'Owner can explicitly choose free shipping');
select pg_temp.assert_true((select to_jsonb(o)=snapshot and shipping_minor=25050 and total_minor=35050 from public.orders o cross join pg_temp.order_charge_snapshot),'free shipping change does not alter existing order charge');
select public.owner_save_business_settings(6,settings || '{"shipping":{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":0}}') from pg_temp.settings_context;
select pg_temp.assert_true(public.get_public_business_settings()->'shipping'->>'mode'='flat_rate','zero flat fee retains explicitly selected mode');
select public.owner_save_business_settings(7,settings || '{"shipping":{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null}}') from pg_temp.settings_context;
select pg_temp.assert_true((select to_jsonb(o)=snapshot from public.orders o cross join pg_temp.order_charge_snapshot),'unconfiguring shipping leaves existing order unchanged');
select pg_temp.assert_true(public.get_public_business_settings()->'available_payment_methods'='[]'::jsonb and public.get_public_business_settings()->'checkout_enabled'='false'::jsonb,'shipping configuration never enables checkout');
select pg_temp.expect_error('update public.orders set shipping_minor=0','42501');
reset role;
select pg_temp.expect_error('update public.orders set shipping_minor=0,total_minor=subtotal_minor','23514');
select 'PASS: settings authorization, validation, revisions, separation, public projection, and payment gates' as result;
rollback;
