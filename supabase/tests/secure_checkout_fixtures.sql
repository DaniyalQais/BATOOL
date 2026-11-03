-- INCLUDED ONLY by the guarded disposable checkout suites. Synthetic values.
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000901'),('00000000-0000-4000-8000-000000000902'),('00000000-0000-4000-8000-000000000903');
insert into public.dashboard_roles(user_id,role) values
 ('00000000-0000-4000-8000-000000000901','owner'),('00000000-0000-4000-8000-000000000902','partner');
insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,is_demo)
values (0,'checkout-test-a','Synthetic A','Disposable test',100001,'gulnaar','Daily Pret','#123456','Test',false),
 (2,'checkout-test-b','Synthetic B','Disposable test',200002,'meher','Daily Pret','#123456','Test',false),
 (3,'checkout-demo','Synthetic concept','Disposable demo',10000,'saba','Daily Pret','#123456','Test',true);
insert into public.product_variants(product_id,size,active,stock_quantity)
select id,size,true,5 from public.products cross join unnest(array['S','M','L','XL']) size;
update public.products set active=true;
update batool_checkout_internal.readiness set enabled=true,cod_ready=true,zero_tax_reviewed=true;
update public.business_settings set settings=settings || '{"cod_enabled":true,"shipping":{"country_code":"PK","currency":"PKR","mode":"flat_rate","fee_minor":25001},"payment_instructions":"SYNTHETIC COD INSTRUCTIONS","payment_instructions_state":"approved","policy_text":"SYNTHETIC TEST POLICY ONLY","policy_state":"approved"}'::jsonb;
create function pg_temp.customer() returns jsonb language sql as $$
 select '{"recipient_name":"Synthetic customer","phone":"923000000000","email":null,"address_line1":"Synthetic address","address_line2":null,"city":"Synthetic city","region":null,"postal_code":null,"country_code":"PK"}'::jsonb;
$$;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'FAIL: %',label; end if;
end; $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute statement;
 exception when others then get stacked diagnostics actual=returned_sqlstate;
   if actual=expected then return; end if;
   raise exception 'FAIL expected %, got %',expected,actual;
 end;
 raise exception 'FAIL expected %, succeeded',expected;
end; $$;
do $$ begin execute format('grant usage on schema %I to anon,authenticated,service_role',(select nspname from pg_namespace where oid=pg_my_temp_schema())); end; $$;
grant execute on function pg_temp.customer(),pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text) to anon,authenticated,service_role;
