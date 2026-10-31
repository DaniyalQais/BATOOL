begin;

alter table public.products add column edit_revision integer not null default 1 check (edit_revision > 0);
alter table public.products add constraint products_editor_name_length check (char_length(btrim(name)) between 1 and 120 and name ~ '[^[:space:]]');
alter table public.products add constraint products_editor_description_length check (char_length(btrim(description)) between 1 and 2000 and description ~ '[^[:space:]]');

-- Every update, including trusted SQL edits, invalidates an open editor snapshot.
create function public.batool_product_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.edit_revision := old.edit_revision + 1;
  return new;
end;
$$;
revoke all on function public.batool_product_revision() from public, anon, authenticated;
create trigger product_edit_revision before update on public.products
for each row execute function public.batool_product_revision();

create function public.batool_variant_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The product trigger supplies the increment; no client controls the revision.
  update public.products set edit_revision = edit_revision
  where id = case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.batool_variant_revision() from public, anon, authenticated;
create trigger variant_edit_revision after insert or update or delete on public.product_variants
for each row execute function public.batool_variant_revision();

grant select on public.products, public.product_variants to authenticated;
create policy owner_products_read on public.products for select to authenticated using (
  exists (select 1 from public.dashboard_roles r where r.user_id = (select auth.uid()) and r.role = 'owner')
);
create policy owner_variants_read on public.product_variants for select to authenticated using (
  exists (select 1 from public.dashboard_roles r where r.user_id = (select auth.uid()) and r.role = 'owner')
);

-- No direct catalog writes, even for Owner: all browser saves use the atomic RPC.
-- Existing anonymous active-product SELECT policies and role policies are unchanged.
revoke insert, update, delete on public.products, public.product_variants from public, anon, authenticated;

create function public.owner_update_catalog_product(
  p_product_id integer,
  p_expected_revision integer,
  p_name text,
  p_description text,
  p_price_minor integer,
  p_active boolean,
  p_stocks jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_revision integer;
  size_name text;
  stock_value jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;
  -- Live mapping, not JWT/user metadata. Lock it against concurrent demotion.
  perform 1 from public.dashboard_roles
  where user_id = auth.uid() and role = 'owner' for share;
  if not found then raise exception using errcode = '42501', message = 'Owner access required'; end if;

  if p_product_id is null or p_product_id not in (0, 2, 3, 7, 8, 11) or
     p_expected_revision is null or p_expected_revision < 1 or
     p_name is null or char_length(btrim(p_name)) not between 1 and 120 or p_name !~ '[^[:space:]]' or
     p_description is null or char_length(btrim(p_description)) not between 1 and 2000 or p_description !~ '[^[:space:]]' or
     p_price_minor is null or p_price_minor < 0 or p_active is null then
    raise exception using errcode = '22023', message = 'Invalid product fields';
  end if;
  if p_stocks is null or jsonb_typeof(p_stocks) <> 'object' then
    raise exception using errcode = '22023', message = 'Expected four size quantities';
  end if;
  if not (p_stocks ?& array['S','M','L','XL']) or (select count(*) from jsonb_object_keys(p_stocks)) <> 4 then
    raise exception using errcode = '22023', message = 'Only S, M, L and XL are permitted';
  end if;
  foreach size_name in array array['S','M','L','XL'] loop
    stock_value := p_stocks -> size_name;
    if jsonb_typeof(stock_value) <> 'null' then
      if jsonb_typeof(stock_value) <> 'number' or stock_value::text !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = 'Stock must be null or a nonnegative integer';
      end if;
      if (stock_value::text)::numeric > 2147483647 then
        raise exception using errcode = '22023', message = 'Stock is out of range';
      end if;
    end if;
  end loop;

  select edit_revision into current_revision from public.products where id = p_product_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Product not found'; end if;
  if current_revision <> p_expected_revision then
    raise exception using errcode = 'PT409', message = 'Product changed; reload before saving';
  end if;
  perform 1 from public.product_variants where product_id = p_product_id order by size for update;
  if (select count(*) from public.product_variants where product_id = p_product_id) <> 4 then
    raise exception using errcode = '22023', message = 'Product must have all four existing variants';
  end if;

  update public.products set name = btrim(p_name), description = btrim(p_description),
    price_minor = p_price_minor, active = p_active where id = p_product_id;
  foreach size_name in array array['S','M','L','XL'] loop
    update public.product_variants
    set stock_quantity = case when jsonb_typeof(p_stocks -> size_name) = 'null' then null else (p_stocks ->> size_name)::integer end
    where product_id = p_product_id and size = size_name
      and stock_quantity is distinct from case when jsonb_typeof(p_stocks -> size_name) = 'null' then null else (p_stocks ->> size_name)::integer end;
  end loop;
  -- Only named fields above can change; IDs, imagery, category, demo flags and
  -- role assignments are not arguments and are never written by this function.
  return (select to_jsonb(p) || jsonb_build_object('product_variants',
    (select jsonb_agg(to_jsonb(v) order by v.size) from public.product_variants v where v.product_id = p.id))
    from public.products p where p.id = p_product_id);
end;
$$;
revoke all on function public.owner_update_catalog_product(integer, integer, text, text, integer, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.owner_update_catalog_product(integer, integer, text, text, integer, boolean, jsonb) to authenticated;
commit;
