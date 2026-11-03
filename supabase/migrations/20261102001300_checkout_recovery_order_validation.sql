-- Forward fix only; never replay/edit accepted 001–012. No row backfill,
-- orders/stock changes, readiness changes, or enabling recovery/intake.
begin;
set local lock_timeout='5s';
do $$ begin
  if current_user<>'postgres' or current_setting('session_replication_role')<>'origin'
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean)')
      and prosecdef and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""']
      and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='6f008d62ef7f6c726b7361c29e770111')
    or not exists(select 1 from pg_proc where oid=to_regprocedure('public.owner_resolve_recovery(uuid,integer)')
      and prosecdef and pg_get_userbyid(proowner)=current_user and proconfig @> array['search_path=""']
      and md5(regexp_replace(prosrc,'[[:space:]]+','','g'))='12da8553b4b62e22f9eb7a7a697a7df0') then
    raise exception 'STOP: postgres and exact accepted 012 functions required';
  end if;
  if not(select count(*)=1 and bool_and(not enabled and not cod_ready and not easypaisa_manual_ready and not jazzcash_manual_ready and not zero_tax_reviewed) from batool_checkout_internal.readiness)
    or not(select count(*)=1 and bool_and(not enabled and verification_policy_ref is null) from batool_checkout_internal.recovery_controls) then
    raise exception 'STOP: keep checkout/payment/recovery gates closed';
  end if;
end $$;

create function batool_checkout_internal.supported_checkout_order(p_order uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.orders o
    join batool_checkout_internal.quotes q on q.order_id=o.id
    join public.order_checkout_details d on d.order_id=o.id
    join public.order_creation_keys k on k.order_id=o.id and k.scope_id=q.scope_id
    where o.id=p_order);
$$;

-- Retain exact existing attestation/revision/live-Owner checks behind wrappers.
alter function public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean) set schema batool_checkout_internal;
alter function batool_checkout_internal.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean) rename to verify_recovery_v012;
alter function public.owner_resolve_recovery(uuid,integer) set schema batool_checkout_internal;
alter function batool_checkout_internal.owner_resolve_recovery(uuid,integer) rename to resolve_recovery_v012;

create function public.owner_verify_recovery(p_case uuid,p_revision integer,p_decision text,
  p_quote uuid,p_order uuid,p_evidence uuid,p_independently_verified boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  perform batool_checkout_internal.recovery_owner();
  -- Preserve all original validation before making a new classification. This
  -- prevents an unsupported ID from bypassing attestation/identity/revision checks.
  if p_decision='verify' and p_order is not null and p_quote is null
    and p_independently_verified is true and p_evidence is not null
    and not batool_checkout_internal.supported_checkout_order(p_order) then
    return batool_checkout_internal.verify_recovery_v012(p_case,p_revision,'escalate',null,null,null,false);
  end if;
  return batool_checkout_internal.verify_recovery_v012(p_case,p_revision,p_decision,p_quote,p_order,p_evidence,p_independently_verified);
end $$;

create function public.owner_resolve_recovery(p_case uuid,p_revision integer) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=batool_checkout_internal.recovery_owner(); c batool_checkout_internal.recovery_cases;
begin
  select * into c from batool_checkout_internal.recovery_cases where id=p_case for update;
  -- Also cover cases verified/labelled committed by 012 before this fix. Repair
  -- only the support case on an authorized explicit call; never touch its order.
  if found and c.original_order is not null and c.state in ('verified','committed')
    and not batool_checkout_internal.supported_checkout_order(c.original_order) then
    if c.revision is distinct from p_revision or c.expires_at<=clock_timestamp()
      or not exists(select 1 from batool_checkout_internal.recovery_controls where enabled and verification_policy_ref=c.policy_ref) then
      raise exception using errcode='PT409',message='Verified current case required';
    end if;
    update batool_checkout_internal.recovery_cases set state='escalated',revision=revision+1 where id=p_case;
    insert into batool_checkout_internal.recovery_audit(case_id,event,actor,session_id,policy_ref,evidence_ref)
      values(p_case,'escalated',actor,(auth.jwt()->>'session_id')::uuid,c.policy_ref,c.evidence_ref);
    return public.owner_recovery_case(p_case);
  end if;
  return batool_checkout_internal.resolve_recovery_v012(p_case,p_revision);
end $$;

revoke all on function batool_checkout_internal.supported_checkout_order(uuid),
  batool_checkout_internal.verify_recovery_v012(uuid,integer,text,uuid,uuid,uuid,boolean),
  batool_checkout_internal.resolve_recovery_v012(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean),
  public.owner_resolve_recovery(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.owner_verify_recovery(uuid,integer,text,uuid,uuid,uuid,boolean),
  public.owner_resolve_recovery(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
