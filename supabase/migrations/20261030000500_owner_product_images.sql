begin;

-- Plain INSERT/CREATE deliberately fail on conflicting names. Review first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-image-uploads', 'product-image-uploads', false, 5242880,
   array['image/jpeg','image/png','image/webp']),
  ('product-images', 'product-images', true, 5242880, array['image/webp']);

create function public.batool_catalog_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->>'is_anonymous', 'false') <> 'true'
    and exists (select 1 from public.dashboard_roles
                where user_id = auth.uid() and role = 'owner');
$$;
revoke all on function public.batool_catalog_owner() from public;
grant execute on function public.batool_catalog_owner() to anon, authenticated;

create function public.batool_image_upload_path(p_name text, p_user uuid) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_user is not null and p_name ~ (
    '^products/(0|2|3|7|8|11)/' || p_user::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ), false);
$$;
revoke all on function public.batool_image_upload_path(text, uuid) from public;
grant execute on function public.batool_image_upload_path(text, uuid) to anon, authenticated;

-- Restrictive guards also constrain any existing broad permissive Storage policy.
-- Public-bucket GETs are public; these SELECT rules do not enable public listing.
create policy batool_images_insert_guard on storage.objects as restrictive
for insert to public with check (
  bucket_id not in ('product-image-uploads','product-images') or (
    bucket_id = 'product-image-uploads' and public.batool_catalog_owner()
    and owner_id = (select auth.uid())::text
    and public.batool_image_upload_path(name, (select auth.uid()))
  )
);
create policy batool_images_read_guard on storage.objects as restrictive
for select to public using (
  bucket_id not in ('product-image-uploads','product-images') or (
    bucket_id = 'product-image-uploads' and public.batool_catalog_owner()
    and owner_id = (select auth.uid())::text
    and public.batool_image_upload_path(name, (select auth.uid()))
  )
);
create policy batool_images_update_guard on storage.objects as restrictive
for update to public
using (bucket_id not in ('product-image-uploads','product-images'))
with check (bucket_id not in ('product-image-uploads','product-images'));
create policy batool_images_delete_guard on storage.objects as restrictive
for delete to public using (bucket_id not in ('product-image-uploads','product-images'));
create policy batool_owner_image_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'product-image-uploads' and public.batool_catalog_owner()
  and owner_id = (select auth.uid())::text
  and public.batool_image_upload_path(name, (select auth.uid()))
);
create policy batool_owner_image_upload_read on storage.objects
for select to authenticated using (
  bucket_id = 'product-image-uploads' and public.batool_catalog_owner()
  and owner_id = (select auth.uid())::text
  and public.batool_image_upload_path(name, (select auth.uid()))
);

-- An immutable validation receipt, NOT a gallery or an upload supplied by clients.
-- Only the trusted byte-decoding validator may register assets.
create table public.product_image_assets (
  image_path text primary key,
  product_id integer not null references public.products(id) on delete restrict,
  uploaded_by uuid references auth.users(id) on delete set null,
  width integer not null check (width between 384 and 1600),
  height integer not null check (height between 384 and 1600),
  byte_size integer not null check (byte_size between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  attached_at timestamptz,
  constraint product_image_asset_path check (
    product_id in (0,2,3,7,8,11) and image_path ~ (
      '^products/' || product_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/main\.webp$'
    ) and (uploaded_by is null or split_part(image_path,'/',3) = uploaded_by::text)
  )
);
alter table public.product_image_assets enable row level security;
revoke all on public.product_image_assets from public, anon, authenticated, service_role;
grant select on public.product_image_assets to authenticated;
create policy owner_image_assets_read on public.product_image_assets
for select to authenticated using (public.batool_catalog_owner());

alter table public.products
  add column main_image_path text references public.product_image_assets(image_path) on delete restrict,
  add column main_image_width integer,
  add column main_image_height integer,
  add column image_alt text,
  add constraint products_main_image_valid check (
    (main_image_path is null and main_image_width is null and main_image_height is null and image_alt is null)
    or (
      main_image_path is not null and main_image_width is not null and main_image_height is not null and image_alt is not null
      and main_image_width between 384 and 1600 and main_image_height between 384 and 1600
      and char_length(btrim(image_alt)) between 1 and 240
      and image_alt ~ '[^[:space:]]' and image_alt !~ '[[:cntrl:]]'
      and main_image_path ~ ('^products/' || id::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/main\.webp$')
    )
  );

-- Trusted Edge-only registration. No caller-controlled receipt or dimensions.
create function public.register_product_image_asset(
  p_product_id integer, p_user_id uuid, p_image_path text,
  p_width integer, p_height integer, p_byte_size integer, p_sha256 text
) returns void
language plpgsql security definer set search_path = '' as $$
declare object_name text; base_path text;
begin
  perform 1 from public.dashboard_roles where user_id = p_user_id and role = 'owner' for share;
  if not found then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if p_user_id is null or p_image_path is null or p_product_id is null
     or split_part(p_image_path,'/',3) <> p_user_id::text then
    raise exception using errcode = '22023', message = 'Invalid image receipt';
  end if;
  base_path := regexp_replace(p_image_path, '/main\.webp$', '');
  foreach object_name in array array['192.webp','384.webp','main.webp'] loop
    if not exists (select 1 from storage.objects where bucket_id = 'product-images'
      and name = base_path || '/' || object_name and metadata->>'mimetype' = 'image/webp') then
      raise exception using errcode = '22023', message = 'Validated image objects missing';
    end if;
  end loop;
  insert into public.product_image_assets (image_path, product_id, uploaded_by, width, height, byte_size, sha256)
  values (p_image_path, p_product_id, p_user_id, p_width, p_height, p_byte_size, p_sha256);
end;
$$;
revoke all on function public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.register_product_image_asset(integer,uuid,text,integer,integer,integer,text) to service_role;

create function public.owner_attach_product_image(
  p_product_id integer, p_expected_revision integer, p_image_path text, p_alt text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision integer; asset public.product_image_assets%rowtype;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  perform 1 from public.dashboard_roles where user_id = auth.uid() and role = 'owner' for share;
  if not found then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if p_product_id is null or p_product_id not in (0,2,3,7,8,11)
    or p_expected_revision is null or p_expected_revision < 1
    or p_image_path is null or p_alt is null
    or char_length(btrim(p_alt)) not between 1 and 240 or p_alt !~ '[^[:space:]]' or p_alt ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Invalid image attachment';
  end if;
  select edit_revision into current_revision from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Product not found'; end if;
  if current_revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'Product changed; reload before saving';
  end if;
  select * into asset from public.product_image_assets where image_path = p_image_path and product_id = p_product_id for update;
  if not found then raise exception using errcode = '22023', message = 'Validated product image required'; end if;
  update public.products set main_image_path = asset.image_path,
    main_image_width = asset.width, main_image_height = asset.height, image_alt = btrim(p_alt)
    where id = p_product_id;
  update public.product_image_assets set attached_at = coalesce(attached_at, now()) where image_path = asset.image_path;
  return (select to_jsonb(p) || jsonb_build_object('product_variants',
    (select jsonb_agg(to_jsonb(v) order by v.size) from public.product_variants v where v.product_id = p.id))
    from public.products p where p.id = p_product_id);
end;
$$;
revoke all on function public.owner_attach_product_image(integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.owner_attach_product_image(integer,integer,text,text) to authenticated;

-- Existing anonymous catalog policies and the detail-save RPC stay unchanged.
-- Even Owner has no direct product/receipt writes or Storage overwrite/delete.
commit;
