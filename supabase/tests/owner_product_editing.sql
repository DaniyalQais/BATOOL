-- PREPARED ONLY: run in a DISPOSABLE EMPTY test database after migrations
-- 001, 003 and 004 (not the demo seed). Never run against the live catalog.
-- No usable accounts or legitimate catalog rows are changed. Roll back on error.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
begin
  if exists (select 1 from public.products) or exists (select 1 from public.product_variants) then
    raise exception 'Requires an empty disposable test database; no test changes made';
  end if;
end;
$$;
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000201','authenticated','authenticated','editor-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000202','authenticated','authenticated','editor-partner@example.invalid'),
  ('00000000-0000-4000-8000-000000000203','authenticated','authenticated','editor-unassigned@example.invalid');
insert into public.dashboard_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000000201','owner'),
  ('00000000-0000-4000-8000-000000000202','partner');
insert into public.products (id,slug,name,description,price_minor,image_slug,subcategory,color,tag,active,is_demo)
values (0,'editor-fixture','Editor fixture','Isolated test fixture',12345,'gulnaar','Daily Pret','#000000','Test',false,true);
insert into public.product_variants (product_id,size,active) values (0,'S',true),(0,'M',true),(0,'L',true),(0,'XL',true);

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  if exists (select 1 from public.products) or exists (select 1 from public.product_variants) then
    raise exception 'FAIL: inactive product or its variants exposed anonymously';
  end if;
  begin
    perform public.owner_update_catalog_product(0,1,'Changed','Changed',100,true,'{"S":null,"M":0,"L":1,"XL":null}');
    raise exception 'FAIL: anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

set local role authenticated;
do $$
declare subject text;
begin
  foreach subject in array array['00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000203'] loop
    perform set_config('request.jwt.claims',json_build_object('sub',subject,'role','authenticated','user_metadata',json_build_object('role','owner'))::text,true);
    if exists (select 1 from public.products) or exists (select 1 from public.product_variants) then
      raise exception 'FAIL: non-Owner admin catalog read allowed';
    end if;
    begin
      perform public.owner_update_catalog_product(0,1,'Changed','Changed',100,true,'{"S":null,"M":0,"L":1,"XL":null}');
      raise exception 'FAIL: Partner/unassigned RPC allowed';
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated","is_anonymous":false}',true);
do $$
declare before_product jsonb; before_variants jsonb; result jsonb; old_revision integer; next_revision integer; invalid_stocks jsonb; statement text;
begin
  if (select count(*) from public.products) <> 1 then raise exception 'FAIL: Owner cannot read inactive fixture'; end if;
  select to_jsonb(p), edit_revision into before_product, old_revision from public.products p where id=0;
  select jsonb_agg(to_jsonb(v) - array['stock_quantity','updated_at'] order by size) into before_variants from public.product_variants v where product_id=0;
  result := public.owner_update_catalog_product(0,old_revision,'Edited fixture','Edited concept description',12346,true,'{"S":null,"M":0,"L":7,"XL":null}');
  if result->>'name' <> 'Edited fixture' or (result->>'price_minor')::integer <> 12346 or
     (result->>'edit_revision')::integer <= old_revision then raise exception 'FAIL: save confirmation/revision'; end if;
  if (select stock_quantity from public.product_variants where product_id=0 and size='S') is not null or
     (select stock_quantity from public.product_variants where product_id=0 and size='M') is distinct from 0 or
     (select stock_quantity from public.product_variants where product_id=0 and size='L') is distinct from 7 then
    raise exception 'FAIL: null/zero/positive stock mapping';
  end if;
  if (result - array['name','description','price_minor','active','updated_at','edit_revision','product_variants']) <>
     (before_product - array['name','description','price_minor','active','updated_at','edit_revision']) then
    raise exception 'FAIL: protected product fields changed';
  end if;
  if (select jsonb_agg(to_jsonb(v) - array['stock_quantity','updated_at'] order by size) from public.product_variants v where product_id=0) <> before_variants then
    raise exception 'FAIL: protected variant fields changed';
  end if;
  begin
    perform public.owner_update_catalog_product(0,old_revision,'Stale overwrite','Stale',1,false,'{"S":0,"M":0,"L":0,"XL":0}');
    raise exception 'FAIL: stale save allowed';
  exception when sqlstate 'PT409' then null; end;
  select edit_revision into next_revision from public.products where id=0;
  foreach invalid_stocks in array array[
    '{"S":null,"M":0,"L":0}'::jsonb,
    '{"S":null,"M":0,"L":0,"XL":null,"XS":0}'::jsonb,
    '{"S":-1,"M":0,"L":0,"XL":null}'::jsonb,
    '{"S":1.5,"M":0,"L":0,"XL":null}'::jsonb,
    '{"S":"Unknown","M":0,"L":0,"XL":null}'::jsonb,
    '{"S":2147483648,"M":0,"L":0,"XL":null}'::jsonb
  ] loop
    begin
      perform public.owner_update_catalog_product(0,next_revision,'Bad','Bad',1,false,invalid_stocks);
      raise exception 'FAIL: invalid variant values accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.owner_update_catalog_product(0,next_revision,E'\n\t','Bad',1,false,'{"S":0,"M":0,"L":0,"XL":0}');
    raise exception 'FAIL: blank name accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.owner_update_catalog_product(0,next_revision,'Bad','Bad',-1,false,'{"S":0,"M":0,"L":0,"XL":0}');
    raise exception 'FAIL: negative price accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.owner_update_catalog_product(9,1,'Bad','Bad',1,false,'{"S":0,"M":0,"L":0,"XL":0}');
    raise exception 'FAIL: reserved product ID accepted';
  exception when invalid_parameter_value then null; end;
  if (select edit_revision from public.products where id=0) <> next_revision then raise exception 'FAIL: rejected request changed data'; end if;

  foreach statement in array array[
    'update public.products set slug=''tampered'' where id=0',
    'update public.products set name=''direct update'' where id=0',
    'update public.products set image_slug=''meher'',category=''Stitched'',piece_count=3,is_demo=false where id=0',
    'update public.products set edit_revision=1 where id=0',
    'update public.product_variants set stock_quantity=0 where product_id=0',
    'update public.product_variants set size=''M'' where product_id=0 and size=''S''',
    'delete from public.products where id=0',
    'insert into public.products (id) values (9)',
    'update public.dashboard_roles set role=''partner'' where user_id=auth.uid()'
  ] loop
    begin
      execute statement; raise exception 'FAIL: direct write/protected field mutation allowed';
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;
reset role;

-- The now-active fixture is still publicly readable; anonymous writes stay denied.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
begin
  if (select count(*) from public.products) <> 1 or (select count(*) from public.product_variants) <> 4 then
    raise exception 'FAIL: active anonymous catalog reads changed';
  end if;
  begin
    update public.products set name='Anonymous overwrite' where id=0;
    raise exception 'FAIL: anonymous direct update allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Trusted SQL variant changes also invalidate old editor snapshots.
do $$
declare old_revision integer;
begin
  select edit_revision into old_revision from public.products where id=0;
  update public.product_variants set stock_quantity=8 where product_id=0 and size='L';
  if (select edit_revision from public.products where id=0) <= old_revision then raise exception 'FAIL: external stock change did not invalidate revision'; end if;
end;
$$;
update public.dashboard_roles set role='partner' where user_id='00000000-0000-4000-8000-000000000201';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}',true);
do $$
begin
  begin
    perform public.owner_update_catalog_product(0,1,'Revoked','Revoked',1,true,'{"S":0,"M":0,"L":0,"XL":0}');
    raise exception 'FAIL: demoted Owner retained write access';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
