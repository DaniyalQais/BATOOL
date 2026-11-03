-- PREPARED ONLY. Apply once after review; never replay 001–013.
begin;
set local lock_timeout = '5s';
lock table public.products in access exclusive mode;

-- Decoder bytes are server-only and pinned in code; this is not an upload bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-image-validator-assets','product-image-validator-assets',false,8388608,array['application/gzip']);
create policy batool_decoder_private on storage.objects as restrictive
for all to anon,authenticated
using(bucket_id <> 'product-image-validator-assets')
with check(bucket_id <> 'product-image-validator-assets');

create table batool_catalog_internal.merchandise_approvals (
  product_id integer primary key references public.products(id) on delete restrict,
  image_path text not null references public.product_image_assets(image_path) on delete restrict,
  source_revision integer not null check(source_revision >= 1),
  approved_by uuid not null,
  approved_at timestamptz not null default now()
);
alter table batool_catalog_internal.merchandise_approvals enable row level security;
revoke all on batool_catalog_internal.merchandise_approvals from public,anon,authenticated,service_role;

create function batool_catalog_internal.trusted_photo(p_id integer,p_path text,p_width integer,p_height integer,p_alt text)
returns boolean language sql stable set search_path='' as $$
  select coalesce(p_path is not null and char_length(btrim(p_alt)) between 1 and 240
    and p_alt ~ '[^[:space:]]' and p_alt !~ '[[:cntrl:]]'
    and exists(select 1 from public.product_image_assets a where a.product_id=p_id and a.image_path=p_path
      and a.width=p_width and a.height=p_height)
    and not exists(select 1 from unnest(array['192.webp','384.webp','main.webp']) f(name)
      where not exists(select 1 from storage.objects o where o.bucket_id='product-images'
        and o.name=regexp_replace(p_path,'main\.webp$','') || f.name and o.metadata->>'mimetype'='image/webp')),false);
$$;
create function batool_catalog_internal.known_stock(p_id integer)
returns boolean language sql stable set search_path='' as $$
  select count(*)=4 and coalesce(bool_and(active and stock_quantity is not null and stock_quantity>=0),false)
    from public.product_variants where product_id=p_id and size in ('S','M','L','XL');
$$;
create function batool_catalog_internal.orderable_product(p_id integer)
returns boolean language sql stable set search_path='' as $$
  select coalesce((select p.active and not p.archived and not p.is_demo and p.currency='PKR'
    and batool_catalog_internal.known_stock(p.id)
    and batool_catalog_internal.trusted_photo(p.id,p.main_image_path,p.main_image_width,p.main_image_height,p.image_alt)
    and exists(select 1 from batool_catalog_internal.merchandise_approvals a
      where a.product_id=p.id and a.image_path=p.main_image_path)
    from public.products p where p.id=p_id),false);
$$;

-- Allocated identity stays immutable. Only the new explicit Owner approval can
-- remove sample status; no product, image, order or stock is backfilled.
alter table public.products drop constraint products_draft_identity;
alter table public.products add constraint products_draft_identity check (
  draft_managed=(id>=12) and (not draft_managed or image_slug is null)
);
create or replace function batool_catalog_internal.guard_product() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='Archive products; hard deletion is disabled';
  end if;
  if tg_op='INSERT' and not new.is_demo then
    raise exception using errcode='23514',message='New products must start as samples';
  end if;
  if tg_op='UPDATE' then
    if row(new.id,new.slug,new.image_slug,new.draft_managed,new.image_note)
      is distinct from row(old.id,old.slug,old.image_slug,old.draft_managed,old.image_note) then
      raise exception using errcode='23514',message='Product identity, slug and concept disclosures are immutable';
    end if;
    if new.main_image_path is distinct from old.main_image_path then
      new.is_demo:=true; new.active:=false;
    elsif new.is_demo is distinct from old.is_demo then
      if new.is_demo or not exists(select 1 from batool_catalog_internal.merchandise_approvals a
        where a.product_id=old.id and a.image_path=new.main_image_path
          and a.source_revision=old.edit_revision and a.approved_by=auth.uid()) then
        raise exception using errcode='23514',message='Explicit revision-checked Owner merchandise approval required';
      end if;
      perform batool_catalog_internal.require_owner();
      if not batool_catalog_internal.trusted_photo(new.id,new.main_image_path,new.main_image_width,new.main_image_height,new.image_alt)
        or not batool_catalog_internal.known_stock(new.id) then
        raise exception using errcode='PT422',message='Validated photo and known size stock required';
      end if;
    end if;
  end if;
  if new.main_image_path is not null and not exists(select 1 from public.product_image_assets a
    where a.image_path=new.main_image_path and a.product_id=new.id
      and a.width=new.main_image_width and a.height=new.main_image_height) then
    raise exception using errcode='23514',message='Product-specific trusted image receipt required';
  end if;
  if new.active then
    if new.archived or new.subcategory is null or new.color is null or new.tag is null
      or new.tag !~ '[^[:space:]]'
      or (select count(*) from public.product_variants where product_id=new.id and active)<>4 then
      raise exception using errcode='PT422',message='Activation requires complete saved catalog fields and four active sizes';
    end if;
    if new.draft_managed and new.is_demo then
      raise exception using errcode='PT422',message='Approve real merchandise before activation';
    end if;
    if new.main_image_path is null then
      if new.draft_managed or new.image_slug is distinct from
        (case new.id when 0 then 'gulnaar' when 2 then 'meher' when 3 then 'saba'
          when 7 then 'mira' when 8 then 'noor' when 11 then 'zeenat' end) then
        raise exception using errcode='PT422',message='Validated product photo and alt text required';
      end if;
    elsif not batool_catalog_internal.trusted_photo(new.id,new.main_image_path,new.main_image_width,new.main_image_height,new.image_alt) then
      raise exception using errcode='PT422',message='Validated responsive image objects are required before activation';
    end if;
    if not new.is_demo and (not batool_catalog_internal.known_stock(new.id)
      or not exists(select 1 from batool_catalog_internal.merchandise_approvals a
        where a.product_id=new.id and a.image_path=new.main_image_path)) then
      raise exception using errcode='PT422',message='Owner photo approval and known S/M/L/XL stock required';
    end if;
  end if;
  return new;
end; $$;

create function public.owner_product_media_ready() returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
  perform batool_catalog_internal.require_owner();
  return true;
end; $$;
create function public.owner_approve_catalog_merchandise(p_product_id integer,p_expected_revision integer,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.products;
begin
  perform batool_catalog_internal.require_owner();
  if p_confirmed is distinct from true or p_product_id is null or p_expected_revision is null or p_expected_revision<1 then
    raise exception using errcode='22023',message='Explicit merchandise confirmation and revision required';
  end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception using errcode='PT404',message='Product not found'; end if;
  if p.edit_revision<>p_expected_revision then raise exception using errcode='PT409',message='Product changed; reload before approving'; end if;
  perform 1 from public.product_variants where product_id=p.id order by size for update;
  if p.archived or p.currency<>'PKR' or p.subcategory is null or p.color is null or p.tag is null
    or not batool_catalog_internal.known_stock(p.id)
    or not batool_catalog_internal.trusted_photo(p.id,p.main_image_path,p.main_image_width,p.main_image_height,p.image_alt) then
    raise exception using errcode='PT422',message='Save complete product details, known size stock and a validated product photo before approval';
  end if;
  insert into batool_catalog_internal.merchandise_approvals(product_id,image_path,source_revision,approved_by)
    values(p.id,p.main_image_path,p.edit_revision,auth.uid())
    on conflict(product_id) do update set image_path=excluded.image_path,source_revision=excluded.source_revision,
      approved_by=excluded.approved_by,approved_at=now();
  update public.products set is_demo=false where id=p.id;
  return batool_catalog_internal.product_json(p.id);
end; $$;

revoke all on function public.owner_product_media_ready(),public.owner_approve_catalog_merchandise(integer,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.owner_product_media_ready(),public.owner_approve_catalog_merchandise(integer,integer,boolean) to authenticated;
revoke all on all functions in schema batool_catalog_internal from public,anon,authenticated,service_role;

-- Snapshot hardening is appended below; original OID, locks, prices, shipping,
-- retry keys and grants remain intact. No order or stock mutation occurs here.

do $$ begin
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid='batool_checkout_internal.snapshot(jsonb,text)'::regprocedure) is distinct from '336bc010a9fe2c3ba90b020505375fcd' then
    raise exception 'Unexpected checkout snapshot definition; stop and review without replacing it';
  end if;
end; $$;
create or replace function batool_checkout_internal.snapshot(p_cart jsonb,p_method text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r batool_checkout_internal.readiness; b public.business_settings;
  line jsonb; product public.products; variant public.product_variants;
  lines jsonb:='[]'; subtotal bigint:=0; shipping bigint;
begin
  select * into strict r from batool_checkout_internal.readiness where id for share;
  select * into strict b from public.business_settings where id for share;
  if not r.enabled or not r.zero_tax_reviewed or b.settings->'shipping'->>'mode'='unconfigured'
    or b.settings->>'payment_instructions_state'<>'approved' or b.settings->>'policy_state'<>'approved' then
    raise exception using errcode='PT503',message='Checkout is unavailable';
  end if;
  if p_method is null or p_method not in ('cod','easypaisa','jazzcash') then
    raise exception using errcode='PT400',message='Invalid payment method';
  end if;
  if not (b.settings->>(p_method||'_enabled'))::boolean
    or (p_method='cod' and not r.cod_ready)
    or (p_method='easypaisa' and not r.easypaisa_manual_ready)
    or (p_method='jazzcash' and not r.jazzcash_manual_ready)
    or (p_method<>'cod' and (b.settings->>(p_method||'_account_title') is null
      or b.settings->>(p_method||'_account_number') is null)) then
    raise exception using errcode='PT503',message='Payment method is unavailable';
  end if;
  perform p.id from public.products p where p.id in
    (select (x->>'id')::integer from jsonb_array_elements(p_cart) x) order by p.id for update;
  for line in select * from jsonb_array_elements(p_cart) loop
    select * into product from public.products where id=(line->>'id')::integer;
    if not found or not product.active or product.archived or product.is_demo or product.currency<>'PKR'
      or not batool_catalog_internal.orderable_product(product.id) then
      raise exception using errcode='PT409',message='Product is unavailable';
    end if;
    select * into variant from public.product_variants where product_id=product.id and size=line->>'size' for update;
    if not found or not variant.active or variant.stock_quantity is null
      or variant.stock_quantity<(line->>'quantity')::integer then
      raise exception using errcode='PT409',message='Stock is unavailable';
    end if;
    subtotal:=subtotal+product.price_minor::bigint*(line->>'quantity')::integer;
    lines:=lines || jsonb_build_array(jsonb_build_object('id',product.id,'name',product.name,
      'size',line->>'size','quantity',(line->>'quantity')::integer,'unit_price_minor',product.price_minor::text));
  end loop;
  shipping:=(b.settings->'shipping'->>'fee_minor')::bigint;
  return jsonb_build_object('currency','PKR','lines',lines,'subtotal_minor',subtotal::text,
    'shipping_minor',shipping::text,'total_minor',(subtotal+shipping)::text,'payment_method',p_method,
    'shipping_mode',b.settings->'shipping'->>'mode','settings_revision',b.revision,
    'payment_instructions',b.settings->>'payment_instructions','policy_text',b.settings->>'policy_text');
end; $$;

commit;
