# Actual Orders role-session verification plan

Prepared 2026-11-01. **Owner reset-to-All and manual Refresh orders are user-executed and complete.** Reset: both All, both filter predicates absent, GET 200 / `[]`, offset 0, original empty message restored, Page 1, Previous/Next disabled. Manual refresh: request after clicking Refresh orders 200 / `[]`, All/All, both predicates absent, original empty message retained, Page 1, Previous/Next disabled. Immediate sign-out UI, dashboard restoration, restored Owner access across reload and signed-out reload/Back/Forward UI denial are confirmed as detailed below. Exact signed-out network request counts remain unreported/unverified. Partner/unassigned Orders access and populated disposable-database tests remain pending. Do not repeat completed Owner UI checks. This is a manual plan, not an account-provisioning action or an application change. Record only the user's specific confirmations in the [live verification record](orders-live-verification.md). Prior product-editing RPC checks do not establish Orders authorization; their temporary accounts were reported deleted.

## Finish Owner checks first

Keep the current account's Auth identity and `owner` mapping unchanged. Use its existing browser profile and exact origin, normally `http://localhost:3000`. Do not copy session storage or bearer headers. In DevTools Network, inspect GETs rather than OPTIONS/HEAD, share only statuses, row counts, predicate presence and UI messages, and never export headers/HAR/row contents.

1. **Reset-to-All:** complete on the user's explicit observations recorded above. Do not repeat. Empty responses do not establish nonempty row filtering or pagination; active pending/unpaid requests were not confirmed by the reset evidence.
2. **Manual refresh:** complete on the user's button-click result recorded above. Do not repeat. Restored-session reload was confirmed separately below; **Check access again** and visible loading transitions remain unconfirmed.
3. **Logout/reload/Back/Forward UI denial, confirmed:** the user reported Sign in required, no account details and no Orders controls immediately after sign-out, then separately confirmed successful signed-out reload and Back/Forward with no protected account details or Orders controls reappearing. Exact network request counts remain unreported/unverified; do not infer zero requests. Do not repeat completed Owner UI checks. Old Network responses are diagnostic history, not new requests; UI/session checks are not global token-revocation or database row-isolation tests.
4. **Dashboard restoration and reload persistence, confirmed:** the user first reported the Owner dashboard visible again, orders GET 200 / `[]`, both filter predicates absent. In the separate follow-up after reload, the user explicitly confirmed Assigned role owner, orders GET 200 / `[]`, the exact original empty message, Page 1 and Previous/Next disabled. Do not repeat the completed reload check. Exact login actions were not described, and signing back in after the latest signed-out navigation test was not reported; do not infer the current session state. No new Owner, role change, password reset or credential sharing is needed.

Safe confirmation template:

```text
Filters: pending status/count; pending+unpaid status/count; predicates; Page; message
Reset: predicates removed yes/no; status/count; message
Manual refresh: new GET yes/no; status/count; predicates/filter selections retained yes/no
Logout: heading; Orders/account displays cleared yes/no
Signed-out reload/Back/Forward: denied yes/no; new order/private requests count
Login restoration: Owner yes/no; orders status/count; message
Post-login reload: Owner yes/no; orders status/count
```

If a step fails, record a sanitized reproducible trigger, expected/actual UI, status and recognized error code before considering any application change. Authentication failure, missing endpoint and database permission denial are different observations. No remote orders or fixture rows should be created to make a result visible.

## Prepare separate temporary identities after Owner restoration

Use the existing trusted [temporary-account provisioning procedure, sections 1–2](product-editing-authorization-checks.md#1-create-two-temporary-accounts-manually). It requires two newly created, distinct confirmed email/password accounts using controlled emails, with public signup left disabled. Use direct administrator creation; no invitation/recovery messages are needed. Keep credentials privately in the browser/password manager, never in chat, SQL, source, logs or shell arguments. Supabase documents user administration on the [Auth Users page](https://supabase.com/docs/guides/auth/users).

Privately record the new temporary UUIDs and verify them against their intended emails and creation times. The old deleted test UUIDs are not to be reused. Use the reference procedure's read-only three-identity inspection and guarded **plain INSERT** for exactly one `partner` mapping. Its guard requires three distinct UUIDs, the original existing Owner mapping and two confirmed, initially unassigned temporary accounts; it rejects conflicting assignments. Leave the second temporary identity without any role row. On mismatch, stop and reconcile rather than upserting or altering the Owner. Do not run the product/image RPC probes in that document for this Orders plan.

The user/trusted administrator performs provisioning and role assignment manually. Nothing has been provisioned or assigned by the agent. This plan authorizes no grants, policy changes, migrations, order/customer writes, image uploads, deployments or infrastructure downloads.

Create one separate local browser profile for Partner and another for unassigned, with sync/import skipped and extensions disabled. Keep the Owner profile separate. Multiple private/Guest windows may share a session; do not assume each tab/window represents a different identity. Each profile signs in with its own account through the normal app login. Do not copy a token, use a service-role key, edit user metadata to simulate a role or demote the Owner.

## Actual browser-session checks — all pending

| Account | Required observation | What it establishes |
| --- | --- | --- |
| Temporary Partner | Successful Auth request, own self-role request yielding Partner, dashboard displays Partner | Actual login/role lookup/UI for that temporary identity. |
| Temporary Partner | Orders GET succeeds; explicit report-only projection, no wildcard/private embeds; record status and row count | Request composition and successful report endpoint use, including honest empty UI if `[]`. Empty rows do not prove report filtering. |
| Temporary Partner | No View order details control or product editor, and no requests to private order tables/retry-key table during normal list/filter/refresh | Frontend query selection for this session; hidden controls/absent requests do not prove database private-read denial. |
| Temporary Partner | Filter/reset/manual refresh behavior and sign-out/reload denial | Actual frontend/session behavior, only after separately confirmed. |
| Temporary unassigned | Successful Auth request; own self-role GET 200 / `[]`; Access not assigned at `/admin/` | Real authenticated but unassigned session, distinct from a failed login or signed-out state. |
| Temporary unassigned | After a settled access check and reload, no Orders controls/product editor and no orders/private-table requests | Frontend gating for the unassigned session; not a direct database authorization test. |
| Temporary unassigned | Sign out and reload, then Sign in required | Actual sign-out behavior for this temporary identity. |

When reviewing role/identity requests locally, verify they belong to the intended temporary account; do not share UUIDs/emails or response objects. Report only the role label, request statuses/counts, UI state and whether private-table requests occurred. If any unexpected private request/row appears, keep the contents private, stop that test and report only the table, status/count and trigger. Do not inspect/download more data or change policies to force the expected result.

## Direct Data API matrix — prepared expectations, execution pending

The browser checks above do not exercise endpoints the UI deliberately never requests. Separate direct GET tests require each temporary account's own verified session and live mapping, using only the app's publishable key. No Owner/elevated token may substitute. No direct Orders probe has been run or added to the application. A future read-only test client must keep credentials/tokens in memory, avoid raw response logging and use local-scope sign-out so other browser sessions are not touched.

| Endpoint/projection | Partner expected | Unassigned expected |
| --- | --- | --- |
| `orders`, explicit report columns, no private embeds | 200, report rows permitted | 200 / `[]` |
| `order_items`, `order_customer_details`, `order_status_history`, each `select=order_id&limit=1` | 200 / `[]` | 200 / `[]` |
| `order_creation_keys?select=order_id&limit=1` | 403 / PostgreSQL `42501` object-privilege denial | Same |

These are expected outcomes from the checked-in grants/policies, not executed results. An invalid/expired JWT, missing/wrong API key, network failure or missing column/table is inconclusive, not a permission pass. A retry-key 403 / object-permission error demonstrates object privilege denial for the request, not row-policy filtering on the other tables. Direct empty reads on empty tables remain observations only. Nonempty live customer payloads are unnecessary for these minimal probes and must never be printed or shared.

## Populated-fixture authorization — explicitly pending

Keep `supabase/tests/orders.sql` and all seeded-row/constraint/role-simulation tests **pending until executed in an empty disposable test database** with the documented opt-in and rollback checks. Do not run them on BATOOL. No Docker downloads or blocked deployment retries are part of this plan.

To establish row/private-data isolation, the disposable database must have populated synthetic order, item, customer, history and retry fixtures. A permitted positive control must demonstrate the fixtures actually exist and are readable by the intended permitted identity. Then test Partner report visibility and absence of private rows (including joins/embeds), unassigned row denial, backend-only retry-key object denial and live role removal under the relevant identities. Record fixture scope, expected/actual counts/shapes and rollback/cleanup results without private values. SQL-simulated JWT/roles and actual Auth-session HTTP tests are separate evidence; one cannot be recorded as the other. The actual disposable Auth-session matrix remains pending as well.

## Temporary account cleanup — pending

After the role-session checks, sign out both temporary identities and close their test profiles. Use [the existing cleanup procedure, section 5](product-editing-authorization-checks.md#5-clean-up-temporary-accounts-manually), scoped to the **new verified temporary UUIDs only**. Its read-only cleanup check expects zero temporary Auth users, zero temporary role rows and the original Owner preserved. Never delete/edit the original Owner or other legitimate identities. User deletion does not immediately invalidate every issued JWT; see [Supabase user deletion limits](https://supabase.com/docs/guides/auth/managing-user-data#deleting-users).

Finally, confirm the original Owner still signs in and loads Orders. Provisioning, role checks, cleanup and Owner preservation each remain pending until the user explicitly reports them.
