-- PREPARED ONLY. Review product_drafts_preflight.sql; never replay applied migrations.
begin;
set local lock_timeout = '5s';
lock table public.products in access exclusive mode;

create schema batool_catalog_internal;
revoke all on schema batool_catalog_internal from public, anon, authenticated, service_role;
create sequence batool_catalog_internal.product_ids as integer minvalue 12 start 12 no cycle;
-- One-time database initialization under the table lock, never client max(id)+1.
select setval('batool_catalog_internal.product_ids',
  greatest(12::bigint, coalesce((select max(id)::bigint + 1 from public.products),12)), false);
revoke all on sequence batool_catalog_internal.product_ids from public, anon, authenticated, service_role;

alter table public.products
  add column draft_managed boolean not null default false,
  add column archived boolean not null default false,
  alter column image_slug drop not null,
  alter column subcategory drop not null,
  alter column color drop not null,
  alter column tag drop not null,
  add constraint products_permanent_ids check (id in (0,2,3,7,8,11) or id >= 12),
  add constraint products_draft_identity check (
    draft_managed = (id >= 12) and (not draft_managed or (image_slug is null and is_demo))
  ),
  add constraint products_slug_length check (char_length(slug) <= 160),
  add constraint products_tag_length check (tag is null or char_length(btrim(tag)) between 1 and 80);

create table batool_catalog_internal.creation_requests (
  owner_id uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null,
  request_body jsonb not null,
  product_id integer not null unique references public.products(id) on delete restrict,
  primary key (owner_id, request_key)
);
alter table batool_catalog_internal.creation_requests enable row level security;
revoke all on batool_catalog_internal.creation_requests from public, anon, authenticated, service_role;

create function batool_catalog_internal.require_owner() returns void
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  perform 1 from public.dashboard_roles where user_id = auth.uid() and role = 'owner' for share;
  if not found then raise exception using errcode = '42501', message = 'Owner access required'; end if;
end; $$;

create function batool_catalog_internal.validate_fields(p_name text, p_description text, p_price integer, p_stocks jsonb)
returns void language plpgsql set search_path = '' as $$
declare size_name text; quantity jsonb;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_name !~ '[^[:space:]]'
    or p_description is null or char_length(btrim(p_description)) not between 1 and 2000 or p_description !~ '[^[:space:]]'
    or p_price is null or p_price < 0 then
    raise exception using errcode = '22023', message = 'Invalid name, description or PKR price';
  end if;
  if p_stocks is null or jsonb_typeof(p_stocks) <> 'object' then
    raise exception using errcode = '22023', message = 'Expected S/M/L/XL stock object';
  end if;
  if not (p_stocks ?& array['S','M','L','XL']) or (select count(*) from jsonb_object_keys(p_stocks)) <> 4 then
    raise exception using errcode = '22023', message = 'Only S, M, L and XL are permitted';
  end if;
  foreach size_name in array array['S','M','L','XL'] loop
    quantity := p_stocks -> size_name;
    if jsonb_typeof(quantity) <> 'null' then
      if jsonb_typeof(quantity) <> 'number' or quantity::text !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'Stock must be Unknown or a nonnegative integer';
      end if;
      if quantity::text::numeric > 2147483647 then
        raise exception using errcode = '22023', message = 'Stock is out of range';
      end if;
    end if;
  end loop;
end; $$;

create function batool_catalog_internal.product_json(p_id integer) returns jsonb
language sql volatile set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object('product_variants',
    (select jsonb_agg(to_jsonb(v) order by v.size) from public.product_variants v where v.product_id = p.id))
  from public.products p where p.id = p_id;
$$;

-- Frozen identities and disclosures apply to trusted SQL too; image attachments
-- must continue through migration 005's validated, product-specific receipt path.
create function batool_catalog_internal.guard_product() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514', message = 'Archive products; hard deletion is disabled';
  end if;
  if tg_op = 'UPDATE' and row(new.id,new.slug,new.image_slug,new.draft_managed,new.is_demo,new.image_note)
    is distinct from row(old.id,old.slug,old.image_slug,old.draft_managed,old.is_demo,old.image_note) then
    raise exception using errcode = '23514', message = 'Product identity, slug and concept disclosures are immutable';
  end if;
  if new.main_image_path is not null and not exists (
    select 1 from public.product_image_assets a where a.image_path = new.main_image_path
      and a.product_id = new.id and a.width = new.main_image_width and a.height = new.main_image_height
  ) then raise exception using errcode = '23514', message = 'Product-specific trusted image receipt required'; end if;
  if new.active then
    if new.archived or new.subcategory is null or new.color is null or new.tag is null
      or new.tag !~ '[^[:space:]]'
      or (select count(*) from public.product_variants where product_id = new.id and active) <> 4 then
      raise exception using errcode = 'PT422', message = 'Activation requires collection, card color, label and four active sizes; product must not be archived';
    end if;
    if new.main_image_path is null then
      if new.draft_managed or new.image_slug is distinct from
        (case new.id when 0 then 'gulnaar' when 2 then 'meher' when 3 then 'saba'
          when 7 then 'mira' when 8 then 'noor' when 11 then 'zeenat' end) then
        raise exception using errcode = 'PT422', message = 'Activation requires a validated image belonging to this product and alt text';
      end if;
    else
      -- Receipts remain mandatory; object presence alone is never validation.
      if exists (select 1 from unnest(array['192.webp','384.webp','main.webp']) as files(file_name)
        where not exists (select 1 from storage.objects o where o.bucket_id = 'product-images'
          and o.name = regexp_replace(new.main_image_path,'main\.webp$','') || file_name
          and o.metadata->>'mimetype' = 'image/webp')) then
        raise exception using errcode = 'PT422', message = 'Validated responsive image objects are required before activation';
      end if;
    end if;
  end if;
  return new;
end; $$;
create trigger products_draft_guard before insert or update or delete on public.products
for each row execute function batool_catalog_internal.guard_product();

create function batool_catalog_internal.reject_truncate() returns trigger
language plpgsql set search_path = '' as $$ begin
  raise exception using errcode = '23514', message = 'Catalog truncation is disabled';
end; $$;
create trigger products_no_truncate before truncate on public.products
for each statement execute function batool_catalog_internal.reject_truncate();
create trigger variants_no_truncate before truncate on public.product_variants
for each statement execute function batool_catalog_internal.reject_truncate();

create function batool_catalog_internal.complete_draft() returns trigger
language plpgsql set search_path = '' as $$
declare target integer;
begin
  if tg_table_name = 'products' then target := new.id;
  elsif tg_op = 'DELETE' then target := old.product_id;
  else target := new.product_id; end if;
  if exists(select 1 from public.products where id = target and draft_managed)
    and (select count(*) from public.product_variants where product_id = target) <> 4 then
    raise exception using errcode = '23514', message = 'Draft must retain exactly S/M/L/XL variants';
  end if;
  return null;
end; $$;
create constraint trigger products_complete_draft after insert or update on public.products
deferrable initially deferred for each row execute function batool_catalog_internal.complete_draft();
create constraint trigger variants_complete_draft after insert or update or delete on public.product_variants
deferrable initially deferred for each row execute function batool_catalog_internal.complete_draft();

create function batool_catalog_internal.guard_variant_identity() returns trigger
language plpgsql set search_path = '' as $$ begin
  if row(new.product_id,new.size) is distinct from row(old.product_id,old.size) then
    raise exception using errcode = '23514', message = 'Variant product and size identities are immutable';
  end if;
  return new;
end; $$;
create trigger variants_identity before update on public.product_variants
for each row execute function batool_catalog_internal.guard_variant_identity();

create function public.owner_create_product_draft(
  p_request_key uuid, p_name text, p_description text, p_price_minor integer, p_stocks jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare body jsonb; previous batool_catalog_internal.creation_requests%rowtype;
  allocated integer; stem text; candidate text; suffix integer := 0; constraint_name text; size_name text;
begin
  perform batool_catalog_internal.require_owner();
  perform batool_catalog_internal.validate_fields(p_name,p_description,p_price_minor,p_stocks);
  if p_request_key is null then raise exception using errcode = '22023', message = 'Creation request key required'; end if;
  body := jsonb_build_object('name',btrim(p_name),'description',btrim(p_description),'price',p_price_minor,'stocks',p_stocks);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_request_key::text,0));
  select * into previous from batool_catalog_internal.creation_requests
    where owner_id = auth.uid() and request_key = p_request_key;
  if found then
    if previous.request_body <> body then
      raise exception using errcode = 'PT400', message = 'Creation request already used for different values';
    end if;
    return batool_catalog_internal.product_json(previous.product_id);
  end if;
  allocated := nextval('batool_catalog_internal.product_ids');
  stem := btrim(left(regexp_replace(lower(btrim(p_name)),'[^a-z0-9]+','-','g'),100),'-');
  if stem = '' then stem := 'product'; end if;
  loop
    candidate := stem || '-' || allocated::text || case when suffix = 0 then '' else '-' || suffix::text end;
    begin
      insert into public.products(id,slug,name,description,price_minor,image_slug,subcategory,color,tag,active,is_demo,draft_managed,image_note)
      values(allocated,candidate,btrim(p_name),btrim(p_description),p_price_minor,null,null,null,null,false,true,true,
        'Draft concept. Photography and garment specifications await brand confirmation.');
      exit;
    exception when unique_violation then
      get stacked diagnostics constraint_name = CONSTRAINT_NAME;
      if constraint_name <> 'products_slug_key' then raise; end if;
      suffix := suffix + 1;
    end;
  end loop;
  foreach size_name in array array['S','M','L','XL'] loop
    insert into public.product_variants(product_id,size,active,stock_quantity)
    values(allocated,size_name,true,case when jsonb_typeof(p_stocks -> size_name) = 'null' then null else (p_stocks ->> size_name)::integer end);
  end loop;
  insert into batool_catalog_internal.creation_requests(owner_id,request_key,request_body,product_id)
  values(auth.uid(),p_request_key,body,allocated);
  return batool_catalog_internal.product_json(allocated);
end; $$;

create function public.owner_save_catalog_product(
  p_product_id integer, p_expected_revision integer, p_name text, p_description text,
  p_price_minor integer, p_active boolean, p_stocks jsonb,
  p_subcategory text, p_color text, p_tag text, p_archived boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; size_name text;
begin
  perform batool_catalog_internal.require_owner();
  perform batool_catalog_internal.validate_fields(p_name,p_description,p_price_minor,p_stocks);
  if p_product_id is null or not (p_product_id in (0,2,3,7,8,11) or p_product_id >= 12)
    or p_expected_revision is null or p_expected_revision < 1 or p_active is null or p_archived is null
    or (p_subcategory is not null and p_subcategory not in ('Daily Pret','Festive Edit','Luxury Formals'))
    or (p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$')
    or (p_tag is not null and (char_length(btrim(p_tag)) not between 1 and 80 or p_tag !~ '[^[:space:]]')) then
    raise exception using errcode = '22023', message = 'Invalid catalog fields';
  end if;
  select edit_revision into current_revision from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Product not found'; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = 'PT409', message = 'Product changed; reload before saving'; end if;
  perform 1 from public.product_variants where product_id = p_product_id order by size for update;
  if (select count(*) from public.product_variants where product_id = p_product_id) <> 4 then
    raise exception using errcode = '22023', message = 'Expected four size variants';
  end if;
  update public.products set name = btrim(p_name), description = btrim(p_description), price_minor = p_price_minor,
    active = p_active, subcategory = p_subcategory, color = p_color, tag = btrim(p_tag), archived = p_archived
    where id = p_product_id;
  foreach size_name in array array['S','M','L','XL'] loop
    update public.product_variants set stock_quantity = (p_stocks ->> size_name)::integer
    where product_id = p_product_id and size = size_name
      and stock_quantity is distinct from (p_stocks ->> size_name)::integer;
  end loop;
  return batool_catalog_internal.product_json(p_product_id);
end; $$;

-- Preserve the original RPC contract while extending its allowed identities.
create or replace function public.owner_update_catalog_product(
  p_product_id integer, p_expected_revision integer, p_name text, p_description text,
  p_price_minor integer, p_active boolean, p_stocks jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.products%rowtype;
begin
  perform batool_catalog_internal.require_owner();
  select * into p from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Product not found'; end if;
  return public.owner_save_catalog_product(p_product_id,p_expected_revision,p_name,p_description,p_price_minor,p_active,p_stocks,
    p.subcategory,p.color,p.tag,p.archived);
end; $$;

-- Generalize IDs only; byte validation, ownership, MIME/size limits, immutable
-- storage and product-specific receipts remain mandatory and unchanged.
alter table public.product_image_assets drop constraint product_image_asset_path;
alter table public.product_image_assets add constraint product_image_asset_path check (
  (product_id in (0,2,3,7,8,11) or product_id >= 12) and image_path ~ (
    '^products/' || product_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/main\.webp$')
  and (uploaded_by is null or split_part(image_path,'/',3) = uploaded_by::text)
);
create or replace function public.batool_image_upload_path(p_name text, p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_user is not null and p_name ~ (
    '^products/(0|[1-9][0-9]*)/' || p_user::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    and exists(select 1 from public.products p where p.id::text = split_part(p_name,'/',2)
      and (p.id in (0,2,3,7,8,11) or p.id >= 12)),false);
$$;

create or replace function public.owner_attach_product_image(
  p_product_id integer, p_expected_revision integer, p_image_path text, p_alt text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision integer; asset public.product_image_assets%rowtype;
begin
  perform batool_catalog_internal.require_owner();
  if p_product_id is null or not (p_product_id in (0,2,3,7,8,11) or p_product_id >= 12)
    or p_expected_revision is null or p_expected_revision < 1 or p_image_path is null or p_alt is null
    or char_length(btrim(p_alt)) not between 1 and 240 or p_alt !~ '[^[:space:]]' or p_alt ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Invalid image attachment';
  end if;
  select edit_revision into current_revision from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Product not found'; end if;
  if current_revision <> p_expected_revision then raise exception using errcode = 'PT409', message = 'Product changed; reload before saving'; end if;
  select * into asset from public.product_image_assets where image_path = p_image_path and product_id = p_product_id for update;
  if not found then raise exception using errcode = '22023', message = 'Validated product image required'; end if;
  update public.products set main_image_path = asset.image_path, main_image_width = asset.width,
    main_image_height = asset.height, image_alt = btrim(p_alt) where id = p_product_id;
  update public.product_image_assets set attached_at = coalesce(attached_at,now()) where image_path = asset.image_path;
  return batool_catalog_internal.product_json(p_product_id);
end; $$;
revoke all on function public.owner_attach_product_image(integer,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_attach_product_image(integer,integer,text,text) to authenticated;

-- All application mutations stay behind explicit live Owner checks.
revoke all on all functions in schema batool_catalog_internal from public, anon, authenticated, service_role;
revoke all on function public.owner_create_product_draft(uuid,text,text,integer,jsonb),
  public.owner_save_catalog_product(integer,integer,text,text,integer,boolean,jsonb,text,text,text,boolean),
  public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.owner_create_product_draft(uuid,text,text,integer,jsonb),
  public.owner_save_catalog_product(integer,integer,text,text,integer,boolean,jsonb,text,text,text,boolean),
  public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb) to authenticated;
revoke insert,update,delete,truncate on public.products,public.product_variants from public,anon,authenticated;
commit;
