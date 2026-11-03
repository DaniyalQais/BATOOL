-- NEW focused synthetic SQL checks. Loopback disposable clone only, never BATOOL.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  if current_setting('batool.test_disposable',true) is distinct from 'yes'
    or inet_server_addr() is distinct from '127.0.0.1'::inet then raise exception 'Owned loopback disposable database required'; end if;
end; $$;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$ begin
  if v is distinct from true then raise exception 'FAIL %',label; end if;
end; $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=expected then return; end if;
    raise exception 'Expected %, received %',expected,actual;
  end;
  raise exception 'Expected error %, succeeded',expected;
end; $$;
do $$ begin execute format('grant usage on schema %I to anon,authenticated,service_role',
  (select nspname from pg_namespace where oid=pg_my_temp_schema())); end; $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text) to anon,authenticated,service_role;
create temp table media_context(id integer,revision integer,path text);
grant all on media_context to authenticated;
insert into auth.users(id,aud,role,email) values
 ('00000000-0000-4000-8000-000000001401','authenticated','authenticated','media-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000001402','authenticated','authenticated','media-partner@example.invalid'),
 ('00000000-0000-4000-8000-000000001403','authenticated','authenticated','media-unassigned@example.invalid');
insert into public.dashboard_roles(user_id,role) values
 ('00000000-0000-4000-8000-000000001401','owner'),('00000000-0000-4000-8000-000000001402','partner');
select pg_temp.assert_true(not has_function_privilege('anon','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE')
 and not has_function_privilege('service_role','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE')
 and has_function_privilege('authenticated','public.owner_approve_catalog_merchandise(integer,integer,boolean)','EXECUTE'),'approval execute ACL');
select pg_temp.assert_true(not has_table_privilege('authenticated','batool_catalog_internal.merchandise_approvals','INSERT')
 and not has_schema_privilege('authenticated','batool_catalog_internal','USAGE'),'approval cannot be forged');
select pg_temp.assert_true(not has_function_privilege('authenticated','batool_catalog_internal.orderable_product(integer)','EXECUTE')
 and not has_function_privilege('service_role','batool_catalog_internal.orderable_product(integer)','EXECUTE'),'private helper ACL');

set local role authenticated;
do $$ declare subject text; begin
 foreach subject in array array['00000000-0000-4000-8000-000000001402','00000000-0000-4000-8000-000000001403'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);
  perform pg_temp.expect_error('select public.owner_approve_catalog_merchandise(-1,1,true)','42501');
  perform pg_temp.expect_error('select public.owner_product_media_ready()','42501');
 end loop;
 perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000001401","is_anonymous":true}',true);
 perform pg_temp.expect_error('select public.owner_approve_catalog_merchandise(-1,1,true)','42501');
end; $$;
reset role;
set local role anon;
select pg_temp.expect_error('select public.owner_approve_catalog_merchandise(-1,1,true)','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000001401"}',true);
select pg_temp.assert_true(public.owner_product_media_ready(),'Owner readiness uses real schema guard');
do $$ declare p jsonb; begin
 p:=public.owner_create_product_draft('00000000-0000-4000-8000-000000001411','Synthetic media fixture','Synthetic merchandise fixture',12345,'{"S":null,"M":0,"L":1,"XL":2}');
 insert into media_context(id,revision) values((p->>'id')::integer,(p->>'edit_revision')::integer);
end; $$;
do $$ declare c media_context; p jsonb; begin
 select * into c from media_context;
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,false)',c.id,c.revision),'22023');
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,true)',c.id,c.revision),'PT422');
 p:=public.owner_save_catalog_product(c.id,c.revision,'Synthetic media fixture','Synthetic merchandise fixture',12345,false,'{"S":null,"M":0,"L":1,"XL":2}','Daily Pret','#51343f','Fixture',false);
 update media_context set revision=(p->>'edit_revision')::integer;
end; $$;
reset role;
-- Synthetic receipts stand in for trusted byte validation only in this SQL test;
-- actual decoder/transport tests are separate, not actual hosted authorization.
update media_context set path='products/'||id||'/00000000-0000-4000-8000-000000001401/00000000-0000-4000-8000-000000001421/main.webp';
insert into storage.objects(bucket_id,name,metadata)
 select 'product-images',regexp_replace(c.path,'main\.webp$','')||f.name,'{"mimetype":"image/webp"}'::jsonb
 from media_context c cross join unnest(array['192.webp','384.webp','main.webp']) f(name);
insert into public.product_image_assets(image_path,product_id,uploaded_by,width,height,byte_size,sha256)
 select path,id,'00000000-0000-4000-8000-000000001401',384,512,100,repeat('a',64) from media_context;
set local role authenticated;
do $$ declare c media_context; p jsonb; begin
 select * into c from media_context;
 perform pg_temp.expect_error(format('select public.owner_attach_product_image(%s,%s,%L,%L)',c.id,c.revision,replace(c.path,'1421','1422'),'Fixture photo'),'22023');
 p:=public.owner_attach_product_image(c.id,c.revision,c.path,'Synthetic product photo');
 update media_context set revision=(p->>'edit_revision')::integer;
 select * into c from media_context;
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,true)',c.id,c.revision-1),'PT409');
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,true)',c.id,c.revision),'PT422');
 perform pg_temp.expect_error(format('select public.owner_save_catalog_product(%s,%s,%L,%L,12345,true,%L,%L,%L,%L,false)',c.id,c.revision,'Synthetic media fixture','Synthetic merchandise fixture','{"S":0,"M":0,"L":1,"XL":2}','Daily Pret','#51343f','Fixture'),'PT422');
 p:=public.owner_save_catalog_product(c.id,c.revision,'Synthetic media fixture','Synthetic merchandise fixture',12345,false,'{"S":0,"M":0,"L":1,"XL":2}','Daily Pret','#51343f','Fixture',false);
 update media_context set revision=(p->>'edit_revision')::integer;
end; $$;
reset role;
select pg_temp.expect_error('update public.products set is_demo=false where id=(select id from media_context)','23514');
select pg_temp.assert_true(not batool_catalog_internal.orderable_product((select id from media_context)),'photo alone cannot order');
-- Missing objects must fail even with a trusted receipt.
delete from storage.objects where bucket_id='product-images' and name=(select regexp_replace(path,'main\.webp$','192.webp') from media_context);
set local role authenticated;
do $$ declare c media_context; begin select * into c from media_context;
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,true)',c.id,c.revision),'PT422'); end; $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'product-images',regexp_replace(path,'main\.webp$','192.webp'),'{"mimetype":"image/webp"}' from media_context;
set local role authenticated;
do $$ declare c media_context; p jsonb; begin
 select * into c from media_context;
 p:=public.owner_approve_catalog_merchandise(c.id,c.revision,true);
 perform pg_temp.assert_true((p->>'is_demo')::boolean=false and (p->>'active')::boolean=false,'approval retains inactivity');
 perform pg_temp.expect_error(format('select public.owner_approve_catalog_merchandise(%s,%s,true)',c.id,c.revision),'PT409');
 p:=public.owner_save_catalog_product(c.id,(p->>'edit_revision')::integer,'Synthetic media fixture','Synthetic merchandise fixture',12345,true,'{"S":0,"M":0,"L":1,"XL":2}','Daily Pret','#51343f','Fixture',false);
 update media_context set revision=(p->>'edit_revision')::integer;
end; $$;
reset role;
select pg_temp.assert_true(batool_catalog_internal.orderable_product((select id from media_context)),'approved known-stock merchandise qualifies, including zero stock sizes');
select pg_temp.assert_true((select count(*)=1 from batool_catalog_internal.merchandise_approvals where product_id=(select id from media_context)),'one current private approval');
-- The new checkout predicate must be in the actual snapshot, not a renamed copy.
select pg_temp.assert_true(position('batool_catalog_internal.orderable_product(product.id)' in pg_get_functiondef('batool_checkout_internal.snapshot(jsonb,text)'::regprocedure))>0,'checkout uses private photo/approval/stock guard');
-- Alt-only edits retain approval; changing the main photo requires reapproval.
set local role authenticated;
do $$ declare c media_context; p jsonb; begin select * into c from media_context;
 p:=public.owner_attach_product_image(c.id,c.revision,c.path,'Revised synthetic alt text');
 perform pg_temp.assert_true((p->>'is_demo')::boolean=false and (p->>'active')::boolean=true,'alt-only retains approval');
 update media_context set revision=(p->>'edit_revision')::integer;
end; $$;
reset role;
insert into storage.objects(bucket_id,name,metadata)
 select 'product-images',replace(regexp_replace(c.path,'main\.webp$','')||f.name,'1421','1422'),'{"mimetype":"image/webp"}'::jsonb
 from media_context c cross join unnest(array['192.webp','384.webp','main.webp']) f(name);
insert into public.product_image_assets(image_path,product_id,uploaded_by,width,height,byte_size,sha256)
 select replace(path,'1421','1422'),id,'00000000-0000-4000-8000-000000001401',384,512,100,repeat('b',64) from media_context;
set local role authenticated;
do $$ declare c media_context; p jsonb; begin select * into c from media_context;
 p:=public.owner_attach_product_image(c.id,c.revision,replace(c.path,'1421','1422'),'Replacement synthetic photo');
 perform pg_temp.assert_true((p->>'is_demo')::boolean=true and (p->>'active')::boolean=false,'replacement resets sample and active status');
 update media_context set revision=(p->>'edit_revision')::integer,path=replace(path,'1421','1422');
end; $$;
reset role;
select pg_temp.assert_true(not batool_catalog_internal.orderable_product((select id from media_context)),'old photo approval never approves replacement');
select pg_temp.assert_true((select count(*)=2 from public.product_image_assets where product_id=(select id from media_context)),'both image receipts retained');
set constraints all immediate;
select 'PASS new media ACLs, synthetic roles, validation prerequisites, stale revisions, approval, activation, alt edits, photo replacement';
rollback;
