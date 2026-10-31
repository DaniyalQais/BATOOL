-- PREPARED ONLY. EMPTY DISPOSABLE Supabase database, migrations 001,003,004,005,
-- WITHOUT seed 002. NEVER run on BATOOL. Storage rows below are synthetic metadata,
-- not blob uploads; this suite does not prove the Storage HTTP API or Edge runtime.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if exists (select 1 from public.products) or exists (select 1 from public.product_variants)
    or exists (select 1 from public.product_image_assets)
    or exists (select 1 from storage.objects where bucket_id in ('product-image-uploads','product-images')) then
    raise exception 'Requires an empty disposable database; no fixtures created';
  end if;
end; $$;
insert into auth.users(id,aud,role,email) values
  ('00000000-0000-4000-8000-000000000501','authenticated','authenticated','image-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000502','authenticated','authenticated','image-partner@example.invalid'),
  ('00000000-0000-4000-8000-000000000503','authenticated','authenticated','image-unassigned@example.invalid');
insert into public.dashboard_roles(user_id,role) values
  ('00000000-0000-4000-8000-000000000501','owner'),
  ('00000000-0000-4000-8000-000000000502','partner');
insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,active,is_demo)
values(0,'image-fixture','Image fixture','Disposable fixture',12345,'gulnaar','Daily Pret','#000000','Test',true,true);
insert into public.product_variants(product_id,size,active) values(0,'S',true),(0,'M',true),(0,'L',true),(0,'XL',true);
-- Trusted synthetic receipt to isolate DB attachment logic from real byte validation.
insert into public.product_image_assets(image_path,product_id,uploaded_by,width,height,byte_size,sha256)
values('products/0/00000000-0000-4000-8000-000000000501/00000000-0000-4000-8000-000000000601/main.webp',
0,'00000000-0000-4000-8000-000000000501',384,1024,1234,repeat('0',64));

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000502","user_metadata":{"role":"owner"}}',true);
do $$ declare message text; begin
  begin
    perform public.owner_attach_product_image(-1,1,'invalid','Probe');
    raise exception 'FAIL: Partner RPC did not deny';
  exception when insufficient_privilege then
    get stacked diagnostics message = message_text;
    if message <> 'Owner access required' then raise exception 'FAIL: wrong authorization error'; end if;
  end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('product-image-uploads',
      'products/0/00000000-0000-4000-8000-000000000502/00000000-0000-4000-8000-000000000601.webp',
      '00000000-0000-4000-8000-000000000502');
    raise exception 'FAIL: Partner Storage insert allowed';
  exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000503"}',true);
do $$ declare message text; begin
  begin
    perform public.owner_attach_product_image(-1,1,'invalid','Probe');
    raise exception 'FAIL: unassigned RPC did not deny';
  exception when insufficient_privilege then
    get stacked diagnostics message = message_text;
    if message <> 'Owner access required' then raise exception 'FAIL: wrong authorization error'; end if;
  end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('product-image-uploads',
      'products/0/00000000-0000-4000-8000-000000000503/00000000-0000-4000-8000-000000000601.webp',
      '00000000-0000-4000-8000-000000000503');
    raise exception 'FAIL: unassigned Storage insert allowed';
  exception when insufficient_privilege then null; end;
end; $$;

select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000501"}',true);
do $$ declare original_revision integer; saved jsonb; changed integer; begin
  if not public.batool_catalog_owner() then raise exception 'FAIL: Owner lookup'; end if;
  select edit_revision into original_revision from public.products where id=0;
  saved := public.owner_attach_product_image(0,original_revision,
    'products/0/00000000-0000-4000-8000-000000000501/00000000-0000-4000-8000-000000000601/main.webp','Plum outfit');
  if (saved->>'edit_revision')::integer <= original_revision or saved->>'image_alt' <> 'Plum outfit' then
    raise exception 'FAIL: image attachment/revision'; end if;
  begin
    perform public.owner_attach_product_image(0,original_revision,saved->>'main_image_path','Stale alt');
    raise exception 'FAIL: stale image edit allowed';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.owner_attach_product_image(0,(saved->>'edit_revision')::integer,'https://evil.invalid/x.webp','Alt');
    raise exception 'FAIL: arbitrary URL allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.owner_attach_product_image(0,(saved->>'edit_revision')::integer,saved->>'main_image_path',' ');
    raise exception 'FAIL: blank alt allowed';
  exception when invalid_parameter_value then null; end;
  begin
    update public.products set image_alt='Bypass' where id=0;
    raise exception 'FAIL: direct product mutation';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','EXECUTE')
    or has_function_privilege('anon','public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text)','EXECUTE') then
    raise exception 'FAIL: browser can forge validation receipts'; end if;
  insert into storage.objects(bucket_id,name,owner_id) values('product-image-uploads',
    'products/0/00000000-0000-4000-8000-000000000501/00000000-0000-4000-8000-000000000601.webp',
    '00000000-0000-4000-8000-000000000501');
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('product-image-uploads',
      'products/2/00000000-0000-4000-8000-000000000502/00000000-0000-4000-8000-000000000601.webp',
      '00000000-0000-4000-8000-000000000501');
    raise exception 'FAIL: another user upload namespace allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('product-images','any.webp',
      '00000000-0000-4000-8000-000000000501');
    raise exception 'FAIL: Owner bypassed trusted public-image validation';
  exception when insufficient_privilege then null; end;
  update storage.objects set name='overwritten.webp' where bucket_id='product-image-uploads';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: Storage overwrite allowed'; end if;
  delete from storage.objects where bucket_id='product-image-uploads';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: Storage delete allowed'; end if;
end; $$;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
  if public.batool_catalog_owner() then raise exception 'FAIL: anonymous Owner'; end if;
  if not exists(select 1 from public.products where id=0) then raise exception 'FAIL: anonymous active catalog access lost'; end if;
  if exists(select 1 from storage.objects where bucket_id='product-image-uploads') then raise exception 'FAIL: private uploads exposed'; end if;
  begin
    perform public.owner_attach_product_image(-1,1,'invalid','Probe');
    raise exception 'FAIL: anonymous image RPC allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values('product-image-uploads',
      'products/0/00000000-0000-4000-8000-000000000501/00000000-0000-4000-8000-000000000602.webp',
      '00000000-0000-4000-8000-000000000501');
    raise exception 'FAIL: anonymous Storage insert allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
update public.dashboard_roles set role='partner' where user_id='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000501"}',true);
do $$ declare message text; begin
  if public.batool_catalog_owner() then raise exception 'FAIL: stale Owner mapping'; end if;
  begin
    perform public.owner_attach_product_image(-1,1,'invalid','Probe');
    raise exception 'FAIL: demoted Owner attachment allowed';
  exception when insufficient_privilege then
    get stacked diagnostics message = message_text;
    if message <> 'Owner access required' then raise exception 'FAIL: wrong demotion denial'; end if;
  end;
end; $$;
rollback;
