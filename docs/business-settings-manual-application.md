# Business/shipping settings: manual application review

**Application and configuration verification complete:** the user reported “Success. No rows returned” and supplied all thirteen postflight rows in `Supabase Snippet Untitled query (33).csv`. All twelve configuration rows pass; the existing-table counts in row `10` exactly match preflight CSV (32). This confirms application of the previously pending file below. **Do not rerun it or migrations 001–007.** The procedure below is retained as an execution record, not a request to repeat completed steps.

`supabase/migrations/20261102000800_owner_business_settings.sql`

Current SHA-256: `e29d4d0f61379fa4a3467a4a2aa20156606c0af1f704cbea8c42bbadd7a6408a`. This is the revised shipping version: Pakistan-wide coverage, initially unconfigured with null fee; Owner can choose free or nonnegative flat-rate delivery. Checkout/payment methods stay unavailable. No migration file was changed in this preparation pass.

The user-supplied evidence in `owner-product-drafts.md` confirms **001–007 were already applied and configuration-checked**, including the retained-constraint follow-up. CSV (32) confirmed settings objects were absent before this application; CSV (33) confirms the expected objects, contracts, grants and seeds afterward. SQL Editor application does not necessarily populate CLI migration history; no history repair or migration replay was performed.

## 1. Run one combined preflight and return results

Privately confirm the SQL Editor project against the app's existing project hostname. Do not send credentials, connection strings, API keys, JWTs, cookies or private settings. As the trusted SQL administrator, run the **entire** `supabase/tests/business_settings_preflight.sql`, including its read-only transaction and rollback. It performs no mutation RPC, schema/data write, role change, sequence allocation or notification.

It returns **one result set with ten rows (`00`–`09`)**: `check_name`, `expected`, `actual`, `status`. Return every row, for example as a CSV export. Output contains metadata, fingerprints, grants and counts, not settings/customer/contact/recipient values or function bodies.

| Row | Expected result |
| --- | --- |
| `00_context` | Read-only `on`, repeatable read, replication `origin`, correct pending filename; privately confirm the project. |
| `01_pending_name_collisions` | `[]`. Any settings schema/table/type/index/function or overload collision means stop; do not drop or replay objects. |
| `02_prerequisite_tables_columns` | All thirteen tables, nine column types, Auth uid/jwt return types and applied draft sequence present/matching. No sequence is advanced. |
| `03_dependency_functions` | All four source/contracts match: live Owner helper, immutable order guard, applied draft-create/save RPCs. |
| `04_platform_roles` | Three expected roles; anon/authenticated have no superuser, bypass or inherited roles; service role has BYPASSRLS. |
| `05_default_acl_review` | Standard defaults are explicitly revoked by the migration. Any custom-role default grant needs review before application. |
| `06_role_table_rls_and_grants` | Role-table RLS and self-read policy retained; anon cannot read, authenticated can read, neither can mutate. Review the reported policy expression too. |
| `07_order_snapshot_guard` | `true`: original enabled order guard; its source also checked in `03`. |
| `08_sql_administrator` | Owns orders (needed for column COMMENT), can create a schema and public objects. |
| `09_existing_row_counts` | `COMPARE`: save all counts for postflight. Existing real/test rows are allowed and never printed. Counts alone do not prove unchanged values. |

Rows `00`–`08` should be `PASS`; a custom default grant will be `REVIEW`. `STOP`, `REVIEW`, missing rows or SQL errors require reconciliation before application. A query error means incomplete inspection, not clearance; roll back the read-only transaction if left open. Do not repair the schema or rerun old migrations to force passing results.

**Preflight reviewed:** the user supplied all ten rows in `Supabase Snippet Untitled query (32).csv`. This is user-executed remote configuration evidence; the agent did not run the remote preflight. All prerequisites/source contracts, platform-role protections, role-table RLS/grants, order guard and administrator capabilities match. No pending-name collisions exist. The execution role is `postgres`, in a read-only repeatable-read transaction with replication role `origin`.

Row `05` was `REVIEW`, not an automatic pass: its only flagged grants are defaults **created by `supabase_admin` and granted to `postgres`**, not an application/custom recipient. There are **zero custom-recipient grants for creator `postgres`**. PostgreSQL applies the current creator's defaults, not the defaults of another role it belongs to ([PostgreSQL default-privilege rules](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html)). Therefore the flag is resolved for applying this unchanged migration **as `postgres`**. Its explicit revokes cover the reported broad standard-role defaults, including table privileges. Do not alter platform defaults merely to turn this review flag green; no preflight rerun is needed if the project, role and relevant state are unchanged.

Saved row-count baseline from CSV (32), for comparison with postflight row `10`:

```json
{"auth.users":1,"public.orders":0,"public.products":7,"storage.buckets":2,"storage.objects":0,"public.order_items":0,"public.dashboard_roles":1,"public.product_variants":28,"public.order_creation_keys":0,"public.order_status_history":0,"public.product_image_assets":0,"public.order_customer_details":0,"batool_catalog_internal.creation_requests":1}
```

The existing draft and creation request are baseline records, not disposable fixtures to remove. Counts are redacted comparison evidence, not proof of unchanged row values or actual-session permissions. Project identity is still a private operator check; the CSV does not establish the project hostname.

## 2. Manual application — completed by the user

The supplied preflight clears the application step for the same privately confirmed project and `postgres` role, provided the relevant state has not changed since that preflight. The migration file's SHA-256 still matches the value above.

1. In that same project's SQL Editor, keep the SQL execution role **`postgres`**.
2. Open **only** `supabase/migrations/20261102000800_owner_business_settings.sql`. Copy its complete unchanged contents, including `begin;` and `commit;`, into a new query and run it **once**.
3. Do not run migrations 001–007, a seed, `db push`, migration-history repair, or the disposable fixture suites against BATOOL. Do not edit/drop existing objects or change platform defaults to force success.
4. If execution errors, stop. If a transaction remains open/aborted, issue `rollback;` to close that failed transaction, and return the error for review. Do not blindly rerun. A no-rows success message alone is not postflight verification.
5. On success, before editing settings, execute the combined read-only postflight below and return all thirteen rows. The next review determines configuration acceptance. Actual Auth-session checks remain separate.

The agent provided instructions only; the user executed the migration and supplied the success report and postflight CSV (33). Application/configuration inspection are now recorded as completed. The agent made no remote writes or checkout changes.

If settings objects or a different earlier version already exist, do not replay the file: that requires a separately reviewed reconciliation/forward migration. No permission for such changes is inferred.

## 3. Combined postflight — reviewed and accepted

The user supplied all **thirteen rows (`00`–`12`)** from `supabase/tests/business_settings_postflight.sql` in CSV (33). It ran as `postgres` in read-only, repeatable-read mode with replication `origin`. No rerun is requested. The query calls no mutation RPC and prints no private settings. Its known-source public projection is inspected through redacted flags only.

Reviewed results: both ordinary settings tables have Owner-helper SELECT policies and RLS; all ten columns/defaults, eight CHECK/PRIMARY KEY constraints, ten new function contracts/source fingerprints/owners, and four existing dependency contracts match. No unexpected table/column/function/schema ACLs or overloads were reported. Revision triggers and the existing immutable order guard match. Both singleton seed rows have revision 1, no actor and the exact empty/draft/unconfigured defaults. The public projection has nine allowed keys, shipping unconfigured, draft texts withheld, checkout disabled and no available payment methods. Every existing-table count matches CSV (32), including the existing draft/request records. Count equality is not a row-value fingerprint or proof of actual-session behavior.

| Row | Expected result |
| --- | --- |
| `00_context` | Same read-only/isolation/replication context. |
| `01_settings_tables_columns` | Two ordinary RLS tables, ten exact columns/defaults, trusted owner, no extra columns. |
| `02_constraints` | Eight exact validated CHECK/PRIMARY KEY constraints, valid/ready PK indexes; NOT NULL checked in `01`, compatible with PostgreSQL 17/18. |
| `03_dependency_functions` | Existing four dependency contracts/fingerprints unchanged. |
| `04_platform_roles` | Expected platform roles/inheritance unchanged. |
| `05_new_function_contracts` | All ten new source fingerprints, types, arguments, security modes, owners and empty search paths match migration source; no overloads or extra internal functions. |
| `06_table_grants` | Authenticated SELECT only; no app table/column mutations or unexpected PUBLIC/custom ACLs/column grants. RLS limits raw reads to Owner. |
| `07_function_and_schema_grants` | Owner-save invocation: authenticated only; public projection: anon/authenticated only; internal functions/schema: no app/PUBLIC/custom grants. Invocation grants do not replace live Owner checks. |
| `08_owner_read_policies` | Exactly two authenticated SELECT Owner-helper policies, no write/public policies. |
| `09_revision_and_order_guards` | Two enabled revision triggers; existing immutable order guard retained. |
| `10_existing_row_counts` | `COMPARE`: every count must equal preflight row `09`. |
| `11_initial_seed_redacted` | One row per table; revision 1, actor null; exact empty/draft/unconfigured seeds match. Only booleans/counts printed. |
| `12_public_projection_redacted` | Nine exact public keys; Pakistan/PKR unconfigured/null shipping; checkout disabled, no payment methods, draft texts withheld. No actual contacts/wallet details/recipients printed. |

All rows except `10` should be `PASS`; `10` must match preflight. Unexpected results require review, not data edits or disabled protections. Public shipping/contact/policy changes still require **rebuilding and publishing** to update the static storefront. Neither publication nor checkout enablement is part of this handover.

These are **configuration checks, not actual-session authorization tests**. `scripts/prepare-business-settings-review.mjs` derives the pending filename and function fingerprints from actual repository migrations without database access. The combined preflight was validated locally with ten expected rows; the corrected postflight returned thirteen, all non-baseline checks passed and baseline counts matched. The comparator accounts for PostgreSQL 18 adding NOT NULL entries to `pg_constraint`; no migration change was needed. Only the corrected postflight was rerun, not the completed preflight. Logs: `.tmp/settings-review-pg-1793614444049/preflight.log` and `postflight.log`. The review database is stopped.

## Previously blocked disposable suites: executed now

The reported `.tmp/settings-pg-*` setup is **disposable standalone PostgreSQL 18.4**, with minimal Auth/Storage stubs, not BATOOL or a full Supabase stack. Loopback host/port/user/database and workspace data directory are explicit; no app environment/remote connection credentials are used. Earlier task-owned clusters were stopped. Fresh clusters of that same setup ran the pending suites:

| Suite | Schema stage and result |
| --- | --- |
| `supabase/tests/orders.sql` | **PASS**, through migrations 001/003/004/005/006, before stricter 007 product guards, without seed 002. All eleven fixture tables empty after rollback. Logs `.tmp/foundations-pg-1793614093101/orders.log` and `orders-rollback.log`. |
| `supabase/tests/product_drafts.sql` | **PASS**, through 001/003/004/005/006/007 without seed 002. All twelve fixture tables empty after rollback. Logs `.tmp/foundations-pg-1793614143257/product-drafts.log` and `product-drafts-rollback.log`. |

Two fixture-harness fixes were necessary: resolve the real temporary-schema name for grants; flush valid deferred events before testing TRUNCATE so PostgreSQL does not raise `55006` before the guard. No assertion was relaxed and no applied migration changed. Once orders passed it was skipped on the unfinished draft retry. Completed business/shipping fixtures, Node tests, browser scenarios, builds and user-confirmed Owner checks were **not repeated**. The two suite clusters and separate inspection cluster are stopped. Rollback was verified with fresh read-only zero-row checks, not inferred from PASS. Local sequence gaps after rollback are normal; fixture rows are absent.

These execute real PostgreSQL grants/RLS/triggers/constraints with **synthetic SQL roles and JWT claims**. They do not verify actual Supabase Auth tokens/sessions, HTTP/PostgREST embedding, hosted Storage byte validation, or multi-connection retry/ID/slug races. Those remain distinct. The real archived test draft and other remote data were not accessed or changed. No remote writes, notifications, deployment, commit, push or checkout enablement occurred.
