# Migration 013 — staged manual review

Status: production **013 manual application and postflight accepted** from the user's success report and CSV (44). All three postflight checks returned PASS: private helpers restricted, public wrappers authenticated-only, and checked database gates/availability closed. All eight counts match preflight CSV (43): orders/items/keys/customers/history/context each 0, products 7, variants 28. This is user-supplied metadata/count evidence, not stock-quantity, actual-session or runtime verification. Accepted 001–013 must not be replayed. No production query, migration, fixture or recovery mutation was executed by tools for this preparation. No permission to deploy, publish or enable intake follows from this record.

Exact accepted file: [`20261102001300_checkout_recovery_order_validation.sql`](../supabase/migrations/20261102001300_checkout_recovery_order_validation.sql).

SHA-256: `3f1fa81903caec6c5204de794032de08381c414b0bfb554c3ecced41b96aa1dc`.

## Review

The transaction requires `postgres`, normal replication behavior, the exact accepted 012 function definitions/ownership/security settings, closed checkout/payment readiness and disabled/unconfigured recovery. A five-second lock timeout aborts rather than waiting indefinitely. It moves the original verification/resolution functions into the private schema, preserving their validation behind restricted wrappers. The new predicate accepts only orders linked to a consumed checkout quote, checkout details and creation key in the same scope. Unsupported references escalate instead of authorizing replacement. The resolver locks its recovery case before revising an older unsupported case; the original atomic intent/order resolution remains behind the wrapper for supported orders. No new intent, stock deduction or replacement authority is introduced by installation.

Public wrappers grant execution only to `authenticated` and enforce the existing live Owner check; Partner, unassigned, anonymous Auth, revoked sessions and service-role callers gain no new recovery authority. Private predicate/original helpers revoke execution from PUBLIC, anon, authenticated and service_role. Security-definer functions keep an empty search path. Table/RLS permissions are not broadened.

There is no installation-time row backfill or order/stock update. Case/audit changes occur only on later authorized recovery calls. Existing orders, charged snapshots, stock and retry mappings remain untouched by this migration. Baseline table counts are useful preservation evidence but are not a stock-quantity checksum or runtime authorization test. Production actual-session verification remains pending; previous disposable evidence is recorded separately in [the focused fix report](checkout-gap-fixes.md).

## Accepted preflight

The steps below are the historical review/application sequence, now completed. Do not rerun them.

Run the **entire** [combined preflight](../supabase/tests/recovery_order_validation_preflight.sql) in BATOOL's SQL Editor using `postgres`. It explicitly opens a repeatable-read, read-only transaction and rolls it back. It prints labels, status and aggregate counts only, with no customer records, private settings or credentials.

| Label | Expected result |
| --- | --- |
| `01 exact accepted 012 functions` | `PASS` |
| `02 new helper absent` | `PASS` |
| `03 gates closed` | `PASS` |
| `04 baseline counts` | JSON containing eight counts: orders/items/keys/customers/history/context/products/variants; retain all for comparison. Do not assume zero. |

Return all four rows for review. Any STOP, error, unexpected existing helper or definition mismatch blocks application; do not rerun a migration to repair it. Passing preflight alone is not permission to apply before review. Owner preferences, backend/build flags and deployment state are not inspected by this SQL; leave them disabled as already required.

CSV (43) has now been reviewed against all four expected rows. In the BATOOL SQL Editor as `postgres`, manually run the entire exact 013 file linked above once, without 001–012 or any fixture scripts. If execution fails or its outcome is uncertain, return the error/status before retrying. Keep all production gates and Owner payment preferences closed.

After confirmed application, run the entire [combined read-only postflight](../supabase/tests/recovery_order_validation_postflight.sql). Expect three PASS rows (private helper restrictions, authenticated-only wrapper grants, closed gates/availability), plus the same eight baseline counts recorded above. Return all four rows for acceptance. SQL Editor execution must not be assumed to update migration-history bookkeeping. Do not apply twice if an outcome is uncertain.

Remaining decisions and launch actions: [short approval sheet](checkout-launch-approvals.md), [detailed checklist](checkout-launch-checklist.md) and [exact deployment/rollback plan](checkout-deployment-plan.md).
