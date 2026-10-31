-- PREPARED ONLY. Run as database owner AFTER project/conflict review and migration.
-- Synthetic Auth rows have no credentials; all fixture rows are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'batool-owner-rls@example.invalid', '{}'),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'batool-partner-rls@example.invalid', '{}'),
  ('00000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'batool-unassigned-rls@example.invalid', '{"role":"owner"}');
insert into public.dashboard_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000000101', 'owner'),
  ('00000000-0000-4000-8000-000000000102', 'partner');

-- Anonymous clients cannot read roles or mutate the allowlist.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform * from public.dashboard_roles;
    raise exception 'FAIL: anonymous dashboard read allowed';
  exception when insufficient_privilege then null; end;
  if has_table_privilege(current_user, 'public.dashboard_roles', 'INSERT') or
     has_table_privilege(current_user, 'public.dashboard_roles', 'UPDATE') or
     has_table_privilege(current_user, 'public.dashboard_roles', 'DELETE') then
    raise exception 'FAIL: anonymous role writes granted';
  end if;
  if has_table_privilege(current_user, 'public.products', 'INSERT') or
     has_table_privilege(current_user, 'public.products', 'UPDATE') or
     has_table_privilege(current_user, 'public.products', 'DELETE') or
     has_table_privilege(current_user, 'public.product_variants', 'INSERT') or
     has_table_privilege(current_user, 'public.product_variants', 'UPDATE') or
     has_table_privilege(current_user, 'public.product_variants', 'DELETE') then
    raise exception 'FAIL: anonymous catalog writes granted';
  end if;
  -- This SELECT must continue to work; active filtering is covered by catalog_rls.sql.
  perform id from public.products limit 1;
  perform product_id from public.product_variants limit 1;
end;
$$;
reset role;

-- Both roles read only their own assignment. Neither can mutate any assignment.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","is_anonymous":false}', true);
do $$
declare subject text; expected text; statement text;
begin
  foreach subject in array array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', subject, 'role', 'authenticated', 'is_anonymous', false)::text, true);
    expected := case when right(subject, 3) = '101' then 'owner' else 'partner' end;
    if (select count(*) from public.dashboard_roles) <> 1 or
       (select role from public.dashboard_roles where user_id = auth.uid()) is distinct from expected then
      raise exception 'FAIL: assigned role self-read/isolation';
    end if;
    foreach statement in array array[
      'insert into public.dashboard_roles (user_id, role) values (''00000000-0000-4000-8000-000000000103'', ''owner'')',
      'update public.dashboard_roles set role = ''owner'' where user_id = auth.uid()',
      'delete from public.dashboard_roles where user_id = auth.uid()'
    ] loop
      begin
        execute statement;
        raise exception 'FAIL: assigned account can change roles';
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
  if has_table_privilege(current_user, 'public.products', 'INSERT') or
     has_table_privilege(current_user, 'public.products', 'UPDATE') or
     has_table_privilege(current_user, 'public.products', 'DELETE') or
     has_table_privilege(current_user, 'public.product_variants', 'INSERT') or
     has_table_privilege(current_user, 'public.product_variants', 'UPDATE') or
     has_table_privilege(current_user, 'public.product_variants', 'DELETE') then
    raise exception 'FAIL: authenticated catalog writes granted';
  end if;
end;
$$;

-- Authenticated but unassigned: spoofed user metadata must not grant a role.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000103","role":"authenticated","user_metadata":{"role":"owner"},"is_anonymous":false}', true);
do $$
begin
  if exists (select 1 from public.dashboard_roles) then raise exception 'FAIL: unassigned role read'; end if;
  begin
    insert into public.dashboard_roles (user_id, role) values (auth.uid(), 'owner');
    raise exception 'FAIL: self-provisioning allowed';
  exception when insufficient_privilege then null; end;
end;
$$;

-- Even a mapping does not admit a Supabase anonymous-auth session.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","is_anonymous":true}', true);
do $$
begin
  if exists (select 1 from public.dashboard_roles) then raise exception 'FAIL: anonymous-auth role read'; end if;
end;
$$;
reset role;

-- Revoking a mapping takes effect without trusting a previously issued role claim.
delete from public.dashboard_roles where user_id = '00000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated","is_anonymous":false}', true);
do $$
begin
  if exists (select 1 from public.dashboard_roles) then raise exception 'FAIL: revoked role read'; end if;
end;
$$;
reset role;
rollback;
