# Read-only Orders verification — 2026-11-01

**2026-11-02 hosted update:** the [populated actual Auth-session Data API matrix](hosted-checkout-acceptance.md) now passes in a separate disposable Supabase project for Owner, Partner, unassigned, anonymous Auth/no-session and live role revocation. Issued-JWT residual access after logout is explicitly recorded, not mislabeled as immediate revocation. No BATOOL fixture, role change or completed production Owner check was repeated. Earlier pending production browser/UI items below remain distinct; the new fixture-backed Data API evidence supersedes only the corresponding disposable/API pending items.

**November 2 local execution update:** the formerly blocked order and draft fixture suites passed on disposable standalone PostgreSQL 18.4 with Auth/Storage stubs and verified zero-row rollback checks. See [the current handover and local evidence](business-settings-manual-application.md). Those tests execute PostgreSQL grants/RLS/constraints/triggers with synthetic SQL roles/JWT claims; they do not complete any actual Supabase-session/API checks below. The historical Docker/full-Supabase-stack limitation remains separate. Completed user checks were not repeated and no remote data was accessed or modified in this pass.

This record separates agent-executed evidence, user-executed Owner browser checks and checks still awaiting execution. No passwords, user tokens, browser storage, HAR files or customer records are needed in chat. The agent has no browser tool attached to that session; an isolated automated browser is not the Owner session.

## Executed against the configured Supabase project

The probes loaded only the existing project URL and validated `sb_publishable_` key for requests. They sent no user JWT or elevated key, followed no redirects, performed only GET/HEAD, and recorded statuses, recognized error categories and row counts rather than response rows or credentials. The initial sandbox network attempt was inconclusive; the network-enabled run produced:

| Request | Result | Interpretation |
| --- | --- | --- |
| Public `products` GET with publishable key, no user JWT | 200, one public row | Positive control: the configured key reaches the public Data API successfully. |
| `orders` HEAD with the same key | 401, no body | Reproduces the reported status; alone it identifies neither the rejecting layer nor RLS behavior. |
| `orders` GET with the same key | 401, PostgreSQL code `42501`, database object permission-denied message | Database object privilege denial, rather than failed API-key authentication. |
| `orders` GET without an API key or user JWT | 401, API-key authentication error | Authentication-layer failure, distinct from the keyed request. |
| `order_items`, `order_customer_details`, `order_status_history`, `order_creation_keys` GET with the publishable key | Each 401 / `42501`, database object permission-denied message | Anonymous object privileges reject these reads; no private rows returned. |

The retry-key probe initially selected nonexistent `id` and returned 400. That result was inconclusive, not a denial pass. It was corrected to the existing `order_id` column before recording the table's 401 / `42501` result above.

PostgREST maps insufficient privileges (`42501`) to 401 for an unauthenticated request and 403 for an authenticated one. An invalid JWT is a different error class, such as `PGRST301`. See [PostgREST errors](https://docs.postgrest.org/en/stable/references/errors.html) and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys). These probes verify anonymous object-privilege denial for the tested endpoints. **They do not prove RLS role-policy enforcement**, which is not reached merely by observing a missing SELECT privilege. An empty response on empty tables also cannot establish row isolation.

Sanitized local diagnostics are in ignored `.tmp/orders-live-anon-results.json`. No real order/customer row was written or printed. Migration 006 was not rerun. Docker downloads and image-validator deployment were not retried.

## Executed against the existing local production export

The existing `out/` export was served on an ephemeral loopback port and inspected using a new isolated Playwright context, without attaching to or reading the user's browser profile. `/admin/`, `/admin/login/`, `/admin/reset-password/` and `/` returned 200. After hydration and an admin reload, `/admin/` showed **Sign in required**, with no Orders heading, Refresh orders button or assigned-role field. There were zero external request attempts and zero browser script errors. External requests were blocked by the test harness; a request attempt would have failed the zero-request assertion.

All 100 HTML/TXT/JS/JSON/map assets in the export were scanned for elevated key literals, JWT-shaped literals, known synthetic browser-fixture canaries and serialized private-value patterns. There were zero findings. The admin HTML contained no rendered order-detail controls, customer section or assigned-role field. The checked Orders/auth/configuration source files were not newer than that export. No rebuild or publication was performed at that verification step; the later favicon-only build is recorded separately below.

Source review found order reads only in the browser order reader, behind verified access. The static admin route renders its initial verification shell; the build snapshot reads public catalog products, not orders. Only the validated public Supabase URL and publishable key are exposed through Next configuration. Order responses stay in component state, without order-data local-storage persistence. Public client code necessarily contains table/field names and UI labels; those are not customer records.

This is bounded evidence from source review, a pattern scan and a fresh unauthenticated browser. It is not a universal proof that arbitrary private text can never appear in a future export. Sanitized results are in ignored `.tmp/orders-public-surface-results.json`.

## User-executed Owner browser checks — reported 2026-11-01

The user reported the following from their existing Owner browser session. These are **user-executed checks**, not agent-observed browser results:

- Dashboard role: **Owner**.
- Orders GET: **HTTP 200**, response **`[]`**.
- UI: **No orders are available to this account. Order intake has not been enabled.**
- Previous and Next orders buttons: **disabled**.

This establishes a successful authenticated Owner list request and the corresponding honest empty UI, with disabled empty-result pagination. It does not establish that the physical database has no orders or prove RLS row isolation. That initial report did not include filtered requests, refresh, access recheck, logout or explicit project-hostname comparison. Subsequent reset evidence is recorded separately below; it does not confirm the earlier pending/unpaid filter stages. Console observations and their later Guest comparison are also recorded separately below.

### User-executed reset-to-All verification — complete

The user explicitly confirmed both filters set to **All**, absence of both `fulfillment_status` and `payment_status` filter predicates, orders GET **200**, response **`[]`**, and request **offset 0**. In a subsequent confirmation the user completed the reset UI check: the original message **No orders are available to this account. Order intake has not been enabled.** was restored, **Page 1** was displayed, and **Previous/Next were disabled**. These are user-executed observations, not agent-observed browser results.

Reset-to-All is now complete on the reported evidence, and the user requested no repetition of completed filter checks. The Page label and message are confirmed by the later explicit UI report, rather than inferred from offset 0 or the initial load. No pending-only or pending-plus-unpaid response or active-filter predicate was confirmed by these reset reports. The separate subsequent manual refresh result is recorded below.

### User-executed manual Refresh orders — complete

The user confirmed that after clicking **Refresh orders**, the orders request returned **200 / `[]`**. Both filters remained **All**, both filter predicates were absent, the original empty message remained, **Page 1** was displayed and **Previous/Next were disabled**. This records the user's manual button-click result, not an agent-run browser test. No browser-reload, access-recheck, loading-transition or active-filter refresh result is inferred. The subsequent sign-out/restoration observations are recorded below.

### User-executed sign-out UI and dashboard restoration

The user explicitly reported that sign-out showed **Sign in required**, with **no account details or Orders controls**. This initially confirmed the immediate signed-out UI only; the later signed-out navigation confirmation is recorded below. Exact signed-out network request counts have not been reported.

The user subsequently reported **Owner dashboard visible again**, orders GET **200 / `[]`**, and both filter predicates absent. This confirms the user's observed dashboard restoration and successful unfiltered request; the exact intervening login actions were not described. No credentials or tokens were supplied.

In the requested follow-up after reloading the restored dashboard, the user explicitly confirmed **Assigned role: owner**, orders GET **200 / `[]`**, the exact message **No orders are available to this account. Order intake has not been enabled.**, **Page 1** and **Previous/Next disabled**. Record **restored Owner access across reload as user-executed and confirmed**. That reload report does not newly confirm request predicates or any signed-out navigation/request behavior; preserve those separate evidence boundaries.

### User-executed signed-out reload and Back/Forward denial — confirmed

The user subsequently explicitly confirmed successful completion of the **signed-out reload and Back/Forward test**, with **protected account details and Orders controls not reappearing**. Record signed-out reload/navigation UI denial as **user-executed and confirmed**, not as an agent-observed browser test. Do not repeat completed Owner UI checks.

The user expressly excluded exact network request counts from this confirmation. Those counts remain **unreported/unverified**; no zero-request claim, absence-of-private-requests claim or database RLS/private-row-isolation proof may be inferred. Signing back in after this latest test was not reported; the earlier confirmed restoration/reload remains historical evidence, not a statement of the current browser session. Partner/unassigned Orders access and populated disposable-database authorization tests remain **pending**.

## Owner browser walkthrough — remaining checks pending

Use the browser profile and exact origin containing the existing Owner login. `localhost` and `127.0.0.1` have different browser storage; do not copy session storage between them. Open `http://localhost:3000/admin/` if that is the session's origin. If the page asks for sign-in, the existing session has not been found on that origin; do not report an Owner pass. Compare the orders request's project hostname privately to the intended Supabase Dashboard project before treating it as a live-project check. No hostname or credential needs to be pasted into chat.

1. Open DevTools → Network → Fetch/XHR. Disable cache. Reload `/admin/`. Confirm **Assigned role: Owner**. Select the actual **GET** to `/rest/v1/orders`, rather than an OPTIONS preflight or HEAD request. Privately confirm a user bearer credential and the app API-key header exist; do not copy either. Confirm the query selects only report columns, has `created_at.desc,id.desc` ordering and a first-page range equivalent to offset 0 / limit 21. There should be no embedded private relationships.
2. A successful initial empty list requires **200 and `[]`** with both filters at All and Page 1. The UI should say **No orders are available to this account. Order intake has not been enabled.** It must not show an error as an empty result, invented orders or zero-sales metrics. This proves only that this authenticated request returned no visible rows, not that the physical database is empty. If it returns rows, report only the count; keep their contents private and do not create a fixture to force any state.
3. **Reset-to-All is complete** on the explicit user confirmation above; do not repeat completed filter/reset checks. Nonempty pagination and active pending/unpaid request results are not established by this empty reset result.
4. **Manual Refresh orders is complete** on the user's explicit confirmation above. Do not repeat. The later restored-session reload is separately confirmed below. **Check access again** and visible loading transitions remain unconfirmed.
5. **Immediate sign-out UI, signed-out reload denial and Back/Forward UI denial are confirmed** on the explicit user reports above. Protected account details and Orders controls did not reappear. Do not repeat completed Owner UI checks. Exact new order/private-table request counts remain unreported/unverified; do not infer zero requests from hidden UI. Previously captured Network entries are not evidence of newly fetched data.
6. **Restored Owner access across reload is confirmed**: Assigned role owner, GET 200 / `[]`, exact original empty message, Page 1 and Previous/Next disabled. Do not repeat this completed reload check. No password reset, new Owner, role change or credential sharing is needed.
7. Optionally confirm the same signed-out UI in a private window. The automated fresh-profile production-export check above already covers that boundary independently. Logout/access denial is a frontend check; direct anonymous Data API object denial is separately verified above.

Safe report format: `Owner role/project matched: yes/no; initial GET: status + []/row count; empty message: ...; pending/unpaid predicates: yes/no + statuses; reset: yes/no; Refresh/reload/access recheck: ...; logout/reload/Back: ...; new post-logout order/private requests: count.` Share only recognized error codes and a sanitized permission/authentication category if a step fails. Do not share headers, Copy as cURL/fetch output, HAR files, account emails or row contents.

## Inspect the existing Console error — pending

The user subsequently reported two previously observed messages: (1) a hydration attribute mismatch at `layout.tsx:42`, with extra body attribute `cz-shortcut-listen="true"`; (2) a permissions policy violation, `unload is not allowed in this document.`, at `frame.js:22640`. The orders GET separately returned 200 / `[]`. These are user-reported observations; error timing, the `frame.js` origin and causation remain unconfirmed. The source locations alone do not establish that either script/attribute originated in application code.

The planned verification was a new local browser profile with sync/import skipped and all extensions confirmed disabled: first signed-out `/admin/`, then, if the user signs in privately through the normal UI, the Owner read-only check. The requested observations were each warning independently, the presence/absence of `cz-shortcut-listen` on the body, whether `frame.js` is loaded, its sanitized origin category and timing relative to navigation/orders GET. No session storage should be copied between profiles. A warning disappearing in a clean profile narrows the environment difference but does not identify a particular extension by itself. The subsequent user-observed Guest result is recorded below; details not included in that report remain unconfirmed.

At that inspection step the user explicitly requested **no application code modifications** and **no `suppressHydrationWarning` workaround**. Only this documentation record was updated then; the subsequently authorized favicon asset fix is recorded below. No hydration suppression, authentication or permissions-policy change was made.

Keep the Owner session open and inspect the existing Console entry before clearing logs or signing out. Select the topmost relevant red error and note its first-line message, occurrence count and source filename/line. Read locally first: manually replace tokens, API keys, emails, identifiers and customer text with `[redacted]`; replace URL origins with `[origin]` and remove query strings/fragments entirely before sharing. Do not copy the full Console, full stack, expanded objects, request headers, browser storage or a screenshot containing unreviewed data. No Console commands or pasted scripts are needed.

If it links to a failed network request, inspect only its method, pathname, status and recognized error code locally. Do not share response rows or arbitrary raw error objects. Note whether the error predates the successful orders GET or appears alongside it. A successful 200 / `[]` orders GET does not by itself identify a separate Console error's cause. Report the sanitized message, source basename/line, approximate timing and, if applicable, method/path/status/code. Preserve the initial error until classified; reproduce with a normal reload only after recording that safe summary. Do not replay writes, upload images or retry deployment as part of diagnosis.

## User-observed Guest result and favicon fix — 2026-11-01

The user reported that the earlier hydration attribute mismatch and unload-policy warnings **did not appear in the Guest-profile check**. The only visible error was **`favicon.ico` — 404 Not Found**. These are user-observed results, not an agent-observed Guest session. The warning difference narrows the investigation to browser/profile/environment differences; it does not definitively identify any particular extension. The original error timing and `frame.js` origin remain unconfirmed. The Guest account/session state was not reported, so this does not count as any additional authenticated role check.

Asset and metadata inspection found no existing favicon/logo image; the header uses a text wordmark. A simple BATOOL B monogram was created in the existing plum (`#51343f`) and paper (`#faf8f4`) colors. The editable source is `assets/source/batool-monogram.svg`; `src/app/favicon.ico` contains 16/32/48 px images. Next.js's file-based favicon convention automatically emits the icon metadata, so `src/app/layout.tsx` needed no change. Static-export configuration and authentication were not changed, and no `suppressHydrationWarning` was added.

Agent-executed verification: a Supabase-mode production build (`node.exe node_modules/next/dist/bin/next build`) passed compilation, TypeScript checks and static generation. The existing build only read the public catalog; it did not read orders or modify remote data. Both development `/` and `/admin/` emitted favicon links whose icon URLs returned **200**, `image/x-icon`, with bytes identical to the source icon. The bare development **`/favicon.ico` returned 200** as well. The production export contains **`out/favicon.ico`**, byte-identical to the source (2,092 bytes); both exported pages reference it, and serving the exported icon on loopback returned **200**. Sanitized results are in ignored `.tmp/batool-favicon-verification.json`. No commit, push, deployment, Docker download or validator deployment retry occurred.

## Status boundaries

The [temporary Partner/unassigned session plan](orders-role-session-checks.md) is prepared. Confirmations are limited to the initial Owner observations, completed reset-to-All and manual Refresh orders results, immediate signed-out UI, dashboard restoration, restored Owner access across reload, and signed-out reload/Back/Forward UI denial explicitly recorded above. Do not repeat completed Owner UI checks. Exact signed-out request counts remain unreported. No temporary accounts have been created for Orders checks, no remote role/data changes have been performed, and application code is unchanged in this planning pass. Empty responses remain insufficient evidence of row filtering or private-data isolation; Partner/unassigned order-access tests and populated-fixture authorization tests remain pending, with the latter confined to a disposable test database.

| Check | Status |
| --- | --- |
| Anonymous Data API object-privilege denial | Executed for all five order tables, as above; not proof of RLS. |
| Fresh unauthenticated production-export browser and bounded export scan | Executed, passed within stated scope. |
| Actual Owner list, honest empty state and disabled empty-result pagination | **User-executed and reported passed:** Owner, GET 200 / `[]`, exact empty message, Previous/Next disabled. |
| Owner reset-to-All request and UI | **User-executed, complete:** both All, both filter predicates absent, GET 200 / `[]`, offset 0, original empty message restored, Page 1, Previous/Next disabled. |
| Owner manual Refresh orders | **User-executed, complete:** request after click 200 / `[]`, All/All, both filter predicates absent, original empty message, Page 1, Previous/Next disabled. |
| Owner immediate sign-out UI | **User-executed, confirmed:** Sign in required; no account details or Orders controls. |
| Owner dashboard restoration | **User-executed, confirmed:** Owner dashboard visible again, GET 200 / `[]`, both filter predicates absent in that report. Exact login actions not described. |
| Owner post-login reload persistence | **User-executed, confirmed:** after reload Assigned role owner, GET 200 / `[]`, exact original empty message, Page 1, Previous/Next disabled. |
| Signed-out reload denial and Back/Forward UI behavior | **User-executed, confirmed:** protected account details and Orders controls did not reappear. No rerun requested. |
| Exact signed-out network request counts | **Unreported/unverified.** No zero-request claim inferred from UI denial. |
| Owner explicit access recheck and project-hostname comparison | **Pending user execution/report.** |
| Owner active pending/unpaid requests | **Not confirmed by the reset evidence.** No repetition of completed filter/reset checks requested. |
| Reported hydration and unload-policy Console messages | **User-observed: neither warning appeared in Guest.** Particular extension attribution, original timing and `frame.js` origin remain unconfirmed. |
| Missing favicon | **Fixed and agent-verified:** dev icon URL 200; production export contains and serves the same icon. |
| Owner private-detail rendering against populated real rows | **Pending; no orders will be created for this check.** |
| Actual Partner Auth-session/API/report-only and private-read checks | **Pending, not executed.** |
| Actual unassigned Auth-session/API checks | **Pending, not executed.** |
| Anonymous Supabase Auth-user session checks | **Pending; publishable-only no-session requests are a separate case.** |
| Disposable SQL fixture suite and rollback verification | **Passed locally on November 2:** standalone PostgreSQL 18.4, Auth/Storage stubs, order and draft suites, verified empty fixture tables after rollback. Actual Supabase/HTTP/session behavior remains separate; Docker downloads were not retried. |
| Image-validator deployment/runtime acceptance | **Still unverified; no deployment retry made.** |

Existing mocked browser tests and Node tests retain their documented frontend/unit scope. Neither those tests nor this anonymous denial substitutes for actual Partner/unassigned sessions or fixture-backed database execution.
