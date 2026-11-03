-- Local preparation only. 009 is applied and must not be replayed/edited.
-- No readiness/business settings changes, orders, stock writes or live enablement.
begin;
set local lock_timeout='5s';

create table batool_checkout_internal.intent_resolutions (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null,
  key_hash text not null check(key_hash ~ '^[0-9a-f]{64}$'),
  quote_id uuid not null unique references batool_checkout_internal.quotes(id),
  original_expires_at timestamptz not null check(isfinite(original_expires_at)),
  replacement_key uuid not null unique default gen_random_uuid(),
  replacement_quote_id uuid unique references batool_checkout_internal.quotes(id),
  closed_at timestamptz not null default clock_timestamp(),
  unique(scope_id,key_hash)
);
revoke all on batool_checkout_internal.intent_resolutions from public,anon,authenticated,service_role;

-- Preserve the tested 009 transaction body, behind a new public guard. This is
-- a forward migration; the applied file remains byte-for-byte unchanged.
alter function public.checkout_create(uuid,uuid,uuid,jsonb) set schema batool_checkout_internal;
alter function batool_checkout_internal.checkout_create(uuid,uuid,uuid,jsonb) rename to create_order_v009;
revoke all on function batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.checkout_create(p_scope uuid,p_key uuid,p_quote uuid,p_customer jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare digest text; replacement batool_checkout_internal.intent_resolutions;
begin
  if p_scope is null or p_key is null or p_quote is null then
    raise exception using errcode='PT400',message='Invalid checkout identity';
  end if;
  digest:=encode(sha256(convert_to(p_key::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text||':'||digest,0));
  -- Same lock order as resolution and the preserved creator. Taking this lock
  -- before reading retirement also covers another key attempting the same quote.
  perform 1 from batool_checkout_internal.quotes where id=p_quote and scope_id=p_scope for update;
  if not found then raise exception using errcode='PT409',message='Quote unavailable'; end if;
  if exists(select 1 from batool_checkout_internal.intent_resolutions
    where (scope_id=p_scope and key_hash=digest) or quote_id=p_quote) then
    raise exception using errcode='PT409',message='Intent closed; review its replacement';
  end if;
  if exists(select 1 from batool_checkout_internal.intent_resolutions
    where replacement_quote_id=p_quote and (scope_id<>p_scope or replacement_key<>p_key)) then
    raise exception using errcode='PT409',message='Quote bound to its replacement identity';
  end if;
  select * into replacement from batool_checkout_internal.intent_resolutions where replacement_key=p_key;
  if found and (replacement.scope_id<>p_scope or replacement.replacement_quote_id is distinct from p_quote) then
    raise exception using errcode='PT409',message='Replacement identity does not match';
  end if;
  return batool_checkout_internal.create_order_v009(p_scope,p_key,p_quote,p_customer);
end; $$;

-- Independent read after resolve: absence is NOT proof of safe restart.
-- Only a durable resolution row permits replacement. No customer data returned.
create function public.checkout_resolution(p_scope uuid,p_key uuid,p_quote uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare receipt jsonb; closed batool_checkout_internal.intent_resolutions; quote batool_checkout_internal.quotes;
begin
  if p_scope is null or p_key is null or p_quote is null then
    raise exception using errcode='PT400',message='Invalid checkout identity';
  end if;
  receipt:=public.checkout_recover(p_scope,p_key);
  if receipt is not null then
    if receipt->>'quote_id'<>p_quote::text then raise exception using errcode='PT409',message='Retry identity does not match'; end if;
    return jsonb_build_object('status','committed','receipt',receipt);
  end if;
  select * into closed from batool_checkout_internal.intent_resolutions
    where scope_id=p_scope and key_hash=encode(sha256(convert_to(p_key::text,'UTF8')),'hex');
  if not found then return null; end if;
  if closed.quote_id<>p_quote then raise exception using errcode='PT409',message='Retry identity does not match'; end if;
  if closed.replacement_quote_id is not null then
    select * into strict quote from batool_checkout_internal.quotes where id=closed.replacement_quote_id and scope_id=p_scope;
  end if;
  return jsonb_build_object('status','retired','quote_id',closed.quote_id,'resolution_id',closed.id,
    'replacement_key',closed.replacement_key,'replacement_quote',case when quote.id is null then null
      else quote.snapshot||jsonb_build_object('quote_id',quote.id,'expires_at',coalesce(
        (select original_expires_at from batool_checkout_internal.intent_resolutions where quote_id=quote.id),quote.expires_at)) end);
end; $$;

create function public.checkout_resolve(p_scope uuid,p_key uuid,p_quote uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare digest text; outcome jsonb; quote batool_checkout_internal.quotes;
begin
  if p_scope is null or p_key is null or p_quote is null then
    raise exception using errcode='PT400',message='Invalid checkout identity';
  end if;
  digest:=encode(sha256(convert_to(p_key::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text||':'||digest,0));
  outcome:=public.checkout_resolution(p_scope,p_key,p_quote);
  if outcome is not null then return outcome; end if;
  select * into quote from batool_checkout_internal.quotes where id=p_quote and scope_id=p_scope for update;
  if not found or quote.order_id is not null then
    raise exception using errcode='PT409',message='Quote unavailable or already committed';
  end if;
  if exists(select 1 from batool_checkout_internal.intent_resolutions where quote_id=p_quote) then
    raise exception using errcode='PT409',message='Quote bound to another recovery identity';
  end if;
  insert into batool_checkout_internal.intent_resolutions(scope_id,key_hash,quote_id,original_expires_at) values(p_scope,digest,p_quote,quote.expires_at);
  -- Durable invalidation also prevents stale-snapshot/older creator execution
  -- from treating this as a live quote. Never touch a consumed quote/order.
  update batool_checkout_internal.quotes set expires_at='-infinity'::timestamptz where id=p_quote;
  return public.checkout_resolution(p_scope,p_key,p_quote);
end; $$;

create function public.checkout_replacement_quote(p_scope uuid,p_resolution uuid,p_cart jsonb,p_method text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare closed batool_checkout_internal.intent_resolutions; quote batool_checkout_internal.quotes; result jsonb;
begin
  if p_scope is null or p_resolution is null then raise exception using errcode='PT400',message='Invalid recovery identity'; end if;
  perform batool_checkout_internal.cart(p_cart);
  if p_method is null or p_method not in ('cod','easypaisa','jazzcash') then
    raise exception using errcode='PT400',message='Invalid payment method';
  end if;
  select * into closed from batool_checkout_internal.intent_resolutions where id=p_resolution and scope_id=p_scope;
  if not found then raise exception using errcode='PT409',message='Recovery unavailable'; end if;
  -- One replacement key AND one bound quote per resolution, including requests
  -- from two tabs or a retry whose previous HTTP response was lost.
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text||':'||encode(sha256(convert_to(closed.replacement_key::text,'UTF8')),'hex'),0));
  select * into strict closed from batool_checkout_internal.intent_resolutions where id=p_resolution and scope_id=p_scope for update;
  if closed.replacement_quote_id is not null then
    select * into strict quote from batool_checkout_internal.quotes where id=closed.replacement_quote_id and scope_id=p_scope;
    -- Keep the original DTO recoverable even when a second tab has since
    -- closed this successor. The create guard still rejects its retired ID;
    -- the client can resolve that exact successor and follow the same chain.
    return quote.snapshot||jsonb_build_object('quote_id',quote.id,'expires_at',coalesce(
      (select original_expires_at from batool_checkout_internal.intent_resolutions where quote_id=quote.id),quote.expires_at));
  end if;
  result:=public.checkout_quote(p_scope,p_cart,p_method);
  update batool_checkout_internal.intent_resolutions set replacement_quote_id=(result->>'quote_id')::uuid where id=p_resolution;
  return result;
end; $$;

revoke all on function public.checkout_create(uuid,uuid,uuid,jsonb),public.checkout_resolution(uuid,uuid,uuid),
  public.checkout_resolve(uuid,uuid,uuid),public.checkout_replacement_quote(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.checkout_create(uuid,uuid,uuid,jsonb),public.checkout_resolution(uuid,uuid,uuid),
  public.checkout_resolve(uuid,uuid,uuid),public.checkout_replacement_quote(uuid,uuid,jsonb,text) to service_role;
comment on table batool_checkout_internal.intent_resolutions is
  'Backend-only permanent retirement identity and one replacement key/quote. Preserve records required by retry/recovery. No orders cancelled or payments verified.';
commit;
