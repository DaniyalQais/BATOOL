# BATOOL authentication and role foundation

The next prepared feature is [Owner main-image uploads](owner-product-images.md). Migration 005 is user-applied and its post-migration configuration checks passed; hosted validation and actual uploads remain unverified. It reuses the protected role mapping and does not change account provisioning or role-assignment permissions.

## Scope and current status

The user confirmed the dashboard-role migration, initial account creation, and subsequent Owner product-editing migration 004 were applied manually. No accounts, role assignments or emails have been created/sent by the agent. Shared SQL results, user-reported Owner browser checks, and user-executed Partner/unassigned RPC denial passes are recorded in [the authorization verification guide](product-editing-authorization-checks.md). The user confirmed temporary-account deletion and a clear read-only cleanup check preserving the original Auth user with Owner role. These are user-supplied remote results, distinct from automated local tests; other acceptance checks remain unverified unless explicitly recorded there.

Routes: `/admin/login/`, `/admin/`, `/admin/reset-password/`. The dashboard displays the verified account email and assigned role, with Owner-only editing of the six existing products described in [owner-product-editing.md](owner-product-editing.md). There are no orders, reports, metrics, commission/settlement features or checkout changes.

| Role | Intended future scope | Permissions granted now |
| --- | --- | --- |
| `owner` | Initially the setup operator; later the client: future product and order management | Read own role assignment; Owner catalog edits only after migration 004 |
| `partner` | Partner: future read access to order amounts, statuses and reports | Read own role assignment only |

Neither role can assign/revoke roles. Direct catalog writes remain denied; migration 004 adds only an explicitly checked Owner save RPC. Every account must be explicitly created and assigned a role. Signing in, email domain, user metadata, UUID ordering and being the first user grant no authorization.

## Static hosting and public configuration

Keep `output: "export"`. Vercel serves `out/`; no Next.js server, middleware, Server Actions, callback API or server cookies are required. The static admin shell is public HTML, containing no protected dashboard data. It is not an access boundary: database grants/RLS deny data access even if someone bypasses the UI. The pages are marked noindex with a no-referrer policy. Future data tables must have their own reviewed database policies before features are added.

Continue configuring `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env.local` and the Vercel **build environment**, as for the catalog. Keep `CATALOG_SOURCE=supabase` for the actual catalog build. Next configuration validates that the URL is an HTTPS origin and the key begins with `sb_publishable_`, then explicitly exposes only those two public values as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No other environment values are forwarded. The same Supabase project is used for Auth and the catalog; no extra dependency or duplicate browser-key setting is required.

The publishable key and Auth SDK now intentionally appear in admin browser bundles. They are not elevated credentials. Secret/service-role keys and database passwords must never be placed in these variables, source code, docs, browser bundles or logs. The anonymous build-time catalog client remains separate and never receives browser sessions. `.env.local` is ignored; `.env.example` contains placeholders. Rebuild after changing public configuration. `CATALOG_SOURCE=demo` changes only catalog content and never grants admin access.

For future cPanel hosting, confirm HTTPS and ordinary static directory-index serving first. These routes export to `out/admin/index.html`, `out/admin/login/index.html` and `out/admin/reset-password/index.html`. No architecture change has been made or assumed for cPanel.

## Review and apply the new migration later

Migrations 001 through 004 have been reported applied manually; do not edit or rerun them. The following describes the original role-migration review workflow for new environments. Confirm the intended project reference against the local project URL without printing credentials. In SQL Editor, check conflicts with read-only queries:

```sql
select to_regclass('public.dashboard_roles');
select * from pg_policies
where schemaname = 'public' and tablename = 'dashboard_roles';
select tgname from pg_trigger
where tgrelid = to_regclass('public.dashboard_roles') and not tgisinternal;
```

If names/data/policies already exist, stop and reconcile before applying. Otherwise, review and run the **entire** new migration once in the confirmed project's SQL Editor as the database owner. It creates a protected `dashboard_roles` mapping referencing `auth.users`, with one checked role per user, timestamps and RLS. `authenticated` may SELECT only its own mapping; `anon` has no access. No application identity has INSERT/UPDATE/DELETE privileges, including accounts assigned `owner`. Anonymous-auth identities are excluded. No role rows or catalog grants are created. If using the CLI later, reconcile migration history for manually applied SQL before any `db push`; do not blindly replay/repair migrations.

## Provisioning and client handover through trusted administration

This is a documented future workflow, not an instruction to create accounts or send invitations now. The setup operator will initially use their personal email as Owner. Later the client will receive an invitation at their own verified email, become Owner, and verify access before the operator's existing account becomes Partner. Emails are supplied privately at execution time and are never hardcoded into source, migrations or examples. Reuse the operator's existing Auth UUID during handover; do not create a second operator account or change their email to the client's email.

| Stage | Setup operator's account | Client's account |
| --- | --- | --- |
| Initial setup | Explicitly provisioned as Owner | Not yet provisioned |
| Client onboarding | Remains Owner | Invited, explicitly assigned Owner, access being verified |
| Verified handover | Same account changed to Partner | Remains Owner |

### Initial setup: personal account as the first Owner

1. Confirm the intended Supabase project, apply the pending role migration only after conflict review, and configure the hosting variables and allowed Auth redirects. In Auth configuration, **disable Allow new users to sign up**, enable email/password login, and disable anonymous sign-ins and unused providers. No registration UI or frontend signup/provisioning method is provided.
2. A trusted Supabase administrator explicitly creates the operator's personal email/password account through **Authentication ? Users ? Add user/Create user**, after verifying the intended email and its ownership privately. Do not create placeholder accounts. Choose a strong unique password and deliver it privately; never place passwords, administrative keys or invitation links in SQL files, chat, source control or logs.
3. Copy the actual Auth UUID from the dashboard. In SQL Editor as the database owner, verify that UUID corresponds to the intended personal email and confirmed account. Then assign Owner explicitly, replacing the placeholder first:

   ```sql
   select id, email, email_confirmed_at from auth.users
   where id = 'SETUP_OPERATOR_AUTH_USER_UUID'::uuid;

   begin;
   insert into public.dashboard_roles (user_id, role)
   values ('SETUP_OPERATOR_AUTH_USER_UUID'::uuid, 'owner');
   commit;
   ```

4. Verify a fresh email/password login at `/admin/login/`, the displayed Owner role at `/admin/`, logout and password recovery. Being the first account grants nothing automatically. Application Owner cannot assign roles or manage orders. Product editing requires the separately reviewed migration 004.

### Client onboarding: invitation and explicit Owner assignment

1. Confirm the client's own email privately. Keep the operator as Owner throughout onboarding. Using a trusted Supabase administrator workflow, invite that email through Auth Users or an approved administrator-only invitation tool. The app never sends invitations or calls an administrative Auth API. If the account already exists, inspect the intended identity and its status instead of creating a duplicate or changing somebody else's email.
2. Before sending, configure an exact allowed invitation redirect to `https://YOUR_CANONICAL_HOST/admin/login/` in addition to the recovery URL below. Use a trusted workflow that can set that redirect explicitly; the administrative `inviteUserByEmail` operation supports `redirectTo`. If a dashboard/tool cannot select it, arrange the correct redirect through a trusted administrative workflow before sending. Do not assume the storefront root consumes Auth tokens. Keep elevated credentials outside the frontend and repository; this documentation introduces no administrative client, key example or invitation automation. See [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) and [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
3. After the invitation creates the Auth identity, inspect its UUID/email correspondence in Auth Users or SQL Editor. As the database owner, separately insert the explicit role mapping; an invitation or its metadata must never assign a role:

   ```sql
   select id, email, email_confirmed_at from auth.users
   where id = 'CLIENT_AUTH_USER_UUID'::uuid;

   begin;
   insert into public.dashboard_roles (user_id, role)
   values ('CLIENT_AUTH_USER_UUID'::uuid, 'owner');
   commit;
   ```

   Use plain INSERT so conflicting assignments fail instead of silently overwriting roles. If an assignment already exists, stop and review it. An accepted invite without a mapping must still be denied dashboard data.
4. The client accepts their own invitation. The current app can initialize the invitation session at the login route, but the dedicated password form accepts **recovery** links, not invitation links. Do not point an invitation at `/admin/reset-password/` or claim it sets an initial password. For a passwordless invited account, have the client sign out of the invitation session, use **Forgot your password?** at the login page, follow the recovery email, and set their own password with the existing recovery form. No password or invitation/recovery token is shared with the operator. Confirm SMTP, invite/recovery templates and redirect behavior before onboarding; real invitation acceptance remains an end-to-end acceptance check.
5. **Handover checkpoint:** verify the client's confirmed identity, fresh email/password login in a separate browser session, displayed Owner role, logout and recovery path. Record the client's confirmation privately. Merely sending/accepting an invite or seeing a role row does not establish working access. Until these checks succeed, leave the operator as Owner. Resolve failed/expired invitations through the trusted administrator workflow without removing the working Owner.

### After verified client access: change the operator to Partner

Only after the checkpoint above, a trusted database administrator changes the operator's mapping by its existing verified UUID. Do not expose this operation in the application, even to Owner. This guarded example locks the client's confirmed Owner mapping, rejects identical UUIDs and requires the operator's current mapping to be Owner. It cannot prove the human access checkpoint; the administrator must complete that first. Replace both placeholders before running:

```sql
begin;
do $$
declare
  operator_id uuid := 'SETUP_OPERATOR_AUTH_USER_UUID'::uuid;
  client_id uuid := 'CLIENT_AUTH_USER_UUID'::uuid;
begin
  if operator_id = client_id then
    raise exception 'Operator and client must be different accounts';
  end if;

  perform 1 from public.dashboard_roles r
  join auth.users u on u.id = r.user_id
  where r.user_id = client_id and r.role = 'owner'
    and u.email_confirmed_at is not null
  for update of r;
  if not found then
    raise exception 'Verified client Owner mapping is required before handover';
  end if;

  update public.dashboard_roles set role = 'partner'
  where user_id = operator_id and role = 'owner';
  if not found then
    raise exception 'Expected operator Owner mapping was not found';
  end if;
end;
$$;
commit;
```

Verify the two final mappings in the trusted SQL Editor, targeting only the confirmed UUIDs:

```sql
select r.user_id, u.email, r.role from public.dashboard_roles r
join auth.users u on u.id = r.user_id
where r.user_id in (
  'SETUP_OPERATOR_AUTH_USER_UUID'::uuid,
  'CLIENT_AUTH_USER_UUID'::uuid
);
```

Expect client = Owner and operator = Partner. Have both users sign out and sign in again (or explicitly recheck access) and verify the displayed roles. A role change does not itself revoke Auth sessions. Database queries must use the live mapping; the UI may show the previous role until its next access check. If any step fails, stop and have the trusted administrator inspect the transaction result and actual mappings; do not retry broad updates or delete the client's working access.

Partner is intended for **read-only future order amounts, statuses and reports**, without order/product editing or commission/settlement features. Neither order data nor report access exists yet: Partner currently reads only its own role assignment; Owner product editing additionally requires migration 004. Future read permissions must be added through reviewed database policies, never inferred from this handover or implemented solely by hiding UI.

### Administrative boundary and revocation

The personal email and client email identify Auth accounts, not administrative credentials. An application Owner role does not grant Supabase Dashboard/SQL Editor or Vercel organization access. Review infrastructure ownership/access separately during the real handover; do not assume changing an app role transfers or revokes those privileges.

Application users cannot INSERT, UPDATE or DELETE role assignments, including their own. Only a trusted database administrator can assign/change/revoke them. To revoke access, delete the specific mapping by verified UUID through that trusted workflow. Future automation, if required, must remain separately secured; no elevated key or administrative operation is added to the browser.

Database authorization changes take effect on subsequent queries. The UI rechecks on focus, visibility, token refresh, session expiry and explicit refresh; its currently displayed role may remain visible until rechecked. Future sensitive table policies must consult the live protected mapping, not a role cached in a token. Disable/ban an Auth account and revoke its sessions when appropriate; signing out locally is not a global session revocation and issued access tokens can remain valid until expiry.

## Password recovery and redirects

Browser-only implicit recovery works with the static export. Set the Auth **Site URL** to the canonical HTTPS Vercel/custom-domain origin. Under **URL Configuration → Redirect URLs**, add the exact allowed invitation and recovery URLs, including the trailing slash:

```text
https://YOUR_CANONICAL_HOST/admin/login/
https://YOUR_CANONICAL_HOST/admin/reset-password/
http://localhost:3000/admin/login/
http://localhost:3000/admin/reset-password/
```

Add explicit preview origins only when they are trusted and needed; avoid broad production wildcard redirects. The app builds its recovery URL from the current origin plus a fixed path; it accepts no arbitrary `next` URL. Keep the standard recovery email template using Supabase's confirmation URL, so the SDK can consume the implicit `#access_token=...&type=recovery` response. Configure SMTP/email delivery and rate limits with Supabase before testing; this work sends no recovery emails.

Forgot password shows a generic account-existence-neutral result. The recovery page validates the session with Supabase, clears the URL fragment, requires a fresh recovery-link context and matching passwords of at least 12 characters, updates through Auth and signs out locally. Configure the project's password policy at least as strong. Invalid/expired/used links show a fresh-link instruction; reloading after the recovery fragment has been consumed may require a new link. The public recovery request route does not provision accounts or assign roles. Authentication and recovery email delivery happen via Supabase Auth, not Next.js.

## Session and error behavior

Auth starts only in browser effects, with one SDK client, persistent session storage and automatic token refresh. Restored storage is not authorization: the app verifies the user with `getUser()` and reads the role via RLS before showing dashboard content. Unassigned accounts are denied; malformed/mismatched roles and identity/network failures fail closed. Loading states contain no private data. An expiry timer and Auth events clear stale content, and revision checks prevent late async responses restoring a signed-out/changed account. The Auth event callback stays synchronous; SDK calls are deferred to avoid lock deadlocks. Focus/visibility listeners and Auth subscriptions are cleaned up. Sign-out failure is reported without claiming success. Provider errors, passwords and tokens are never logged by application code. Persistent browser Auth means this is unsuitable for an untrusted/shared browser without signing out; no server HttpOnly session has been introduced.

## Validation and remote acceptance checks

Local Node tests cover matching role mappings, denial for unassigned/signed-out users, malformed/metadata-derived roles, stale async responses, revocation, network failures, expiry, logout, and elevated-key rejection. Run `npm test`, `npm run typecheck`, then `npm run build` in Supabase catalog mode. Tests explicitly generate an offline catalog snapshot, so the production build must follow them. Verify all six public product routes and the three admin routes are exported. A successful build reads the catalog, not authenticated role data, and does not prove login or the new RLS policies.

After project/conflict review, applying the new migration and configuring/provisioning accounts, run `supabase/tests/dashboard_roles_rls.sql` as the database owner in SQL Editor. Check its synthetic UUIDs and `example.invalid` emails for conflicts first. The script inserts isolated Auth/role fixtures, simulates JWT identities and database roles, asserts anonymous denial, self-only reads for both roles, unassigned/metadata-spoof denial, role-mutation denial, anonymous-auth exclusion and immediate revocation, then rolls back. It does not change legitimate catalog rows or create usable accounts. If it errors, explicitly `rollback;`. Run the existing `catalog_rls.sql` separately to verify active catalog filtering. These scripts are **prepared, not remotely executed in this phase**.

The broader manual acceptance checklist includes localhost and a trusted Vercel preview: owner and partner login/logout, wrong password, provisioned-but-unassigned account, expired/revoked session, denied role self-escalation via the Data API, role revocation while open, recovery email/link/update, refresh/navigation and mobile widths. Verify signup is disabled through project configuration. Completed user-executed Owner flows, temporary-account Auth/RPC denials and cleanup are recorded in [the verification guide](product-editing-authorization-checks.md); other checklist items remain unverified. No email delivery was tested by the agent.

Official documentation consulted: [password-based Auth](https://supabase.com/docs/guides/auth/passwords), [implicit flow](https://supabase.com/docs/guides/auth/sessions/implicit-flow), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and the installed [Next.js static-export guide](../node_modules/next/dist/docs/01-app/02-guides/static-exports.md).
