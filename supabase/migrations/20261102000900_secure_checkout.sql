-- Prepared locally only. Does NOT enable checkout or change the public settings DTO.
-- Apply only after reviewing secure_checkout_preflight.sql. Never edit applied migrations.
begin;
set local lock_timeout = '5s';

create schema batool_checkout_internal;
revoke all on schema batool_checkout_internal from public, anon, authenticated, service_role;

-- Operational readiness is separate from Owner business preferences. No browser or
-- service-role table grants. An operator must review handling before changing gates.
create table batool_checkout_internal.readiness (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  cod_ready boolean not null default false,
  easypaisa_manual_ready boolean not null default false,
  jazzcash_manual_ready boolean not null default false,
  zero_tax_reviewed boolean not null default false
);
insert into batool_checkout_internal.readiness default values;
create table batool_checkout_internal.quotes (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null,
  cart jsonb not null,
  snapshot jsonb not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '10 minutes'),
  order_id uuid unique references public.orders(id)
);
create index checkout_quotes_scope_idx on batool_checkout_internal.quotes(scope_id);
create table batool_checkout_internal.rate_windows (
  bucket text not null,
  window_start bigint not null,
  hits integer not null,
  primary key(bucket,window_start)
);

-- Shared database limit, including a global ceiling that cannot be evaded by
-- inventing scopes/forwarded addresses. Buckets supplied only by the Edge backend.
create function public.checkout_admit(p_bucket text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare window_id bigint:=floor(extract(epoch from clock_timestamp())/60); hits integer;
begin
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into batool_checkout_internal.rate_windows values('global',window_id,1)
    on conflict(bucket,window_start) do update set hits=rate_windows.hits+1 returning rate_windows.hits into hits;
  if hits>120 then return false; end if;
  insert into batool_checkout_internal.rate_windows values(p_bucket,window_id,1)
    on conflict(bucket,window_start) do update set hits=rate_windows.hits+1 returning rate_windows.hits into hits;
  return hits<=30;
end; $$;

-- Payment/account/policy context is private operational data, never a Partner report.
create table public.order_checkout_details (
  order_id uuid primary key references public.orders(id),
  payment_method text not null check(payment_method in ('cod','easypaisa','jazzcash')),
  verification_mode text not null check(verification_mode in ('cash_on_delivery','manual_wallet')),
  shipping_mode text not null check(shipping_mode in ('free','flat_rate')),
  settings_revision integer not null check(settings_revision > 0),
  payment_instructions text not null,
  policy_text text not null,
  wallet_account_title text,
  wallet_account_number text,
  check ((payment_method='cod' and verification_mode='cash_on_delivery'
      and wallet_account_title is null and wallet_account_number is null)
    or (payment_method<>'cod' and verification_mode='manual_wallet'
      and wallet_account_title is not null and wallet_account_number is not null))
);
alter table public.order_checkout_details enable row level security;
revoke all on public.order_checkout_details from public,anon,authenticated,service_role;
grant select on public.order_checkout_details to authenticated;
create policy checkout_details_owner on public.order_checkout_details for select to authenticated
  using ((select public.batool_catalog_owner()));
create trigger checkout_details_immutable before update or delete on public.order_checkout_details
  for each row execute function batool_order_internal.reject_mutation();
create trigger checkout_details_no_truncate before truncate on public.order_checkout_details
  for each statement execute function batool_order_internal.reject_mutation();

create function batool_checkout_internal.cart(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare line jsonb; result jsonb;
begin
  if value is null or jsonb_typeof(value)<>'array' then
    raise exception using errcode='PT400',message='Invalid cart';
  end if;
  if jsonb_array_length(value) not between 1 and 30 then
    raise exception using errcode='PT400',message='Invalid cart';
  end if;
  for line in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(line)<>'object' or not(line ?& array['id','size','quantity'])
      or (select count(*) from jsonb_object_keys(line))<>3
      or jsonb_typeof(line->'id')<>'number' or (line->>'id') !~ '^[0-9]{1,9}$'
      or jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity') !~ '^[0-9]{1,2}$'
      or (line->>'quantity')::integer not between 1 and 99
      or jsonb_typeof(line->'size')<>'string' or line->>'size' not in ('S','M','L','XL') then
      raise exception using errcode='PT400',message='Invalid cart';
    end if;
  end loop;
  if (select count(distinct (x->>'id',x->>'size')) from jsonb_array_elements(value) x)<>jsonb_array_length(value) then
    raise exception using errcode='PT400',message='Duplicate cart line';
  end if;
  select jsonb_agg(x order by (x->>'id')::integer,x->>'size') into result from jsonb_array_elements(value) x;
  return result;
end; $$;

create function batool_checkout_internal.customer(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare field text; body text;
begin
  if value is null or jsonb_typeof(value)<>'object' then
    raise exception using errcode='PT400',message='Invalid delivery details';
  end if;
  if not(value ?& array['recipient_name','phone','email','address_line1','address_line2','city','region','postal_code','country_code'])
    or (select count(*) from jsonb_object_keys(value))<>9 or value->>'country_code' is distinct from 'PK' then
    raise exception using errcode='PT400',message='Invalid delivery details';
  end if;
  foreach field in array array['recipient_name','address_line1','city','address_line2','region','postal_code'] loop
    body:=value->>field;
    if value->field='null'::jsonb and field in ('address_line2','region','postal_code') then continue; end if;
    if jsonb_typeof(value->field)<>'string' or char_length(body) not between 1 and
      (case when field like 'address_line%' then 300 when field='recipient_name' then 160 when field='postal_code' then 32 else 120 end)
      or body<>btrim(body) or body !~ '[^[:space:]]' or body ~ '[[:cntrl:]]' then
      raise exception using errcode='PT400',message='Invalid delivery details';
    end if;
  end loop;
  if not batool_settings_internal.valid_phone(value->'phone') or
    (value->'email'<>'null'::jsonb and not batool_settings_internal.valid_email(value->'email')) then
    raise exception using errcode='PT400',message='Invalid delivery details';
  end if;
  return value;
end; $$;

-- Common lock order: readiness, business settings, ascending parent products,
-- then ascending variants. Parent locks precede the variant revision trigger.
create function batool_checkout_internal.snapshot(p_cart jsonb,p_method text) returns jsonb
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
    if not found or not product.active or product.archived or product.is_demo or product.currency<>'PKR' then
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

create function public.checkout_quote(p_scope uuid,p_cart jsonb,p_method text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare cart jsonb; snap jsonb; quote batool_checkout_internal.quotes;
begin
  if p_scope is null then raise exception using errcode='PT400',message='Invalid checkout scope'; end if;
  cart:=batool_checkout_internal.cart(p_cart);
  perform pg_advisory_xact_lock(hashtextextended('quote:'||p_scope::text,0));
  snap:=batool_checkout_internal.snapshot(cart,p_method);
  -- Bounded per-scope quote creation. Backend also requires abuse controls before launch.
  if (select count(*) from batool_checkout_internal.quotes where scope_id=p_scope and expires_at>clock_timestamp())>=20 then
    raise exception using errcode='PT429',message='Please wait before requesting another quote';
  end if;
  insert into batool_checkout_internal.quotes(scope_id,cart,snapshot) values(p_scope,cart,snap) returning * into quote;
  return snap || jsonb_build_object('quote_id',quote.id,'expires_at',quote.expires_at);
end; $$;

create function public.checkout_recover(p_scope uuid,p_key uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('order_id',o.id,'quote_id',q.id,'currency',o.currency,
    'subtotal_minor',o.subtotal_minor::text,'shipping_minor',o.shipping_minor::text,
    'total_minor',o.total_minor::text,'payment_status',o.payment_status)
  from public.order_creation_keys k join public.orders o on o.id=k.order_id
    join batool_checkout_internal.quotes q on q.order_id=o.id and q.scope_id=k.scope_id
  where k.scope_id=p_scope and k.key_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_key::text,'UTF8')),'hex');
$$;

create function public.checkout_create(p_scope uuid,p_key uuid,p_quote uuid,p_customer jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare customer jsonb; key_digest text; request_digest text; prior public.order_creation_keys;
  quote batool_checkout_internal.quotes; snap jsonb; v_order_id uuid:=gen_random_uuid(); line jsonb; n integer:=0;
  b public.business_settings;
begin
  if p_scope is null or p_key is null or p_quote is null then
    raise exception using errcode='PT400',message='Invalid checkout identity';
  end if;
  customer:=batool_checkout_internal.customer(p_customer);
  key_digest:=encode(sha256(convert_to(p_key::text,'UTF8')),'hex');
  request_digest:=encode(sha256(convert_to(jsonb_build_object('quote',p_quote,'customer',customer)::text,'UTF8')),'hex');
  -- Serializes concurrent retries before inspecting the key. Full digest remains
  -- the identity; advisory hash collisions merely serialize unrelated requests.
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text||':'||key_digest,0));
  select * into prior from public.order_creation_keys where scope_id=p_scope and key_hash=key_digest;
  if found then
    if prior.request_hash<>request_digest then raise exception using errcode='PT409',message='Retry details do not match'; end if;
    return public.checkout_recover(p_scope,p_key);
  end if;
  select * into quote from batool_checkout_internal.quotes where id=p_quote and scope_id=p_scope for update;
  if not found or quote.order_id is not null or quote.expires_at<=clock_timestamp() then
    raise exception using errcode='PT409',message='Quote expired or unavailable';
  end if;
  snap:=batool_checkout_internal.snapshot(quote.cart,quote.snapshot->>'payment_method');
  if snap<>quote.snapshot then raise exception using errcode='PT409',message='Prices or settings changed; review a new quote'; end if;
  select * into strict b from public.business_settings where id;
  insert into public.orders(id,currency,subtotal_minor,shipping_minor,tax_minor,discount_minor,total_minor)
    values(v_order_id,'PKR',(snap->>'subtotal_minor')::bigint,(snap->>'shipping_minor')::bigint,0,0,(snap->>'total_minor')::bigint);
  for line in select * from jsonb_array_elements(snap->'lines') loop
    n:=n+1;
    update public.product_variants set stock_quantity=stock_quantity-(line->>'quantity')::integer
      where product_id=(line->>'id')::integer and size=line->>'size';
    insert into public.order_items(order_id,line_number,product_id,selected_size,product_name,unit_price_minor,quantity)
      values(v_order_id,n,(line->>'id')::integer,line->>'size',line->>'name',(line->>'unit_price_minor')::bigint,(line->>'quantity')::integer);
  end loop;
  insert into public.order_customer_details(order_id,recipient_name,phone,email,address_line1,address_line2,city,region,postal_code,country_code)
    values(v_order_id,customer->>'recipient_name',customer->>'phone',customer->>'email',customer->>'address_line1',customer->>'address_line2',
      customer->>'city',customer->>'region',customer->>'postal_code','PK');
  insert into public.order_creation_keys(scope_id,key_hash,request_hash,order_id) values(p_scope,key_digest,request_digest,v_order_id);
  insert into public.order_checkout_details(order_id,payment_method,verification_mode,shipping_mode,settings_revision,
      payment_instructions,policy_text,wallet_account_title,wallet_account_number)
    values(v_order_id,snap->>'payment_method',case when snap->>'payment_method'='cod' then 'cash_on_delivery' else 'manual_wallet' end,
      snap->>'shipping_mode',(snap->>'settings_revision')::integer,snap->>'payment_instructions',snap->>'policy_text',
      case when snap->>'payment_method'<>'cod' then b.settings->>((snap->>'payment_method')||'_account_title') end,
      case when snap->>'payment_method'<>'cod' then b.settings->>((snap->>'payment_method')||'_account_number') end);
  update batool_checkout_internal.quotes set order_id=v_order_id where id=p_quote;
  return public.checkout_recover(p_scope,p_key);
end; $$;

revoke all on all tables in schema batool_checkout_internal from public,anon,authenticated,service_role;
revoke all on all functions in schema batool_checkout_internal from public,anon,authenticated,service_role;
revoke all on function public.checkout_admit(text),public.checkout_quote(uuid,jsonb,text),public.checkout_create(uuid,uuid,uuid,jsonb),public.checkout_recover(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.checkout_admit(text),public.checkout_quote(uuid,jsonb,text),public.checkout_create(uuid,uuid,uuid,jsonb),public.checkout_recover(uuid,uuid) to service_role;
comment on function public.checkout_create(uuid,uuid,uuid,jsonb) is
  'Trusted backend only. Atomic known-stock order, all amounts from DB. Unpaid, no automatic wallet verification. Edge must confirm in a separate committed read.';
commit;
