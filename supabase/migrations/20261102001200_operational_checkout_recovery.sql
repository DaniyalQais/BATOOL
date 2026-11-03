-- Forward-only local preparation. No existing rows, readiness or method flags changed.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user<>'postgres' or not exists(select 1 from pg_proc
    where oid=to_regprocedure('batool_order_internal.check_complete_order()') and prosecdef)
    or to_regprocedure('public.checkout_resolve(uuid,uuid,uuid)') is null then
    raise exception 'Accepted 011 and postgres administrator required';
  end if;
end $$;

create table batool_checkout_internal.recovery_controls (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  verification_policy_ref uuid,
  check(not enabled or verification_policy_ref is not null)
);
insert into batool_checkout_internal.recovery_controls default values;

-- Backend-only escrow of an ORIGINAL retry identity, not customer/contact data.
-- No application role (including Owner/service_role) can select the raw key.
-- Capture before create; a missing mapping never permits replacement.
create table batool_checkout_internal.recovery_intents (
  quote_id uuid primary key references batool_checkout_internal.quotes(id),
  scope_id uuid not null,
  retry_key uuid not null,
  registered_at timestamptz not null default clock_timestamp(),
  unique(scope_id,retry_key)
);
create table batool_checkout_internal.recovery_cases (
  id uuid primary key,
  proof_hash text not null check(proof_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default(clock_timestamp()+interval '24 hours'),
  revision integer not null default 1,
  state text not null default 'open' check(state in ('open','verified','escalated','committed','retired')),
  original_quote uuid references batool_checkout_internal.recovery_intents(quote_id),
  original_order uuid references public.orders(id),
  verified_by uuid,
  verification_session uuid,
  policy_ref uuid,
  evidence_ref uuid,
  created_at timestamptz not null default clock_timestamp(),
  check(state not in ('verified','committed','retired') or
    (num_nonnulls(original_quote,original_order)=1 and verified_by is not null
      and verification_session is not null and policy_ref is not null and evidence_ref is not null))
);
create table batool_checkout_internal.recovery_audit (
  id bigint generated always as identity primary key,
  case_id uuid not null references batool_checkout_internal.recovery_cases(id),
  event text not null check(event in ('opened','verified','escalated','committed','retired')),
  actor uuid,
  session_id uuid,
  policy_ref uuid,
  evidence_ref uuid,
  recorded_at timestamptz not null default clock_timestamp()
);
alter table batool_checkout_internal.recovery_controls enable row level security;
alter table batool_checkout_internal.recovery_intents enable row level security;
alter table batool_checkout_internal.recovery_cases enable row level security;
alter table batool_checkout_internal.recovery_audit enable row level security;
revoke all on batool_checkout_internal.recovery_controls,batool_checkout_internal.recovery_intents,
  batool_checkout_internal.recovery_cases,batool_checkout_internal.recovery_audit from public,anon,authenticated,service_role;
revoke all on sequence batool_checkout_internal.recovery_audit_id_seq from public,anon,authenticated,service_role;

create function batool_checkout_internal.recovery_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  raise exception using errcode='42501',message='Recovery evidence is immutable';
end $$;
create trigger recovery_audit_immutable before update or delete on batool_checkout_internal.recovery_audit
  for each row execute function batool_checkout_internal.recovery_immutable();
create trigger recovery_intents_immutable before update or delete on batool_checkout_internal.recovery_intents
  for each row execute function batool_checkout_internal.recovery_immutable();

-- Stronger, live-session boundary for these NEW operational RPCs only.
-- Existing Auth/RLS policies are not silently changed by this migration.
create function batool_checkout_internal.recovery_owner() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare subject uuid:=auth.uid(); sid uuid;
begin
  if auth.role() is distinct from 'authenticated' or subject is null
    or coalesce(auth.jwt()->>'is_anonymous','false')<>'false'
    or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception using errcode='42501',message='Live Owner session required';
  end if;
  sid:=(auth.jwt()->>'session_id')::uuid;
  if not exists(select 1 from public.dashboard_roles where user_id=subject and role='owner')
    or not exists(select 1 from auth.sessions where id=sid and user_id=subject
      and (not_after is null or not_after>clock_timestamp())) then
    raise exception using errcode='42501',message='Live Owner session required';
  end if;
  return subject;
end $$;

create function public.checkout_availability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb; r batool_checkout_internal.readiness; methods jsonb:='[]';
begin
  select settings into b from public.business_settings where id;
  select * into r from batool_checkout_internal.readiness where id;
  if b is null or r.enabled is distinct from true or r.zero_tax_reviewed is distinct from true
    or not exists(select 1 from batool_checkout_internal.recovery_controls where enabled and verification_policy_ref is not null)
    or b->'shipping'->>'mode' not in ('free','flat_rate')
    or b->>'payment_instructions_state'<>'approved' or b->>'policy_state'<>'approved'
    or length(btrim(b->>'payment_instructions'))=0 or length(btrim(b->>'policy_text'))=0 then
    return jsonb_build_object('enabled',false,'methods','[]'::jsonb);
  end if;
  if r.cod_ready and (b->>'cod_enabled')::boolean then methods:=methods||'"cod"'::jsonb; end if;
  if r.easypaisa_manual_ready and (b->>'easypaisa_enabled')::boolean
    and b->>'easypaisa_account_title' is not null and b->>'easypaisa_account_number' is not null then
    methods:=methods||'"easypaisa"'::jsonb;
  end if;
  if r.jazzcash_manual_ready and (b->>'jazzcash_enabled')::boolean
    and b->>'jazzcash_account_title' is not null and b->>'jazzcash_account_number' is not null then
    methods:=methods||'"jazzcash"'::jsonb;
  end if;
  return jsonb_build_object('enabled',jsonb_array_length(methods)>0,'methods',methods);
end $$;

create function public.checkout_register_intent(p_scope uuid,p_key uuid,p_quote uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare saved batool_checkout_internal.recovery_intents;
begin
  if p_scope is null or p_key is null or p_quote is null then raise exception using errcode='PT400',message='Invalid intent'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope::text||':'||encode(sha256(convert_to(p_key::text,'UTF8')),'hex'),0));
  perform 1 from batool_checkout_internal.quotes where id=p_quote and scope_id=p_scope for update;
  if not found then raise exception using errcode='PT409',message='Intent unavailable'; end if;
  insert into batool_checkout_internal.recovery_intents(quote_id,scope_id,retry_key)
    values(p_quote,p_scope,p_key) on conflict do nothing;
  select * into saved from batool_checkout_internal.recovery_intents where quote_id=p_quote;
  if saved.scope_id is distinct from p_scope or saved.retry_key is distinct from p_key then
    raise exception using errcode='PT409',message='Intent already bound';
  end if;
  return true;
end $$;

create function public.checkout_support_open(p_case uuid,p_proof text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c batool_checkout_internal.recovery_cases;
begin
  if p_case is null or p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then raise exception using errcode='PT400',message='Invalid case'; end if;
  if not exists(select 1 from batool_checkout_internal.recovery_controls where enabled and verification_policy_ref is not null) then
    raise exception using errcode='PT503',message='Recovery unavailable';
  end if;
  insert into batool_checkout_internal.recovery_cases(id,proof_hash) values(p_case,encode(sha256(convert_to(p_proof,'UTF8')),'hex')) on conflict do nothing;
  if found then insert into batool_checkout_internal.recovery_audit(case_id,event) values(p_case,'opened'); end if;
  select * into strict c from batool_checkout_internal.recovery_cases where id=p_case;
  if c.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') or c.expires_at<=clock_timestamp() then
    raise exception using errcode='PT401',message='Case unavailable';
  end if;
  return jsonb_build_object('case_id',c.id,'state',c.state,'expires_at',c.expires_at);
end $$;

-- A narrowly projected Owner case view, never a retry credential reader.
create function public.owner_recovery_case(p_case uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c batool_checkout_internal.recovery_cases;
begin
  perform batool_checkout_internal.recovery_owner();
  select * into c from batool_checkout_internal.recovery_cases where id=p_case;
  if not found then raise exception using errcode='PT409',message='Case unavailable'; end if;
  return jsonb_build_object('case_id',c.id,'revision',c.revision,'state',c.state,'expires_at',c.expires_at,
    'original_quote',c.original_quote,'original_order',c.original_order,'evidence_ref',c.evidence_ref,
    'audit',coalesce((select jsonb_agg(jsonb_build_object('event',a.event,'recorded_at',a.recorded_at,
      'actor',a.actor,'policy_ref',a.policy_ref,'evidence_ref',a.evidence_ref) order by a.id)
      from batool_checkout_internal.recovery_audit a where a.case_id=c.id),'[]'::jsonb));
end $$;

create function public.owner_verify_recovery(p_case uuid,p_revision integer,p_decision text,
  p_quote uuid,p_order uuid,p_evidence uuid,p_independently_verified boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=batool_checkout_internal.recovery_owner(); c batool_checkout_internal.recovery_cases; policy uuid;
begin
  select verification_policy_ref into policy from batool_checkout_internal.recovery_controls where enabled;
  if policy is null then raise exception using errcode='PT503',message='Approved verification procedure required'; end if;
  select * into c from batool_checkout_internal.recovery_cases where id=p_case for update;
  if not found or c.revision is distinct from p_revision or c.state<>'open' or c.expires_at<=clock_timestamp() then
    raise exception using errcode='PT409',message='Reload current case';
  end if;
  if p_decision is null or p_decision not in ('verify','escalate') then raise exception using errcode='PT400',message='Invalid decision'; end if;
  if p_decision='verify' and (p_independently_verified is distinct from true or p_evidence is null
    or num_nonnulls(p_quote,p_order)<>1) then raise exception using errcode='PT400',message='Independent verification and exact identity required'; end if;
  -- Missing original identity ALWAYS escalates. No replacement from an empty lookup.
  if p_decision='escalate' or (p_quote is not null and not exists(select 1 from batool_checkout_internal.recovery_intents where quote_id=p_quote))
    or (p_order is not null and not exists(select 1 from public.orders where id=p_order)) then
    update batool_checkout_internal.recovery_cases set state='escalated',revision=revision+1 where id=p_case;
    insert into batool_checkout_internal.recovery_audit(case_id,event,actor,session_id,policy_ref)
      values(p_case,'escalated',actor,(auth.jwt()->>'session_id')::uuid,policy);
  else
    update batool_checkout_internal.recovery_cases set state='verified',revision=revision+1,original_quote=p_quote,original_order=p_order,
      verified_by=actor,verification_session=(auth.jwt()->>'session_id')::uuid,policy_ref=policy,evidence_ref=p_evidence where id=p_case;
    insert into batool_checkout_internal.recovery_audit(case_id,event,actor,session_id,policy_ref,evidence_ref)
      values(p_case,'verified',actor,(auth.jwt()->>'session_id')::uuid,policy,p_evidence);
  end if;
  return public.owner_recovery_case(p_case);
end $$;

create function public.owner_resolve_recovery(p_case uuid,p_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=batool_checkout_internal.recovery_owner(); c batool_checkout_internal.recovery_cases;
  i batool_checkout_internal.recovery_intents; outcome jsonb;
begin
  select * into c from batool_checkout_internal.recovery_cases where id=p_case for update;
  if not found or c.expires_at<=clock_timestamp() then raise exception using errcode='PT409',message='Case unavailable'; end if;
  -- A lost operator response is retried against the SAME case, not a new intent.
  if c.state in ('committed','retired') then return public.owner_recovery_case(p_case); end if;
  if c.revision is distinct from p_revision or c.state<>'verified'
    or not exists(select 1 from batool_checkout_internal.recovery_controls where enabled and verification_policy_ref=c.policy_ref) then
    raise exception using errcode='PT409',message='Verified current case required';
  end if;
  if c.original_order is not null then
    outcome:=jsonb_build_object('status','committed');
  else
    select * into strict i from batool_checkout_internal.recovery_intents where quote_id=c.original_quote;
    outcome:=public.checkout_resolve(i.scope_id,i.retry_key,i.quote_id);
  end if;
  if outcome->>'status' not in ('committed','retired') or outcome->>'status' is null then raise exception using errcode='PT503',message='Resolution unconfirmed'; end if;
  update batool_checkout_internal.recovery_cases set state=outcome->>'status',revision=revision+1 where id=p_case;
  insert into batool_checkout_internal.recovery_audit(case_id,event,actor,session_id,policy_ref,evidence_ref)
    values(p_case,outcome->>'status',actor,(auth.jwt()->>'session_id')::uuid,c.policy_ref,c.evidence_ref);
  return public.owner_recovery_case(p_case);
end $$;

-- Only the guest backend can exchange a browser-held case proof. Owner sees no
-- proof, original key or guest capability. Replays return the same durable outcome.
create function public.checkout_support_result(p_case uuid,p_proof text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c batool_checkout_internal.recovery_cases; i batool_checkout_internal.recovery_intents;
  outcome jsonb; receipt jsonb;
begin
  select * into c from batool_checkout_internal.recovery_cases where id=p_case;
  if not found or p_proof is null or c.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex')
    or c.expires_at<=clock_timestamp() then raise exception using errcode='PT401',message='Case unavailable'; end if;
  if not exists(select 1 from batool_checkout_internal.recovery_controls where enabled and verification_policy_ref=c.policy_ref)
    and c.state in ('committed','retired') then raise exception using errcode='PT503',message='Recovery unavailable'; end if;
  if c.state not in ('committed','retired') then return jsonb_build_object('state',c.state); end if;
  if c.original_order is not null then
    select jsonb_build_object('order_id',o.id,'quote_id',q.id,'currency',o.currency,'subtotal_minor',o.subtotal_minor::text,
      'shipping_minor',o.shipping_minor::text,'total_minor',o.total_minor::text,'payment_status',o.payment_status)
      into receipt from public.orders o join batool_checkout_internal.quotes q on q.order_id=o.id where o.id=c.original_order;
    if receipt is null then raise exception using errcode='PT409',message='Checkout order unavailable'; end if;
    return jsonb_build_object('state','committed','resolution',jsonb_build_object('status','committed','receipt',receipt));
  end if;
  select * into strict i from batool_checkout_internal.recovery_intents where quote_id=c.original_quote;
  outcome:=public.checkout_resolution(i.scope_id,i.retry_key,i.quote_id);
  if outcome is null or outcome->>'status' is distinct from c.state then raise exception using errcode='PT503',message='Resolution unconfirmed'; end if;
  return jsonb_build_object('state',c.state,'resolution',outcome,
    'scope_id',case when c.state='retired' then i.scope_id else null end);
end $$;

revoke all on function batool_checkout_internal.recovery_immutable(),batool_checkout_internal.recovery_owner() from public,anon,authenticated,service_role;
revoke all on function public.checkout_availability(),public.checkout_register_intent(uuid,uuid,uuid),
  public.checkout_support_open(uuid,text),public.checkout_support_result(uuid,text),public.owner_recovery_case(uuid),
  public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean),public.owner_resolve_recovery(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.checkout_availability(),public.checkout_register_intent(uuid,uuid,uuid),
  public.checkout_support_open(uuid,text),public.checkout_support_result(uuid,text) to service_role;
grant execute on function public.owner_recovery_case(uuid),public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean),
  public.owner_resolve_recovery(uuid,integer) to authenticated;
comment on table batool_checkout_internal.recovery_controls is 'Disabled until an administrator records an approved independent requester-verification policy reference. No invented business policy.';
comment on table batool_checkout_internal.recovery_intents is 'Restricted original retry credential escrow. Never expose through logs, Owner views or public APIs; retain for recovery.';
notify pgrst,'reload schema';
commit;
