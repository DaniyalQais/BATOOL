# Manual product-editing authorization checks

## Status and boundaries

The user reported applying `20261030000400_owner_product_editing.sql` after the seven read-only conflict checks. Shared SQL results show the expected table grants and save-function execute privileges. The user reported successful Owner loading, description save/restore, Unknown-versus-zero stock, conflicting-tab protection, inactive-product loading/restoration, and signed-out dashboard denial. These are user-executed results, not agent-run browser tests.

Both actual RPC denials are now **user-executed passes**: the user shared `PASS partner: HTTP 403, 42501, Owner access required` and `PASS unassigned: HTTP 403, 42501, Owner access required`, each followed by successful local CLI sign-out. The helper verified each account's own UUID/session and expected mapping before sending the fixed negative-ID probe. These are actual authorization errors, not validation or stale-revision errors. The user subsequently deleted both temporary Auth accounts and confirmed the read-only cleanup check was clear: both users and their mappings absent, original Auth user present with Owner role. These results were supplied by the user; the agent did not independently query the remote database.

Local mock tests remain separate evidence. No accounts, invitations, role changes, remote requests or catalog mutations were performed by the agent for this procedure. Do not rerun migrations or use `supabase/tests/owner_product_editing.sql` on BATOOL; that suite is only for an empty disposable database. These RPC results do not establish untested browser flows or the full disposable-database test matrix.

## 1. Create two temporary accounts manually

1. Confirm the intended BATOOL Supabase project. Keep the existing Owner unchanged and public signup disabled.
2. Open **Authentication → Users → Add user → Create new user**, not Invite user.
3. Enter a distinct temporary email you control and a strong unique password meeting the project policy. Select **Auto Confirm User** for this explicitly administrator-provisioned test identity. Direct creation with confirmation avoids invitation/recovery emails. If the interface only offers invitations or lacks the required creation option, stop instead of sending email or weakening project settings.
4. Copy the actual **User UID/UUID** from its user details and label it privately `TEMP_PARTNER_AUTH_UUID`.
5. Repeat with another controlled temporary email/password; record `TEMP_UNASSIGNED_AUTH_UUID`. Do not add role metadata or assign any dashboard role to this second account.
6. Neither test account is ever Owner. Do not use the existing Owner email. Keep passwords privately; never paste credentials, keys or session tokens into chat, SQL, source files or shell commands.

These direct email/password accounts need no invitation password-setup flow. The app's existing password-setup form accepts **recovery** links, not invitation links; this procedure sends neither.

## 2. Verify identities and assign Partner through trusted SQL

Replace all placeholders locally. The existing Owner UUID is a reference/guard only. First run this read-only SQL in the intended project's SQL Editor:

```sql
select u.id, u.email, u.email_confirmed_at, u.created_at, r.role
from auth.users u
left join public.dashboard_roles r on r.user_id = u.id
where u.id in (
  'EXISTING_OWNER_AUTH_UUID'::uuid,
  'TEMP_PARTNER_AUTH_UUID'::uuid,
  'TEMP_UNASSIGNED_AUTH_UUID'::uuid
);
```

Privately check three distinct intended identities: existing Owner = `owner`, both newly created temporary users confirmed with NULL roles. Verify their emails and creation times. Stop if anything differs. No email screenshots are needed.

Then manually run this guarded assignment as the trusted administrator. It inserts exactly one Partner mapping, never an Owner mapping:

```sql
begin;
do $$
declare
  owner_id uuid := 'EXISTING_OWNER_AUTH_UUID'::uuid;
  partner_id uuid := 'TEMP_PARTNER_AUTH_UUID'::uuid;
  unassigned_id uuid := 'TEMP_UNASSIGNED_AUTH_UUID'::uuid;
begin
  if owner_id = partner_id or owner_id = unassigned_id
     or partner_id = unassigned_id then
    raise exception 'Three distinct verified Auth UUIDs are required';
  end if;

  perform 1 from public.dashboard_roles
  where user_id = owner_id and role = 'owner' for share;
  if not found then raise exception 'Existing Owner guard failed'; end if;

  if (select count(*) from auth.users
      where id in (partner_id, unassigned_id)
        and email_confirmed_at is not null) <> 2 then
    raise exception 'Both confirmed temporary Auth users must exist';
  end if;

  if exists (select 1 from public.dashboard_roles
             where user_id in (partner_id, unassigned_id)) then
    raise exception 'Temporary users must have no existing role assignments';
  end if;

  insert into public.dashboard_roles (user_id, role)
  values (partner_id, 'partner');
end;
$$;
commit;
```

On error, stop and issue `rollback;` if necessary. Do not upsert/overwrite an assignment to force success. Rerun the read-only identity query: expect unchanged Owner, temporary Partner = `partner`, temporary unassigned = NULL. Application users cannot perform this assignment.

## 3. Check dashboard behavior with each identity

Keep the Owner's browser separate. Use a private window; close **all** private windows between identities, or sign out explicitly, since private tabs can share storage.

1. Sign in as temporary Partner at `/admin/login/`; `/admin/` should show Partner and no product editor.
2. Sign out, then sign in as temporary unassigned at `/admin/login/`. Authentication succeeds but dashboard access must be denied, with no product editor.
3. Sign out afterward. Hidden buttons alone do **not** establish RPC denial.

## 4. Execute the real RPC denial probe for each account

In the VS Code terminal, open the project directory containing `package.json` and the existing `.env.local`. Do not overwrite it. Confirm its existing configuration targets the same intended BATOOL project. The helper reads only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` and rejects non-publishable key formats. No service-role/admin key is used.

For Partner:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/verify-product-editing-denial.ts partner
```

Enter the temporary **Partner's own** UUID, email and password at the interactive prompts. Password entry is hidden. Do not put credentials in arguments, shell history or environment additions. Do not enter Owner credentials.

For the unassigned account:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/verify-product-editing-denial.ts unassigned
```

Enter that temporary **unassigned account's own** UUID/email/password. Each run signs in with `signInWithPassword`, verifies the UUID through `getUser()`, and reads that user's own role mapping. Owner mappings, mismatched identities, wrong roles and unverifiable sessions stop before RPC execution. This is a separate session for the test account, not the browser's Owner session. Session persistence and automatic refresh are disabled, and local-scope sign-out is attempted afterward.

The fixed RPC is `public.owner_update_catalog_product`, with this payload:

```json
{
  "p_product_id": -1,
  "p_expected_revision": 1,
  "p_name": "Authorization probe",
  "p_description": "Nonexistent negative-ID authorization probe.",
  "p_price_minor": 0,
  "p_active": false,
  "p_stocks": { "S": null, "M": null, "L": null, "XL": null }
}
```

**Never substitute a real product ID or reserved ID 9/10.** The schema forbids negative IDs, the RPC allowlist rejects `-1`, and every catalog mutation in the inspected RPC is scoped to `p_product_id`. Even if the Owner check fails, this request cannot change legitimate product data. The invalid ID is a safety boundary, not the expected denial: the live Owner check runs before product validation.

Only these outputs pass:

```text
PASS partner: HTTP 403, 42501, Owner access required
PASS unassigned: HTTP 403, 42501, Owner access required
```

Each identity must return authenticated HTTP **403**, SQLSTATE **42501**, and the exact RPC message **Owner access required**. The helper checks all three. It never counts a generic failure as proof. These are **not passes**:

- `22023`: validation rejected the safe ID, not the expected Owner guard.
- `PT409`: stale revision, not authorization.
- A generic `42501` such as permission denied for a function: does not prove the Owner-mapping guard executed.
- Missing function/schema, `PT404`, expired/invalid session, invalid key, network errors, or a successful response: failure/inconclusive.

Stop on unexpected results. Never retry with a valid product ID, assign Owner or weaken policies. Share only the sanitized helper output and test label, never tokens, credentials or Network headers. These are actual Data API requests in each account's session, beyond hidden controls; they do not run the disposable-database suite.

## 5. Clean up temporary accounts manually

1. Sign out both temporary accounts in private browsers and close those windows. Check the helper's CLI sign-out message.
2. In **Authentication → Users**, find each account by the recorded temporary UUID and privately verify its email. Delete **only those two temporary Auth users**, one at a time. Do not edit/delete the original Owner. The existing `dashboard_roles.user_id` foreign key has `ON DELETE CASCADE`, so deleting the temporary Partner removes its mapping; the unassigned account has none.
3. Replace the same placeholders locally and run this read-only check:

   ```sql
   select
     (select count(*) from auth.users where id in (
       'TEMP_PARTNER_AUTH_UUID'::uuid,
       'TEMP_UNASSIGNED_AUTH_UUID'::uuid
     )) as remaining_test_users,
     (select count(*) from public.dashboard_roles where user_id in (
       'TEMP_PARTNER_AUTH_UUID'::uuid,
       'TEMP_UNASSIGNED_AUTH_UUID'::uuid
     )) as remaining_test_roles,
     exists (select 1 from public.dashboard_roles
       where user_id = 'EXISTING_OWNER_AUTH_UUID'::uuid
         and role = 'owner') as original_owner_preserved;
   ```

   Expect **0, 0, true**. Verify the original Owner still signs in and loads products. Remove saved temporary passwords from your private password store.
4. Deleting users does not retroactively invalidate already-issued JWTs before expiry. Sign-out and deletion prevent continued refresh; the Partner mapping is removed, and neither test identity ever had Owner privileges. Do not describe deletion alone as immediate global token revocation.

## Execution record

| Check | Evidence |
| --- | --- |
| Migration/preflight and table/function grants | User-run SQL results reviewed in chat |
| Owner browser flows and signed-out dashboard denial | User-reported passes |
| Helper safety, identity checks, exact-error classification | Four new mock tests passed; all 85 Node tests and TypeScript checking passed. Not a database test |
| Interactive password masking/cancel | Checked with dummy input, cancelled before client creation/login; no remote request |
| Temporary Partner Auth login and actual RPC denial | User shared PASS: HTTP 403 / 42501 / Owner access required; CLI session signed out |
| Temporary unassigned Auth login and actual RPC denial | User shared PASS: HTTP 403 / 42501 / Owner access required; CLI session signed out |
| Cleanup and original Auth user/Owner preservation | User reported deleting both temporary accounts and a clear read-only check: both Auth users absent, both role mappings absent, original Auth user exists with Owner role |
| Full rollback-only disposable-database suite | Not run; forbidden on existing BATOOL catalog |

Official references: [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [RPC calls](https://supabase.com/docs/reference/javascript/rpc), [user deletion and token limitations](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users).
