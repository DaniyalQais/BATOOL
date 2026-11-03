-- Passed on disposable PostgreSQL 18.4 with Auth/Storage stubs; not actual Auth sessions.
-- EMPTY DISPOSABLE DATABASE ONLY. Never BATOOL.
-- Apply 001,003,004,005,006,007 without seed 002. Same-connection opt-in:
-- set batool.test_disposable = 'yes'; Use ON_ERROR_STOP; all fixtures roll back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$ begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes' then raise exception 'Disposable opt-in required'; end if;
  if exists(select 1 from public.products) or exists(select 1 from public.product_variants)
    or exists(select 1 from auth.users) or exists(select 1 from public.dashboard_roles)
    or exists(select 1 from public.product_image_assets) or exists(select 1 from storage.objects)
    or exists(select 1 from public.orders) or exists(select 1 from public.order_items)
    or exists(select 1 from public.order_customer_details) or exists(select 1 from public.order_creation_keys)
    or exists(select 1 from public.order_status_history)
    or exists(select 1 from batool_catalog_internal.creation_requests) then
    raise exception 'Requires empty disposable database; no fixtures created';
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
    get stacked diagnostics actual = returned_sqlstate;
    if actual = expected then return; end if;
    raise exception 'FAIL: expected SQLSTATE %, got %',expected,actual;
  end;
  raise exception 'FAIL: expected SQLSTATE %, statement succeeded',expected;
end; $$;
do $$ begin
  execute format('grant usage on schema %I to anon,authenticated,service_role',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
end; $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text) to anon,authenticated,service_role;
create temp table draft_context (id integer, revision integer, slug text);
grant select,insert,update on draft_context to authenticated;
insert into auth.users(id,aud,role,email) values
 ('00000000-0000-4000-8000-000000000701','authenticated','authenticated','draft-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000702','authenticated','authenticated','draft-partner@example.invalid'),
 ('00000000-0000-4000-8000-000000000703','authenticated','authenticated','draft-unassigned@example.invalid'),
 ('00000000-0000-4000-8000-000000000704','authenticated','authenticated','draft-second-owner@example.invalid');
insert into public.dashboard_roles(user_id,role) values
 ('00000000-0000-4000-8000-000000000701','owner'),
 ('00000000-0000-4000-8000-000000000702','partner'),
 ('00000000-0000-4000-8000-000000000704','owner');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000702"}',true);
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'42501');
select pg_temp.expect_error($q$select public.owner_update_catalog_product(12,1,'Draft','Concept',12345,false,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'42501');
select pg_temp.expect_error($q$select public.owner_save_catalog_product(12,1,'Draft','Concept',12345,false,'{"S":null,"M":0,"L":1,"XL":2}',null,null,null,false)$q$,'42501');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000703","user_metadata":{"role":"owner"}}',true);
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'42501');
select pg_temp.expect_error($q$select public.owner_save_catalog_product(12,1,'Draft','Concept',12345,false,'{"S":null,"M":0,"L":1,"XL":2}',null,null,null,false)$q$,'42501');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000701","is_anonymous":true}',true);
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'42501');
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000701"}',true);
-- Validation before writes, exact sizes, null/zero/positive and integer bounds.
select pg_temp.expect_error($q$select public.owner_create_product_draft(null,'Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711',' ','Concept',1,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','',1,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',-1,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',1,'{"S":null,"M":0,"L":1,"XXL":2}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',1,'{"S":null,"M":0,"L":1,"XL":1.5}')$q$,'22023');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',1,'{"S":null,"M":0,"L":1,"XL":2147483648}')$q$,'22023');
insert into pg_temp.draft_context
select (j->>'id')::integer,(j->>'edit_revision')::integer,j->>'slug' from
 (select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}') j) response;
select pg_temp.assert_true((select id >= 12 and slug ~ '^draft-[0-9]+$' from pg_temp.draft_context),'database ID and slug');
select pg_temp.assert_true((select count(*) = 1 from public.products),'one product');
select pg_temp.assert_true((select count(*) = 4 from public.product_variants),'exactly four variants');
select pg_temp.assert_true((select not active and main_image_path is null and image_slug is null and draft_managed from public.products),'inactive image-less draft');
select pg_temp.assert_true((select stock_quantity is null from public.product_variants where size='S'),'unknown stock');
select pg_temp.assert_true((select stock_quantity = 0 from public.product_variants where size='M'),'zero stock');
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert_true((public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"XL":2,"L":1,"M":0,"S":null}')->>'id')::integer = (select id from pg_temp.draft_context),'same-key retry returns same ID');
select pg_temp.assert_true((select count(*) = 1 from public.products),'retry did not duplicate');
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Changed','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'PT400');
select pg_temp.expect_error('select * from batool_catalog_internal.creation_requests','42501');
select pg_temp.expect_error('update public.products set name=''Unauthorized''','42501');
select pg_temp.expect_error('delete from public.products','42501');
select pg_temp.expect_error('insert into public.product_image_assets(image_path) values(''fake'')','42501');
-- Activation cannot precede image receipt or storefront metadata.
select pg_temp.expect_error(format('select public.owner_save_catalog_product(%s,%s,''Draft'',''Concept'',12345,true,''{"S":null,"M":0,"L":1,"XL":2}'',null,null,null,false)',id,revision),'PT422') from pg_temp.draft_context;
select pg_temp.expect_error(format('select public.owner_save_catalog_product(%s,%s,''Draft'',''Concept'',12345,true,''{"S":null,"M":0,"L":1,"XL":2}'',''Daily Pret'',''#51343f'',''Concept'',false)',id,revision),'PT422') from pg_temp.draft_context;
select pg_temp.expect_error(format('select public.owner_update_catalog_product(%s,1,''Draft'',''Concept'',12345,false,''{"S":null,"M":0,"L":1,"XL":2}'')',id),'PT409') from pg_temp.draft_context;
-- A rename/save retains its generated slug and advances the revision.
select public.owner_save_catalog_product(id,revision,'Renamed','Concept',12345,false,'{"S":null,"M":0,"L":1,"XL":2}','Daily Pret','#51343f','Concept',true) from pg_temp.draft_context;
select pg_temp.assert_true((select p.slug=c.slug and p.edit_revision>c.revision and p.archived and not p.active from public.products p cross join pg_temp.draft_context c),'revision-checked archive retains identity');
reset role;
-- Products and variants are invisible to anonymous storefront reads while draft/archived.
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*)=0 from public.products),'draft excluded from anonymous products');
select pg_temp.assert_true((select count(*)=0 from public.product_variants),'draft variants excluded');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000702"}',true);
select pg_temp.assert_true((select count(*)=0 from public.products),'Partner cannot read admin drafts');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000703"}',true);
select pg_temp.assert_true((select count(*)=0 from public.products),'unassigned cannot read admin drafts');
reset role;
-- Trusted SQL cannot repurpose identities or hard-delete products either.
-- Drain valid deferred events before checking the TRUNCATE guard; otherwise
-- PostgreSQL rejects TRUNCATE with 55006 before our immutable-data trigger runs.
set constraints all immediate;
set constraints all deferred;
select pg_temp.expect_error('update public.products set slug=''changed-route''','23514');
select pg_temp.expect_error('update public.products set image_slug=''gulnaar''','23514');
select pg_temp.expect_error('delete from public.products','23514');
select pg_temp.expect_error('truncate public.products cascade','23514');
select pg_temp.expect_error('update public.product_variants set size=''XXL'' where size=''XL''','23514');
select pg_temp.expect_error('update public.product_variants set product_id=999 where size=''XL''','23514');
do $$ declare reserved integer; begin
  foreach reserved in array array[9,10] loop
    perform pg_temp.expect_error(format('insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag) values(%s,''reserved-%s'',''Reserved'',''Fixture'',1,''noor'',''Daily Pret'',''#000000'',''Test'')',reserved,reserved),'23514');
  end loop;
end; $$;
-- Inject failure on the last variant to prove product/retry records roll back together.
create function pg_temp.fail_last_variant() returns trigger language plpgsql as $$ begin
  if current_setting('batool.fail_last_variant',true)='yes' and new.size='XL' then raise exception using errcode='23514',message='Synthetic last-variant failure'; end if;
  return new;
end; $$;
create trigger disposable_variant_failure before insert on public.product_variants for each row execute function pg_temp.fail_last_variant();
set local batool.fail_last_variant='yes';
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000701"}',true);
select pg_temp.expect_error($q$select public.owner_create_product_draft('00000000-0000-4000-8000-000000000712','Atomic','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')$q$,'23514');
reset role;
set local batool.fail_last_variant='no';
select pg_temp.assert_true((select count(*)=1 from public.products),'failed atomic create left no product');
select pg_temp.assert_true((select count(*)=4 from public.product_variants),'failed atomic create left no variants');
select pg_temp.assert_true((select count(*)=1 from batool_catalog_internal.creation_requests),'failed atomic create left no retry record');
drop trigger disposable_variant_failure on public.product_variants;
-- Complete-draft constraints prevent orphaning a size even via trusted SQL.
do $$ begin
  begin
    delete from public.product_variants where size='XL';
    set constraints all immediate;
    raise exception 'FAIL: incomplete draft committed';
  exception when check_violation then null;
  end;
end; $$;
set constraints all deferred;
-- Same key is scoped to the verified Owner, not global and not client metadata.
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000704"}',true);
select pg_temp.assert_true((public.owner_create_product_draft('00000000-0000-4000-8000-000000000711','Draft','Concept',12345,'{"S":null,"M":0,"L":1,"XL":2}')->>'id')::integer <> (select id from pg_temp.draft_context),'separate Owner request scopes');
reset role;
-- Synthetic Storage metadata/receipt fixtures below test database attachment
-- rules only, never real byte decoding or hosted image delivery.
insert into storage.objects(bucket_id,name,metadata)
select 'product-images','products/' || c.id || '/00000000-0000-4000-8000-000000000701/00000000-0000-4000-8000-000000000721/' || f.name,
  '{"mimetype":"image/webp"}'::jsonb
from pg_temp.draft_context c cross join unnest(array['192.webp','384.webp','main.webp']) as f(name);
select public.register_product_image_asset(id,'00000000-0000-4000-8000-000000000701',
  'products/' || id || '/00000000-0000-4000-8000-000000000701/00000000-0000-4000-8000-000000000721/main.webp',384,512,1234,repeat('a',64))
from pg_temp.draft_context;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000701"}',true);
-- Another product's registered asset cannot be attached, even by an Owner.
select pg_temp.expect_error(format('select public.owner_attach_product_image(%s,%s,%L,''Fixture alt'')',p.id,p.edit_revision,
  'products/' || c.id || '/00000000-0000-4000-8000-000000000701/00000000-0000-4000-8000-000000000721/main.webp'),'22023')
from public.products p cross join pg_temp.draft_context c where p.id <> c.id;
select public.owner_attach_product_image(p.id,p.edit_revision,
  'products/' || p.id || '/00000000-0000-4000-8000-000000000701/00000000-0000-4000-8000-000000000721/main.webp','Synthetic fixture outfit')
from public.products p join pg_temp.draft_context c on c.id=p.id;
select public.owner_save_catalog_product(p.id,p.edit_revision,'Renamed','Concept',12345,true,'{"S":null,"M":0,"L":1,"XL":2}',
  'Daily Pret','#51343f','Concept',false)
from public.products p join pg_temp.draft_context c on c.id=p.id;
select pg_temp.assert_true((select p.active and not p.archived and p.image_note='Draft concept. Photography and garment specifications await brand confirmation.' from public.products p join pg_temp.draft_context c on c.id=p.id),'complete activation preserves disclosure');
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*)=1 from public.products),'positive control: only complete active product is public');
select pg_temp.assert_true((select count(*)=4 from public.product_variants),'positive control: active product sizes are public');
reset role;
select pg_temp.assert_true(not has_table_privilege('authenticated','batool_catalog_internal.creation_requests','SELECT'),'no retry-key table grants');
select pg_temp.assert_true(not has_sequence_privilege('authenticated','batool_catalog_internal.product_ids','USAGE'),'no sequence grant');
select pg_temp.assert_true(not has_function_privilege('anon','public.owner_create_product_draft(uuid,text,text,integer,jsonb)','EXECUTE'),'anon has no create execute');
set constraints all immediate;
select 'PASS disposable product-draft assertions; SQL role/JWT simulation only' as result;
rollback;
