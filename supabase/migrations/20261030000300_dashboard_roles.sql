begin;

-- No default role, signup trigger, metadata-derived role, or automatic assignments.
-- Assignment/revocation is a trusted database-administrator operation only.
create table public.dashboard_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.dashboard_roles is
  'Explicit dashboard allowlist. Application users, including owners, cannot assign roles.';

alter table public.dashboard_roles enable row level security;
revoke all on table public.dashboard_roles from public, anon, authenticated;
grant select on table public.dashboard_roles to authenticated;
create policy dashboard_role_read_self on public.dashboard_roles
for select to authenticated using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true'
);

-- Existing trigger function changes only NEW.updated_at; it grants no table access.
create trigger dashboard_roles_updated_at before update on public.dashboard_roles
for each row execute function public.batool_catalog_updated_at();

-- Deliberately no changes to catalog grants/policies and no role assignments.
-- Future order/product permissions require their own reviewed migrations.
commit;
