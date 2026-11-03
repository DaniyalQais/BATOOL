-- LOCAL PREPARATION ONLY. Run business_settings_preflight.sql before review/application.
-- No order creation, payment verification, notification delivery, or role assignments.
begin;
set local lock_timeout = '5s';

create schema batool_settings_internal;
revoke all on schema batool_settings_internal from public, anon, authenticated, service_role;

create function batool_settings_internal.valid_email(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'string'
    and char_length(value #>> '{}') <= 254
    and (value #>> '{}') !~ '[[:cntrl:]]'
    and (value #>> '{}') ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$', false);
$$;
create function batool_settings_internal.valid_phone(value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^92[0-9]{10}$', false);
$$;
create function batool_settings_internal.valid_shipping(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare fee numeric;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not(value ?& array['country_code','currency','mode','fee_minor'])
    or (select count(*) from jsonb_object_keys(value)) <> 4
    or value->>'country_code' is distinct from 'PK' or value->>'currency' is distinct from 'PKR'
    or jsonb_typeof(value->'mode') <> 'string' then return false; end if;
  if value->>'mode'='unconfigured' then return value->'fee_minor'='null'::jsonb; end if;
  if value->>'mode' not in ('free','flat_rate') or jsonb_typeof(value->'fee_minor') <> 'number' then return false; end if;
  fee := (value->>'fee_minor')::numeric;
  return fee between 0 and 2147483647 and fee=trunc(fee)
    and (value->>'mode'='flat_rate' or fee=0);
end;
$$;
create function batool_settings_internal.valid_business(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare provider text; field text; title text; number_text text; body text; state text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not (value ?& array['public_whatsapp','support_email','cod_enabled',
    'easypaisa_enabled','easypaisa_account_title','easypaisa_account_number',
    'jazzcash_enabled','jazzcash_account_title','jazzcash_account_number',
    'shipping','payment_instructions','payment_instructions_state','policy_text','policy_state'])
    or (select count(*) from jsonb_object_keys(value)) <> 14 then return false; end if;
  if value->'public_whatsapp' <> 'null'::jsonb and not batool_settings_internal.valid_phone(value->'public_whatsapp') then return false; end if;
  if value->'support_email' <> 'null'::jsonb and not batool_settings_internal.valid_email(value->'support_email') then return false; end if;
  if not batool_settings_internal.valid_shipping(value->'shipping')
    or jsonb_typeof(value->'cod_enabled') <> 'boolean' then return false; end if;
  foreach provider in array array['easypaisa','jazzcash'] loop
    if jsonb_typeof(value->(provider||'_enabled')) <> 'boolean' then return false; end if;
    field := provider||'_account_title'; title := value->>field;
    if value->field <> 'null'::jsonb and (jsonb_typeof(value->field) <> 'string'
      or char_length(title) not between 1 and 120 or title <> btrim(title)
      or title !~ '[^[:space:]]' or title ~ '[[:cntrl:]]') then return false; end if;
    field := provider||'_account_number'; number_text := value->>field;
    if value->field <> 'null'::jsonb and (jsonb_typeof(value->field) <> 'string'
      or number_text !~ '^[0-9]{7,24}$') then return false; end if;
    if (value->>(provider||'_enabled'))::boolean and (title is null or number_text is null) then return false; end if;
  end loop;
  foreach field in array array['payment_instructions','policy_text'] loop
    body := value->>field;
    state := value->>(case when field='policy_text' then 'policy_state' else 'payment_instructions_state' end);
    if jsonb_typeof(value->field) <> 'string' or body is null or char_length(body) > 8000
      or body <> btrim(body, E' \t\n\r') or translate(body,E'\n\r\t','') ~ '[[:cntrl:]]'
      or state is null or state not in ('draft','approved')
      or (state='approved' and body !~ '[^[:space:]]') then return false; end if;
    if jsonb_typeof(value->(case when field='policy_text' then 'policy_state' else 'payment_instructions_state' end)) <> 'string' then return false; end if;
  end loop;
  return true;
end;
$$;
create function batool_settings_internal.valid_notifications(value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare channel text; recipient jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not(value ?& array['emails','whatsapp_numbers']) or (select count(*) from jsonb_object_keys(value)) <> 2 then return false; end if;
  foreach channel in array array['emails','whatsapp_numbers'] loop
    if jsonb_typeof(value->channel) <> 'array' then return false; end if;
    if jsonb_array_length(value->channel) > 10 then return false; end if;
    for recipient in select v from jsonb_array_elements(value->channel) as items(v) loop
      if (channel='emails' and not batool_settings_internal.valid_email(recipient))
        or (channel='whatsapp_numbers' and not batool_settings_internal.valid_phone(recipient)) then return false; end if;
    end loop;
    if (select count(*) <> count(distinct lower(v)) from jsonb_array_elements_text(value->channel) as items(v)) then return false; end if;
  end loop;
  return true;
end;
$$;

create table public.business_settings (
  id boolean primary key default true check (id),
  revision integer not null default 1 check (revision > 0),
  settings jsonb not null check (batool_settings_internal.valid_business(settings)),
  updated_at timestamptz not null default transaction_timestamp(),
  updated_by uuid
);
create table public.order_notification_settings (
  id boolean primary key default true check (id),
  revision integer not null default 1 check (revision > 0),
  settings jsonb not null check (batool_settings_internal.valid_notifications(settings)),
  updated_at timestamptz not null default transaction_timestamp(),
  updated_by uuid
);
comment on table public.business_settings is 'Owner-managed configuration. Raw data is Owner only. Public consumers must use get_public_business_settings() allowlist.';
comment on table public.order_notification_settings is 'Private operational recipients, separate from public contacts. No notification delivery is implemented.';
insert into public.business_settings(settings) values ('{
  "public_whatsapp":null,"support_email":null,"cod_enabled":false,
  "easypaisa_enabled":false,"easypaisa_account_title":null,"easypaisa_account_number":null,
  "jazzcash_enabled":false,"jazzcash_account_title":null,"jazzcash_account_number":null,
  "shipping":{"country_code":"PK","currency":"PKR","mode":"unconfigured","fee_minor":null},
  "payment_instructions":"","payment_instructions_state":"draft","policy_text":"","policy_state":"draft"
}');
insert into public.order_notification_settings(settings) values ('{"emails":[],"whatsapp_numbers":[]}');

-- Future order creation must read trusted settings in its transaction, reject
-- unconfigured shipping, calculate the fee and snapshot it here. No order-creation
-- RPC is introduced. Existing order monetary snapshots/guard remain unchanged.
comment on column public.orders.shipping_minor is
  'Immutable order-time charged shipping in PKR paisa. Future backend must calculate from trusted Owner shipping settings, reject unconfigured shipping, and snapshot the charge. Later settings changes never recalculate existing orders.';

create function batool_settings_internal.revise() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then raise exception using errcode='23514',message='Settings identity is immutable'; end if;
  new.revision := old.revision + 1;
  new.updated_at := statement_timestamp();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger business_settings_revision before update on public.business_settings
for each row execute function batool_settings_internal.revise();
create trigger notification_settings_revision before update on public.order_notification_settings
for each row execute function batool_settings_internal.revise();

alter table public.business_settings enable row level security;
alter table public.order_notification_settings enable row level security;
revoke all on public.business_settings, public.order_notification_settings from public, anon, authenticated, service_role;
grant select on public.business_settings, public.order_notification_settings to authenticated;
create policy business_settings_owner_read on public.business_settings for select to authenticated
using (public.batool_catalog_owner());
create policy notification_settings_owner_read on public.order_notification_settings for select to authenticated
using (public.batool_catalog_owner());

create function batool_settings_internal.require_owner() returns void
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception using errcode='42501',message='Owner access required';
  end if;
  -- Serialize against role demotion; user metadata never authorizes writes.
  perform 1 from public.dashboard_roles where user_id=auth.uid() and role='owner' for share;
  if not found then raise exception using errcode='42501',message='Owner access required'; end if;
end;
$$;
create function public.owner_save_business_settings(p_expected_revision integer, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
begin
  perform batool_settings_internal.require_owner();
  if p_expected_revision is null or p_expected_revision < 1 or not batool_settings_internal.valid_business(p_settings) then
    raise exception using errcode='22023',message='Invalid business settings';
  end if;
  select revision into current_revision from public.business_settings where id=true for update;
  if not found then raise exception using errcode='PT404',message='Settings not initialized'; end if;
  if current_revision <> p_expected_revision then raise exception using errcode='PT409',message='Settings changed; reload before saving'; end if;
  update public.business_settings set settings=p_settings where id=true
    returning jsonb_build_object('revision',revision,'settings',settings) into result;
  return result;
end;
$$;
create function public.owner_save_notification_settings(p_expected_revision integer, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_revision integer; result jsonb;
begin
  perform batool_settings_internal.require_owner();
  if p_expected_revision is null or p_expected_revision < 1 or not batool_settings_internal.valid_notifications(p_settings) then
    raise exception using errcode='22023',message='Invalid notification settings';
  end if;
  select revision into current_revision from public.order_notification_settings where id=true for update;
  if not found then raise exception using errcode='PT404',message='Settings not initialized'; end if;
  if current_revision <> p_expected_revision then raise exception using errcode='PT409',message='Settings changed; reload before saving'; end if;
  update public.order_notification_settings set settings=p_settings where id=true
    returning jsonb_build_object('revision',revision,'settings',settings) into result;
  return result;
end;
$$;
create function public.get_public_business_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public_whatsapp',settings->'public_whatsapp','support_email',settings->'support_email',
    'currency','PKR','stock_model','ready_stock','shipping',settings->'shipping',
    'payment_instructions',case when settings->>'payment_instructions_state'='approved' then settings->'payment_instructions' else 'null'::jsonb end,
    'policy_text',case when settings->>'policy_state'='approved' then settings->'policy_text' else 'null'::jsonb end,
    -- Backend order creation/handling is absent. Owner enabled flags express intent
    -- only; wallet details, flags and recipients never cross this public boundary.
    'checkout_enabled',false,'available_payment_methods','[]'::jsonb)
  from public.business_settings where id=true;
$$;
revoke all on all functions in schema batool_settings_internal from public, anon, authenticated, service_role;
revoke all on function public.owner_save_business_settings(integer,jsonb),
  public.owner_save_notification_settings(integer,jsonb),public.get_public_business_settings() from public, anon, authenticated, service_role;
grant execute on function public.owner_save_business_settings(integer,jsonb),public.owner_save_notification_settings(integer,jsonb) to authenticated;
grant execute on function public.get_public_business_settings() to anon, authenticated;
commit;
