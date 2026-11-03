-- LOCAL PREPARATION ONLY. No checkout or callable order-creation/status RPC.
-- Plain CREATE deliberately fails on conflicts. Run orders_preflight.sql first.
begin;
set local lock_timeout = '5s';

create schema batool_order_internal;
revoke all on schema batool_order_internal from public, anon, authenticated, service_role;

-- This entire table is the Partner reporting surface. Never add PII, actors,
-- product details, payment references or idempotency material to it.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  currency text not null check (currency = 'PKR'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  shipping_minor bigint not null check (shipping_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  discount_minor bigint not null check (discount_minor >= 0 and discount_minor <= subtotal_minor),
  total_minor bigint not null check (total_minor >= 0),
  fulfillment_status text not null default 'pending'
    check (fulfillment_status in ('pending','confirmed','packing','shipped','delivered','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','failed','paid','refunded')),
  status_revision bigint not null default 1 check (status_revision > 0),
  constraint orders_total_matches check (
    total_minor::numeric = subtotal_minor::numeric + shipping_minor::numeric
      + tax_minor::numeric - discount_minor::numeric
  )
);
comment on table public.orders is
  'Report-safe identifiers/dates/PKR amounts/statuses only. No creation endpoint or browser writes. No commissions.';
comment on column public.orders.shipping_minor is
  'Explicit trusted amount, no default or approved shipping policy. Demo checkout values are not authoritative.';
comment on column public.orders.tax_minor is
  'Explicit trusted amount, no default or approved tax policy.';
comment on column public.orders.total_minor is
  'Integer PKR paisa. Backend must calculate all amounts; bigint must not be rounded through JS Number.';
create index orders_created_at_id_idx on public.orders(created_at, id);

create table public.order_items (
  order_id uuid not null references public.orders(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  product_id integer not null,
  selected_size text not null check (selected_size in ('S','M','L','XL')),
  product_name text not null check (
    char_length(btrim(product_name)) between 1 and 120
    and product_name ~ '[^[:space:]]' and product_name !~ '[[:cntrl:]]'
  ),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity > 0),
  line_total_minor bigint generated always as (unit_price_minor * quantity::bigint) stored,
  primary key (order_id, line_number),
  unique (order_id, product_id, selected_size),
  foreign key (product_id, selected_size)
    references public.product_variants(product_id, size) on delete restrict
);
create index order_items_variant_idx on public.order_items(product_id, selected_size);
comment on table public.order_items is
  'Immutable order-time name/size/price/quantity snapshots, Owner reads only. Not live catalog joins for historical values.';

create table public.order_customer_details (
  order_id uuid primary key references public.orders(id) on delete restrict,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 160 and recipient_name ~ '[^[:space:]]'),
  phone text not null check (char_length(btrim(phone)) between 3 and 40 and phone ~ '[^[:space:]]'),
  email text check (email is null or (char_length(btrim(email)) between 3 and 320 and email ~ '[^[:space:]]')),
  address_line1 text not null check (char_length(btrim(address_line1)) between 1 and 300 and address_line1 ~ '[^[:space:]]'),
  address_line2 text check (address_line2 is null or char_length(btrim(address_line2)) between 1 and 300),
  city text not null check (char_length(btrim(city)) between 1 and 120 and city ~ '[^[:space:]]'),
  region text check (region is null or char_length(btrim(region)) between 1 and 120),
  postal_code text check (postal_code is null or char_length(btrim(postal_code)) between 1 and 32),
  country_code text not null check (country_code ~ '^[A-Z]{2}$')
);
comment on table public.order_customer_details is
  'Private operational delivery/contact data. Owner only; never joined into Partner reporting. Retention policy pending.';

create table public.order_creation_keys (
  scope_id uuid not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  primary key (scope_id, key_hash)
);
comment on table public.order_creation_keys is
  'Backend-only retry identity and canonical request digest; no raw customer payload or browser read/write grants. Scope issuance pending.';

create table public.order_status_history (
  order_id uuid not null references public.orders(id) on delete restrict,
  revision bigint not null check (revision > 0),
  status_kind text not null check (status_kind in ('fulfillment','payment')),
  from_status text,
  to_status text not null,
  changed_at timestamptz not null,
  actor_user_id uuid,
  actor_db_role name not null,
  actor_session_role name not null,
  primary key (order_id, revision, status_kind),
  constraint order_history_status_values check (
    (status_kind = 'fulfillment'
      and to_status in ('pending','confirmed','packing','shipped','delivered','cancelled')
      and (from_status is null or from_status in ('pending','confirmed','packing','shipped','delivered','cancelled')))
    or (status_kind = 'payment' and to_status in ('unpaid','failed','paid','refunded')
      and (from_status is null or from_status in ('unpaid','failed','paid','refunded')))
  ),
  constraint order_history_initial_status check (
    (revision = 1 and from_status is null and
      ((status_kind = 'fulfillment' and to_status = 'pending') or (status_kind = 'payment' and to_status = 'unpaid')))
    or (revision > 1 and from_status is not null and from_status <> to_status)
  )
);
comment on column public.order_status_history.actor_user_id is
  'Derived from auth.uid(), never a caller parameter. No Auth FK: historical actor survives account deletion. NULL for DB-only actions.';
comment on column public.order_status_history.actor_db_role is
  'Effective DB role. Together with session role/verified JWT actor identifies the execution context; shared postgres is not a human identity.';

create function batool_order_internal.guard_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.fulfillment_status <> 'pending' or new.payment_status <> 'unpaid' or new.status_revision <> 1 then
      raise exception using errcode = '23514', message = 'Order must start pending and unpaid at revision 1';
    end if;
    new.created_at := transaction_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;
  if (to_jsonb(new) - array['fulfillment_status','payment_status','status_revision','updated_at'])
      is distinct from (to_jsonb(old) - array['fulfillment_status','payment_status','status_revision','updated_at']) then
    raise exception using errcode = '23514', message = 'Order identity and monetary snapshots are immutable';
  end if;
  if new.status_revision <> old.status_revision then
    raise exception using errcode = '23514', message = 'Status revision is database managed';
  end if;
  if new.fulfillment_status = old.fulfillment_status and new.payment_status = old.payment_status then
    raise exception using errcode = '23514', message = 'A status change is required';
  end if;
  if new.fulfillment_status <> old.fulfillment_status and not (
    (old.fulfillment_status = 'pending' and new.fulfillment_status in ('confirmed','cancelled')) or
    (old.fulfillment_status = 'confirmed' and new.fulfillment_status in ('packing','cancelled')) or
    (old.fulfillment_status = 'packing' and new.fulfillment_status in ('shipped','cancelled')) or
    (old.fulfillment_status = 'shipped' and new.fulfillment_status = 'delivered')
  ) then
    raise exception using errcode = '23514', message = 'Invalid fulfillment transition';
  end if;
  if new.payment_status <> old.payment_status and not (
    (old.payment_status = 'unpaid' and new.payment_status in ('paid','failed')) or
    (old.payment_status = 'failed' and new.payment_status in ('unpaid','paid')) or
    (old.payment_status = 'paid' and new.payment_status = 'refunded')
  ) then
    raise exception using errcode = '23514', message = 'Invalid payment transition';
  end if;
  new.status_revision := old.status_revision + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create function batool_order_internal.record_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history
      (order_id,revision,status_kind,from_status,to_status,changed_at,actor_user_id,actor_db_role,actor_session_role)
    values
      (new.id,1,'fulfillment',null,new.fulfillment_status,new.updated_at,auth.uid(),current_user,session_user),
      (new.id,1,'payment',null,new.payment_status,new.updated_at,auth.uid(),current_user,session_user);
  else
    if new.fulfillment_status <> old.fulfillment_status then
      insert into public.order_status_history
        (order_id,revision,status_kind,from_status,to_status,changed_at,actor_user_id,actor_db_role,actor_session_role)
      values (new.id,new.status_revision,'fulfillment',old.fulfillment_status,new.fulfillment_status,
        new.updated_at,auth.uid(),current_user,session_user);
    end if;
    if new.payment_status <> old.payment_status then
      insert into public.order_status_history
        (order_id,revision,status_kind,from_status,to_status,changed_at,actor_user_id,actor_db_role,actor_session_role)
      values (new.id,new.status_revision,'payment',old.payment_status,new.payment_status,
        new.updated_at,auth.uid(),current_user,session_user);
    end if;
  end if;
  return new;
end;
$$;

create function batool_order_internal.guard_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only insertion nested under the orders history trigger is permitted.
  -- No user role can create triggers, write orders or execute these functions.
  if tg_op <> 'INSERT' or pg_trigger_depth() <> 2 then
    raise exception using errcode = '23514', message = 'Order history is append-only and database generated';
  end if;
  return new;
end;
$$;

create function batool_order_internal.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'Order records cannot be removed or snapshots rewritten';
end;
$$;

create function batool_order_internal.check_complete_order() returns trigger
language plpgsql set search_path = '' as $$
declare target uuid; expected bigint; actual numeric; line_count bigint;
begin
  if tg_table_name = 'orders' then target := new.id; else target := new.order_id; end if;
  select subtotal_minor into expected from public.orders where id = target;
  select count(*), coalesce(sum(line_total_minor::numeric),0) into line_count,actual
    from public.order_items where order_id = target;
  if line_count = 0 or actual <> expected
    or not exists (select 1 from public.order_customer_details where order_id = target)
    or not exists (select 1 from public.order_creation_keys where order_id = target) then
    raise exception using errcode = '23514', message = 'Order requires matching items, private details and retry identity';
  end if;
  return null;
end;
$$;

create trigger orders_guard before insert or update on public.orders
for each row execute function batool_order_internal.guard_order();
create trigger orders_record_status after insert or update on public.orders
for each row execute function batool_order_internal.record_status();
create trigger orders_no_delete before delete on public.orders
for each row execute function batool_order_internal.reject_mutation();
create trigger orders_no_truncate before truncate on public.orders
for each statement execute function batool_order_internal.reject_mutation();
create trigger order_items_immutable before update or delete on public.order_items
for each row execute function batool_order_internal.reject_mutation();
create trigger order_items_no_truncate before truncate on public.order_items
for each statement execute function batool_order_internal.reject_mutation();
create trigger order_details_no_delete before delete on public.order_customer_details
for each row execute function batool_order_internal.reject_mutation();
create trigger order_details_identity before update of order_id on public.order_customer_details
for each row when (old.order_id is distinct from new.order_id)
execute function batool_order_internal.reject_mutation();
create trigger order_details_no_truncate before truncate on public.order_customer_details
for each statement execute function batool_order_internal.reject_mutation();
create trigger order_keys_immutable before update or delete on public.order_creation_keys
for each row execute function batool_order_internal.reject_mutation();
create trigger order_keys_no_truncate before truncate on public.order_creation_keys
for each statement execute function batool_order_internal.reject_mutation();
create trigger order_history_guard before insert or update or delete on public.order_status_history
for each row execute function batool_order_internal.guard_history();
create trigger order_history_no_truncate before truncate on public.order_status_history
for each statement execute function batool_order_internal.reject_mutation();

create constraint trigger orders_complete after insert or update on public.orders
deferrable initially deferred for each row execute function batool_order_internal.check_complete_order();
create constraint trigger order_items_complete after insert on public.order_items
deferrable initially deferred for each row execute function batool_order_internal.check_complete_order();
create constraint trigger order_details_complete after insert or update on public.order_customer_details
deferrable initially deferred for each row execute function batool_order_internal.check_complete_order();
create constraint trigger order_keys_complete after insert on public.order_creation_keys
deferrable initially deferred for each row execute function batool_order_internal.check_complete_order();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_customer_details enable row level security;
alter table public.order_creation_keys enable row level security;
alter table public.order_status_history enable row level security;
revoke all on public.orders, public.order_items, public.order_customer_details,
  public.order_creation_keys, public.order_status_history from public, anon, authenticated, service_role;
grant select on public.orders, public.order_items, public.order_customer_details,
  public.order_status_history to authenticated;

create policy order_reports_read on public.orders for select to authenticated using (
  (select auth.uid()) is not null
  and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
  and exists (select 1 from public.dashboard_roles r
    where r.user_id = (select auth.uid()) and r.role in ('owner','partner'))
);
create policy owner_order_items_read on public.order_items for select to authenticated using (
  (select auth.uid()) is not null
  and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
  and exists (select 1 from public.dashboard_roles r where r.user_id = (select auth.uid()) and r.role = 'owner')
);
create policy owner_order_details_read on public.order_customer_details for select to authenticated using (
  (select auth.uid()) is not null
  and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
  and exists (select 1 from public.dashboard_roles r where r.user_id = (select auth.uid()) and r.role = 'owner')
);
create policy owner_order_history_read on public.order_status_history for select to authenticated using (
  (select auth.uid()) is not null
  and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
  and exists (select 1 from public.dashboard_roles r where r.user_id = (select auth.uid()) and r.role = 'owner')
);
-- No policies/grants for retry keys, no write policies, no service-role grants.
-- Only trigger functions exist; none are a callable order-creation endpoint.
revoke all on all functions in schema batool_order_internal from public, anon, authenticated, service_role;
commit;
