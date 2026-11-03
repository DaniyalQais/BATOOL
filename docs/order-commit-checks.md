# Forward migration 011 — deferred order completeness

Exact file: `supabase/migrations/20261102001100_order_commit_checks.sql`.

Prepared/applied-disposable SHA256: `d00c47d352c748b26914c64b5287d0410ee862d1800a88355102fb430abd0774`.

Status: **manually applied to BATOOL by the user and postflight accepted on 2026-11-02**. CSV (39) passed all five preflight checks. The user reported application success; CSV (40) passed all four postflight checks, including unchanged checker body, denied application access, preserved deferred triggers and closed intake/payment gates. Both count baselines were: products 7, variants 28; orders/items/customers/keys/history/context each 0. This is user-supplied production metadata/count evidence, not a production checkout commit or actual-session test. Do not rerun 001–011 or completed checks. The agent performed no production database operations.

The fix was previously applied and exercised in disposable hosted project `jcbxxgjrnkhgcspbscgb`; keep that runtime evidence distinct from BATOOL's manual postflight. Remaining production changes and the prepared recovery procedure are in [production integration and recovery](production-checkout-handover.md).

## Hosted failure and correction

The real browser could obtain a trusted database quote, but creation returned a sanitized HTTP 503. Read-only owned-fixture counts confirmed no committed orders/keys/stock deductions. A separate synthetic SQL-role rollback diagnostic reproduced `42501` reading `orders` when deferred constraints ran outside the creator's privileged function context.

The original private `batool_order_internal.check_complete_order()` was SECURITY INVOKER. PostgREST commits after the creator's SECURITY DEFINER context has returned; the deferred constraint trigger consequently needs its own trusted context to read protected order/item/customer/key rows. The caller `service_role` intentionally lacks those direct table grants.

011 changes **only that private trigger function to SECURITY DEFINER**, retaining the existing body, owner and empty search path, and explicitly revoking application execution. It does not grant service-role SELECT, expose an RPC/schema, change completeness rules, rewrite orders/stock, change any public RLS policy or enable checkout/payments. The checker reads only rows needed for its NEW order identity and returns no customer data. Monetary immutability, append-only history and atomic stock/order creation are unchanged.

Application guards require `postgres`, replication origin, accepted recovery helper, the exact original invoker checker/ownership/search path/body, all three deferred trigger bindings and closed readiness. A transaction with a five-second lock timeout makes attribute/grant changes atomic. An already applied or incompatible state fails; do not replay it.

## Executed evidence

- New 011 combined read-only preflight and postflight passed in the disposable project; all existing counts and checker body remained unchanged and intake stayed closed.
- New `order_commit_checks.sql` rollback regression passed: a service-role creation can finish its deferred checks after the creator returns; an incomplete order still raises a check violation; direct order SELECT and direct private-checker EXECUTE remain denied. Rollback confirmed zero orders/items/keys and original M stock 5. This is **synthetic SQL-role evidence**, not an actual Auth-session check.
- The pending real browser/Edge/PostgREST continuation subsequently confirmed a committed order, an intentionally discarded response with cart retained, scoped recovery and concurrent retries without repeated stock deduction. This is actual hosted HTTP commit evidence, recorded separately from the rollback diagnostic. The remaining acceptance outcomes are maintained in [hosted verification](hosted-checkout-verification.md).

## Manual BATOOL preparation — completed historical record

The sequence below is retained for audit only. CSVs (39)/(40) and the user's success report completed it; do not repeat it.

Do not apply 011 remotely to BATOOL as part of the disposable run. When separately requested, run only the [new combined read-only preflight](../supabase/tests/order_commit_preflight.sql) and return its six labeled rows for review. Expected rows 01–05 PASS; save all eight counts in row 06. Any STOP/error holds application. Neither review query invokes mutation RPCs or prints settings, credentials or row contents.

Only after reviewing those results, apply the **exact new 011 file once**, never an entire migration directory, then use the [new combined read-only postflight](../supabase/tests/order_commit_postflight.sql). Expected rows 01–04 PASS; row 05 equals the saved eight-count baseline. Keep all production checkout/payment gates disabled. Completed 001–010 checks and fixture suites must not be repeated. Metadata verification alone does not replace hosted/session acceptance.
