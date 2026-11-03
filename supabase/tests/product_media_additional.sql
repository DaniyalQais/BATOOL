-- Additional NEW cases only, same owned loopback clone. No migration replay.
begin;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement;
 exception when insufficient_privilege then return;
 end;
 raise exception 'Expected authorization denial';
end; $$;
do $$ begin execute format('grant usage on schema %I to anon,authenticated',
 (select nspname from pg_namespace where oid=pg_my_temp_schema())); end; $$;
grant execute on function pg_temp.expect_denied(text) to anon,authenticated;
do $$ begin
 if current_setting('batool.test_disposable',true) is distinct from 'yes'
   or inet_server_addr() is distinct from '127.0.0.1'::inet then raise exception 'Disposable loopback only'; end if;
end; $$;
insert into auth.users(id,aud,role,email) values('00000000-0000-4000-8000-000000001451','authenticated','authenticated','media-additional@example.invalid');
insert into public.dashboard_roles(user_id,role) values('00000000-0000-4000-8000-000000001451','owner');
create temp table media_extra(id integer,revision integer,path text);
grant all on media_extra to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000001451"}',true);
do $$ declare p jsonb; begin
 if public.owner_product_media_ready() is distinct from true then raise exception 'Owner readiness failed'; end if;
 p:=public.owner_create_product_draft('00000000-0000-4000-8000-000000001461','Synthetic photo owner','Synthetic fixture',100,'{"S":0,"M":0,"L":0,"XL":0}');
 insert into media_extra values((p->>'id')::integer,(p->>'edit_revision')::integer,null);
 p:=public.owner_create_product_draft('00000000-0000-4000-8000-000000001462','Synthetic other product','Synthetic fixture',100,'{"S":0,"M":0,"L":0,"XL":0}');
 insert into media_extra values((p->>'id')::integer,(p->>'edit_revision')::integer,null);
end; $$;
reset role;
update media_extra set path='products/'||id||'/00000000-0000-4000-8000-000000001451/00000000-0000-4000-8000-000000001471/main.webp';
insert into public.product_image_assets(image_path,product_id,uploaded_by,width,height,byte_size,sha256)
 select path,id,'00000000-0000-4000-8000-000000001451',384,512,100,repeat('c',64) from media_extra where id=(select min(id) from media_extra);
set local role authenticated;
do $$ declare first media_extra; second media_extra; denied boolean:=false; begin
 select * into first from media_extra order by id limit 1;
 select * into second from media_extra order by id desc limit 1;
 begin perform public.owner_attach_product_image(second.id,second.revision,first.path,'Wrong product photo');
 exception when invalid_parameter_value then denied:=true;
 end;
 if not denied then raise exception 'Cross-product receipt accepted'; end if;
end; $$;
reset role;
-- Deliberately broad permissive test policy demonstrates the new restrictive
-- decoder guard still denies authenticated writes and anonymous reads.
grant select,insert on storage.objects to anon,authenticated;
grant usage on schema storage to anon,authenticated;
create policy media_test_broad on storage.objects for all to anon,authenticated using(true) with check(true);
insert into storage.objects(bucket_id,name,metadata) values('product-image-validator-assets','synthetic-private-decoder','{"mimetype":"application/gzip"}');
set local role authenticated;
select pg_temp.expect_denied($q$insert into storage.objects(bucket_id,name,owner_id,metadata)
 values('product-image-validator-assets','synthetic-forgery','00000000-0000-4000-8000-000000001451','{"mimetype":"application/gzip"}')$q$);
reset role;
set local role anon;
do $$ begin if exists(select 1 from storage.objects where bucket_id='product-image-validator-assets') then
 raise exception 'Private decoder exposed to anonymous role'; end if; end; $$;
reset role;
set constraints all immediate;
select 'PASS new media additional Owner readiness, cross-product rejection, private decoder RLS despite broad permissive policy';
rollback;
