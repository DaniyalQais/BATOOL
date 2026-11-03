# Secure checkout 009 — staged manual application

**Follow-up local work:** [Intent recovery / prepared migration 010](checkout-intent-recovery.md) now implements the previously missing resolution protocol. It does not change this accepted 009 application record or authorize another remote application. Its own application/integration remains pending.

Source review completed November 2, 2026. Read: migration 009, `secure-checkout.md`, prepared preflight/postflight, the actual checkout client/Edge handler, and the relevant applied catalog/order/settings helpers. No SQL was executed, no tests repeated and no BATOOL connection used in this review. Migration, application code and prepared SQL review files are unchanged.

Migration **`20261102000900_secure_checkout.sql`** was **manually applied by the user**, followed by all nine postflight rows in CSV (36). Configuration acceptance is **complete within the prepared postflight's scope**: eight PASS results and a matching count baseline. SHA256 of the reviewed local file: `a9050cf3209f95fe33cfd4f021cc94eeaf2e4e09fbce5449a669532ded089eaf`. Do not replay migrations 001–009 or repeat the completed preflight/ACL/postflight checks. Checkout and all method readiness flags remain disabled. Hosted integration and actual-session authorization remain pending. The agent executed no remote SQL, tests, deployment, email, commit or push during this review.

## User postflight CSV (36) — reviewed and accepted

All nine labeled rows were supplied and treated as data, not instructions. Rows 01–06 and 08–09 PASS. Row 07 exactly matches the saved CSV (34) baseline below, including seven products, 28 variants, one business-settings row, one notification-settings row and zero rows across the five existing order tables.

The prepared inspection confirms the new private schema/three private tables/Owner context table exist; one readiness row has all five flags false; all four RPCs have the checked SECURITY DEFINER/search-path/service-only execution properties; application roles cannot use the private schema; Owner-context RLS, checked grants/policy and two enabled immutable triggers match; quote/rate/context tables remain empty; public checkout is false with no available methods; and all seven new function-body fingerprints match the prepared source.

This is **user-executed remote configuration evidence**, reviewed locally from the CSV. It does not prove row-value equality beyond matching counts, actual-session row isolation, runtime transaction behavior or hosted integration. The success message alone was insufficient; acceptance is based on these subsequently supplied results. No further query or migration execution is requested for this completed preparation stage. Remaining blockers and their classifications below still apply.

## User preflight CSV (34) — reviewed

All eight rows were supplied and read as results, not instructions. Rows 01–03, 05–06 and 08 PASS; row 04 is REVIEW. Row 07 baseline:

```json
{"keys":0,"items":0,"orders":0,"history":0,"products":7,"variants":28,"customers":0,"notifications":1,"business_settings":1}
```

This is user-executed configuration evidence. The agent did not run remote SQL. Migration 009's SHA256 still matches. Zero order counts are recorded without creating fixtures; count equality is not proof of row-value equality or actual-session authorization.

The preflight's ACL predicate considers all creator roles and does not print the grants. The earlier migration-008 review resolved a similar flag as defaults belonging to `supabase_admin` and granting to `postgres`, with no custom defaults for creator `postgres`. CSV (34) alone cannot establish that the current flag has exactly the same cause. PostgreSQL applies the current creator's defaults, not defaults inherited from other roles: [official default-privilege documentation](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html).

The user subsequently supplied all three [focused ACL follow-up](../supabase/tests/secure_checkout_acl_review.sql) rows in CSV (35). Context and current-creator resolution PASS. All twelve flagged entries are defaults **created by `supabase_admin`, granting to `postgres`, in `public`**, with `applies_to_current_creator: false` and no grant option. There are no flagged custom-recipient defaults for creator `postgres`. This resolves row 04 for applying the unchanged migration **as postgres**; another role's defaults do not apply to that creation context. Migration 009 explicitly revokes the standard PUBLIC/application-role defaults before commit. No platform ACL change, repeat preflight or repeat ACL query is needed if the project/role/relevant state is unchanged. The agent read results as evidence, not document instructions, and executed no SQL/tests or remote writes.

## Safety review

| Area | Finding from the actual source |
| --- | --- |
| Application transaction | One BEGIN/COMMIT, five-second lock timeout, plain CREATE names. A conflict/error must be resolved; do not blindly replay. If execution fails with an open aborted transaction, roll it back before further work. |
| Existing data | No ALTER, UPDATE, DELETE, backfill or fixture call against existing tables during application. The only INSERT executed by the migration seeds the new readiness singleton. Existing product/stock/order/settings rows and existing grants/policies are not rewritten. New foreign keys reference existing orders. |
| Prerequisites | Applied catalog/variant, role, image/Owner helper, order-foundation, draft and business-settings migrations. In particular, existing immutable order guards, deferred completeness triggers, retry-key uniqueness, parent/variant revision behavior, live Owner helper and validated singleton settings remain dependencies. PostgreSQL 15+ and the named platform roles/functions are checked by preflight. |
| Private schema | Readiness, quotes and rate windows are in `batool_checkout_internal`, with schema/table/function privileges revoked from PUBLIC/anon/authenticated/service_role. They rely on that privilege boundary rather than public-table RLS. Trusted administrators retain their administrative authority. |
| Public private-context table | `order_checkout_details` enables RLS; authenticated gets SELECT only; its policy calls the existing nonanonymous live Owner helper. Partner/unassigned/anonymous cannot read it under that helper. UPDATE/DELETE/TRUNCATE are blocked by existing rejection triggers as well as absent application grants. |
| RPC grants | Only service_role receives EXECUTE on checkout_admit/quote/create/recover. All four are SECURITY DEFINER with empty search paths. Browser identities get no new order/stock/settings write grants. Service credentials must remain backend-only. |
| Stock | Canonical cart ordering; ascending parent-product FOR UPDATE locks before ascending variant locks, consistent with Owner editing and the variant-to-parent revision trigger. Readiness/settings are shared-locked first. Unknown stock, inactive/archived/demo products and insufficient per-size stock reject the attempt. Quotes do not reserve inventory for their ten-minute lifetime. |
| Atomicity | Order creation rechecks the saved quote, then decrements stock and writes all order/customer/item/key/context/history records in one transaction. Existing deferred completeness constraints must run at commit. Errors roll back the transaction; an in-function return alone is not commit confirmation. |
| Retries | Scope/key advisory transaction lock; hashed retry key and canonical quote/customer digest; prior matching key returns the same receipt before expiry/readiness checks. Mismatched content conflicts. Quote row lock plus consumed-order link prevents another key using the same quote. This protects retry identity, not unrelated new purchases deliberately made under new quotes/keys. |
| Disablement | All five new readiness flags seed false. Public settings projection remains false/empty methods. No Owner enabled flag or application of 009 opens intake. The prepared Edge backend also has its own disabled-by-default gate; production UI accepts only a local test endpoint at present. |
| Privacy | Migration execution publishes no settings/recipients and creates no orders. Public receipts omit customer details; quote construction excludes wallet accounts and notification recipients. Wallet snapshots are saved only to the Owner-only context when an eligible order is actually created. |

No source-level migration blocker was identified for **disabled preparation**, conditional on prerequisites and preflight results. This is not launch approval. Preflight row 02 checks dependency presence, not every historical definition; row 07 compares counts, not a full value digest. Prior applied-migration records and source review remain relevant. Neither preflight nor postflight proves actual-session authorization.

## Stage 1 — run only the combined read-only preflight

**Completed:** user CSVs (34)/(35), reviewed above. The instructions/results table below are retained as reference; do not repeat this completed stage.

Open [secure_checkout_preflight.sql](../supabase/tests/secure_checkout_preflight.sql), copy its entire contents into SQL Editor, select the trusted `postgres` execution context, and execute once. It uses a repeatable-read READ ONLY transaction, a statement timeout and ROLLBACK. Its only business RPC read is the existing STABLE public settings projection. It prints no raw settings, customers, wallet accounts or notification recipients.

| Label | Expected result |
| --- | --- |
| 01 execution identity | PASS — trusted postgres administrator. |
| 02 dependencies | PASS — required foundation objects/signatures exist. |
| 03 name conflicts | PASS — private schema, context table and all checkout RPC names absent. Any conflict stops application; it may indicate prior/partial work. |
| 04 default ACLs | PASS — no unexpected default grantees. REVIEW requires examining/resolving that ACL before application. |
| 05 application roles | PASS — three roles exist; anon/authenticated are neither superuser nor BYPASSRLS. |
| 06 PostgreSQL | PASS — version/functions supported. |
| 07 existing row baseline | JSON counts to save, not a PASS/FAIL. Zero counts are not required. |
| 08 public intake gate | PASS — checkout false and available methods empty. |

Return **all eight labeled rows**, including baseline counts. No credentials, headers, raw settings or private rows are needed. A SQL error, STOP or REVIEW is not permission to continue. No mutation RPC, test order or fixture suite is part of this step.

## Stage 2 — after reviewing the user's results

**User reported application success. Do not repeat.** Both CSVs were reviewed and the exact migration hash was unchanged. The application instructions below are historical reference, not another execution request. SQL Editor's “Run without RLS” preserves the migration's own explicit Owner-context RLS and private-schema grant restrictions; automatic extra RLS SQL was not required. The user's success report does not independently identify which modal button was used.

1. Privately confirm SQL Editor is the same intended BATOOL project and execution role remains **postgres**. Do not share connection details/credentials.
2. Open only [20261102000900_secure_checkout.sql](../supabase/migrations/20261102000900_secure_checkout.sql), copy the entire unchanged file including BEGIN/COMMIT, and execute **once**. It creates disabled readiness, not live intake.
3. Do not replay 001–008, run seeds/fixtures, use migration-folder/reset/push commands, edit platform ACLs or alter readiness/public-method flags. No deployment or notifications are part of this step. SQL Editor application and migration-ledger registration are distinct; do not assume the editor inserts migration history.
4. If execution errors, stop and report the error category. If a transaction remains open/aborted, issue `rollback;` to close that failed transaction. Do not blindly rerun or drop objects.
5. After a successful application, run the combined read-only postflight in stage 3 and return all nine rows. A no-rows success message is not postflight acceptance.

If 009 objects already exist, investigate instead of applying again. If application is attempted later and fails, review the transaction outcome before considering another attempt. Successful application should leave only the new disabled readiness row and empty new quote/rate/context tables.

## Stage 3 — combined read-only postflight completed

**Completed and reviewed:** user CSV (36), all expected results matched. The file and expected-results description below are retained as the configuration record; do not repeat this check.

Prepared file: [secure_checkout_postflight.sql](../supabase/tests/secure_checkout_postflight.sql). Run the entire file only after confirmed application. It is one read-only transaction and does not call any new checkout RPC.

Expected: rows **01–06, 08–09 PASS**, row **07 counts exactly match the saved preflight baseline**. These cover new objects; all readiness flags false; four service-only empty-search-path SECURITY DEFINER RPCs; private-schema denial; Owner context RLS/grants/immutable triggers; no new quote/rate/context data; public closure; seven function-body source fingerprints. Share all nine labeled rows without private values. No postflight execution is requested before stage 2.

## Remaining blockers classified

These categories concern a future launch. They do not authorize opening checkout, applying remote migrations or deploying in this task.

| Blocker/work | Classification | Concrete requirement |
| --- | --- | --- |
| Review/apply 009 and inspect postflight — completed | Required before the first real order — completed | User CSVs (34)–(36) reviewed and accepted. Do not replay migrations or completed inspection. Gates remain off. |
| Saleable merchandise, images, product promotion and per-size inventory | Required before the first real order | Checkout rejects demo products and Unknown stock. Current draft `is_demo` is immutable; changing a label/price does not make a concept saleable. Review a legitimate promotion/catalog path and confirm the real merchandise and inventory. |
| Owner shipping, COD instructions/policy and a working support channel | Required before the first real order | Owner explicitly chooses free/flat rate. Approve actual wording and at least one usable public support channel; no invented delivery/refund terms. Backend requires approved nonempty payment instructions/policy even for COD. |
| Tax treatment | Required before the first real order | Resolve the zero-tax gate deliberately. If zero tax is inappropriate, implement trusted tax calculation; do not simply flip the flag. |
| COD operations and reliable Owner retrieval | Required before the first real order | Verify saved-order/customer access and define who monitors, fulfills and reconciles cash. Current dashboard is read-only; an authorized recorded operating procedure is needed. A polished status-editing UI can follow if a reviewed manual process covers launch. |
| Actual-session authorization | Required before the first real order — **pending** | Real Owner private retrieval, Partner report-only access, unassigned/anonymous denial and revoked-session behavior. Existing synthetic role/JWT tests and user-confirmed empty Owner screens do not complete populated-session verification. No such checks ran here. |
| Expired/ambiguous submitted intent recovery | Required before the first real order | Implemented locally in prepared 010: locked retirement, committed-order recovery and one pinned replacement key/quote. Review/apply/verify that follow-up before launch; hosted acceptance is pending. This affects COD too. |
| Hosted Edge/PostgREST integration and backend security configuration | Required before the first real order | Verify actual gateway/runtime/RPC/commit/recovery behavior in a disposable Supabase environment, with server-only keys, durable scope secret, exact origins and effective limits. No BATOOL fixture orders. |
| Production checkout integration and approved public export | Required before the first real order | Live URLs are currently rejected by the local-only configuration. Review/implement the production connection and readiness exposure, then separately authorize publication. Rebuild/publication is required for current public shipping/contact/policy text; applying 009 cannot do this. |
| Customer-data retention, capability recovery/rotation and abuse operating plan | Required before the first real order | Decide access/retention and recovery responsibilities; verify forwarded-header trust and adequate limiter behavior. Preserve consumed quotes/keys needed for recovery. |
| Wallet titles/numbers, enabled intent and wallet instructions | Required only for wallet payments | Configure each wallet independently; no credentials/PINs/OTPs. Keep both wallet readiness flags false during a COD-only launch. |
| Manual wallet verification/reconciliation/status handling | Required only for wallet payments | Authorized evidence-based verification and audit/status procedure; a customer's claim never marks paid. Saving account details is not verification. |
| Private notification recipients and automated email/message delivery | Optional for an initial COD launch | Owner can monitor the saved-order dashboard manually under a reliable procedure. Recipients remain private. Notifications must not become an unverified dependency of a successful database order. |
| Scheduled cleanup automation, additional anti-abuse tooling and polished operational UI | Optional for an initial COD launch | May follow a small launch if the required manual retention/monitoring/status procedure and tested baseline limits are adequate. Do not delete consumed recovery records. |
| Hosted Owner image-upload validator | Optional for an initial COD launch, conditional | Not on the checkout transaction path. Can wait only if the launch catalog already has genuine approved saleable items/images through another reviewed path. Required if launch depends on the current Owner upload/activation path. |
| Additional public contact channels | Optional for an initial COD launch | One working support route is required above; filling both WhatsApp and email is not intrinsically required by checkout. Both remain Owner-editable. |

## Expired-intent recovery — 009 limitation and local 010 follow-up

The following describes the accepted 009 behavior and the resolution requirement it left open. [Prepared 010](checkout-intent-recovery.md) now implements that protocol locally, including separate commit proof, replacement binding, repeated-response recovery and bounded expired-token recovery. Do not interpret the historical absence of an RPC in 009 as absence from the new local implementation.

A quote expires after ten minutes; the guest scope token expires after seven days. Before its first create request, the client saves scope/key/quote/cart in session storage. It stores no delivery details. A timeout therefore leaves a durable uncertain intent and the bag intact.

If creation committed but its response was lost, **Check saved order** uses the same scope/key to recover the receipt. An identical create retry also finds the saved key before checking quote expiry or readiness. Re-entering delivery details after reload must reproduce the original canonical payload for that retry. A different payload conflicts. Edge recovery still works with intake off only while configuration/capability remain valid; it remains rate-limited.

If creation never committed and the quote expires or settings/prices permanently conflict, recover returns no receipt and retry cannot use that old quote. The client intentionally refuses a new quote while the saved intent exists. There is **no cancellation/invalidation RPC or support resolution UI** in 009. `startAnother()` works only with a confirmed receipt, not with an uncertain/failed intent. A zero-row lookup at one instant cannot establish that an earlier request will not commit later.

A safe future resolution must serialize against the same scope/key lock, return an existing committed order if present, or durably invalidate the unconsumed old quote while excluding concurrent creation, then confirm that outcome before permitting a replacement intent/key. An authorized manual process must provide equivalent protection; simply searching the Owner list and clearing browser storage does not. After token expiry, secret loss/rotation or session-storage loss, current guest self-service may no longer recover the old scope; an authenticated operational recovery procedure is needed. Customers should not send bearer tokens/keys or private delivery details into this chat.

## Hosted integration in concrete terms

The production export has no Next server/API routes. The prepared external Edge function accepts guest calls with custom signed capabilities (`verify_jwt=false` in its function configuration), then makes service-authenticated PostgREST RPC requests. Deno's offline check verified imports/types only. Node/browser tests mocked HTTP; standalone PostgreSQL used Auth/Storage stubs. None proves the hosted path.

Before launch, a **disposable Supabase** acceptance run must exercise the real browser origin/OPTIONS/CORS, gateway/function startup and imports, capability issuance/validation, service-only RPC permissions, PostgREST parameter/error mapping, deferred completeness checks and actual commit. The create request explicitly sends `Prefer: tx=commit`; a separate recover HTTP transaction must see the same order before success/cart clearing. Simulate losing that response and retry/recover with the same identity, plus real concurrent requests and denied private reads. Check timeout/error categories and forwarding-header/rate-limit behavior. Confirm no elevated keys, customer data or private settings enter the static export/logs.

These are future required integration checks, not actions performed/authorized now. Keep all intake/method gates off on BATOOL; actual-session authorization stays pending. No remote writes, deployment, email, commit or push is part of this review.
