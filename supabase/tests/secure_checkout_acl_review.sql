-- Focused READ-ONLY follow-up for CSV (34), preflight row 04 REVIEW.
-- No migration, setting change, order, fixture or private-value read.
begin transaction isolation level repeatable read, read only;
set local statement_timeout='30s';
with flagged as (
  -- Same flagged population as the original preflight. Identify the creator;
  -- another creator's defaults do not apply to objects created as postgres.
  select d.defaclrole as creator_oid,pg_get_userbyid(d.defaclrole) as creator,
    case when d.defaclnamespace=0 then '(global)' else n.nspname end as scope,
    case d.defaclobjtype when 'r' then 'tables' when 'f' then 'functions'
      when 'S' then 'sequences' when 'T' then 'types' when 'n' then 'schemas'
      when 'L' then 'large objects' else d.defaclobjtype::text end as object_type,
    pg_get_userbyid(a.grantee) as grantee,a.privilege_type,a.is_grantable,
    d.defaclrole=(select oid from pg_roles where rolname=current_user) as current_creator
  from pg_default_acl d
  left join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace in (0,'public'::regnamespace)
    and a.grantee<>d.defaclrole and a.grantee<>0
    and a.grantee not in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))
), checks(label,expected,result) as (
  select '00 context','PASS: postgres; read-only; repeatable read; replication origin',
    case when current_user='postgres' and current_setting('transaction_read_only')='on'
      and current_setting('transaction_isolation')='repeatable read'
      and current_setting('session_replication_role')='origin' then 'PASS' else 'STOP' end
  union all select '01 flagged default grants','REVIEW METADATA: identify creator, grantee and scope; no private values',
    coalesce((select jsonb_agg(jsonb_build_object('creator',creator,'scope',scope,
      'object_type',object_type,'grantee',grantee,'privilege',privilege_type,
      'grantable',is_grantable,'applies_to_current_creator',current_creator)
      order by creator,scope,object_type,grantee,privilege_type) from flagged),'[]'::jsonb)::text
  union all select '02 current-creator resolution','PASS: no flagged custom-recipient defaults for creator postgres; otherwise REVIEW',
    case when current_user<>'postgres' then 'STOP'
      when exists(select 1 from flagged where current_creator) then 'REVIEW' else 'PASS' end
)
select * from checks order by label;
rollback;
