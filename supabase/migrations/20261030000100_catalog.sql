begin;

-- Deliberately fail on existing names: reconcile schema conflicts before applying.
create table public.products (
  id integer primary key check (id >= 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null check (length(trim(description)) > 0),
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'PKR' check (currency = 'PKR'),
  image_slug text not null check (image_slug in ('gulnaar','meher','saba','noor','mira','amanah','layal','zeenat')),
  image_note text,
  card_position text,
  card_zoom numeric check (card_zoom between 1 and 3),
  category text not null default 'Stitched' check (category = 'Stitched'),
  piece_count integer not null default 3 check (piece_count = 3),
  subcategory text not null check (subcategory in ('Daily Pret','Festive Edit','Luxury Formals')),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  tag text not null check (length(trim(tag)) > 0),
  active boolean not null default false,
  is_demo boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  product_id integer not null references public.products(id) on delete restrict,
  size text not null check (size in ('S','M','L','XL')),
  active boolean not null default false,
  stock_quantity integer check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, size)
);
comment on column public.product_variants.stock_quantity is
  'NULL = unknown/unconfirmed; 0 = explicitly out of stock. Build snapshots never reserve inventory.';
comment on column public.products.price_minor is 'PKR minor units (paisa); 100 paisa = 1 rupee.';
comment on column public.products.is_demo is 'Illustrative catalog content, not approved live merchandise.';

create function public.batool_catalog_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.batool_catalog_updated_at() from public, anon, authenticated;
create trigger products_updated_at before update on public.products
for each row execute function public.batool_catalog_updated_at();
create trigger variants_updated_at before update on public.product_variants
for each row execute function public.batool_catalog_updated_at();

alter table public.products enable row level security;
alter table public.product_variants enable row level security;
revoke all on table public.products, public.product_variants from public, anon, authenticated;
grant select on table public.products, public.product_variants to anon;
create policy storefront_products_read on public.products
for select to anon using (active);
create policy storefront_variants_read on public.product_variants
for select to anon using (
  active and exists (
    select 1 from public.products p where p.id = product_id and p.active
  )
);
-- No mutation grants/policies for anon; no customer account access in this phase.
commit;
