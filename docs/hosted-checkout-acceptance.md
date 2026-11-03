# Disposable hosted acceptance — 2026-11-02

**Subsequent new recovery work:** [operational integration](operational-checkout-integration.md) records new 012-only disposable SQL/Auth/PostgREST recovery checks. The changed handler ran locally; it has not been deployed to hosted Edge. The original accepted Edge checkout suite below was not rerun. BATOOL 001–012 are now accepted, including user-reported manual 012 application and postflight CSV (42); that production metadata evidence is separate from disposable runtime/session proof. See the [single remaining launch checklist](checkout-launch-checklist.md). Intake/payment/recovery gates remain closed; the original two disposable orders/stock are unchanged.

Target: **`jcbxxgjrnkhgcspbscgb`**, session pooler `aws-0-eu-west-1.pooler.supabase.com:5432`. This target differs from the configured BATOOL project. All remote setup, fixtures, deployments and session operations were confined to this disposable project; no production write/request, original Owner change, email, storefront deployment, commit or push occurred. Reading the configured BATOOL URL locally served only production exclusion.

**Outcome:** the actual checkout client in an isolated browser harness exercised hosted Edge → PostgREST → database successfully, including commit/retry/recovery/replacement. The populated **actual Auth-session Data API matrix passed**. This does not certify the production storefront/dashboard UI, production origin/configuration, or customer operational recovery.

**Production metadata update:** [migration 011](order-commit-checks.md) fixes a real hosted deferred-constraint execution-context bug. Following disposable acceptance, the user manually applied 011 to BATOOL: preflight CSV (39) and postflight CSV (40) passed, counts unchanged and intake/payment gates closed. Accepted migrations 001–011 must not be replayed. This production metadata evidence does not extend the disposable runtime/session results to production. See [exact remaining integration changes and operational recovery](production-checkout-handover.md).

## Executed hosted checks

| Check | Actual result |
| --- | --- |
| Browser path | Actual client/contracts, served on isolated loopback; real browser fetches directly to hosted `secure-checkout`; real service-only PostgREST RPCs/database. No HTTP mocks/proxy. |
| Trusted quote | Synthetic PKR unit/subtotal 100001 paisa, flat shipping 25001, total 125002, derived by the database. |
| First commit and response loss | Real committed response intentionally discarded before client confirmation; cart/intent retained, reload recovered the same committed receipt and consumed cart once. |
| Concurrent retry | Parallel original scope/key requests returned the same order; counts/stock showed one order and one deduction. A different scope could not recover it. |
| Committed resolution/reload | Resolution returned the committed order; acknowledged receipt reload did not consume cart again. |
| Expired uncommitted intent | Scoped quote was expired in the disposable database; placement failed with cart preserved. Durable retirement and lost-resolve retry returned the same replacement identity. Old quote attempts under original/different keys were rejected. |
| Pinned replacement/lost quote | A real replacement-quote response was discarded; retry returned the same pinned quote/key. |
| Replacement commit/concurrency/loss | Parallel replacement creation and a discarded replay response produced one additional order/deduction. Reload recovered that replacement receipt. |
| CORS | Real permitted-origin preflight and browser JSON POST succeeded through CORS; invalid capability was visibly rejected by the handler with 401. Disallowed-origin browser request was blocked; direct forbidden OPTIONS/POST returned 403 without allow-origin. Assertions use actual responses/browser enforcement, not Playwright's unreliable preflight event count. |
| RPC boundary | All seven checkout RPCs denied no-session and actual Owner/Partner/unassigned/anonymous/revocation-candidate application sessions with `42501`; endpoint/auth/network errors were not accepted as permission passes. |
| Owner configuration | Actual Owner revision-checked business save/private recipient save succeeded; stale revision conflicted. Partner/unassigned/anonymous saves were denied; direct settings/role writes denied. Public DTO exact allowlist excluded recipients/wallet details and exposed checkout false/methods empty. |
| Closed-intake recovery | With Edge intake and all database gates off, real Edge/PostgREST recovered the second order using its original persisted replacement scope/key. A backend-signed **test guest capability** was minted only for this owned fixture; this does not implement authenticated customer capability reissuance. |

Response loss here means discarding successful real responses, not physical network packet-loss emulation. Concurrent HTTP requests test real retry serialization; older independent-session SQL lock-barrier suites were not rerun or relabeled as HTTP evidence. Supabase Auth JWTs in the access matrix were issued by real Auth, not minted by the harness or SQL-simulated claims.

## Actual-session matrix against populated fixtures

| Identity | Report rows | Private items/customer/history/context | Raw settings/recipients | Direct writes / retry keys |
| --- | --- | --- | --- | --- |
| Temporary Owner | Both orders, explicit safe projection | Permitted; synthetic customer fields positively verified in memory | Permitted | Orders/settings/roles direct writes denied; retry-key reads denied |
| Temporary Partner | Both report-safe rows | No rows, including private embeds | No rows | Denied |
| Actual unassigned, including spoofed Owner metadata | No rows | No rows | No rows | Denied |
| Actual anonymous Auth, even with deliberately erroneous Owner mapping | No rows | No rows | No rows | Denied |
| No-session public-key caller | Object-privilege denial | Object-privilege denial | Object-privilege denial | Denied; distinct from anonymous Auth session |
| Temporary Owner after live role removal | No rows with the retained JWT | No rows | No rows; Owner save RPCs denied | No new privileges |

Role reads were self-only. Owner details were read only from synthetic fixtures; no returned customer fields, identities, credentials, headers or tokens were printed. Existing production Owner UI evidence remains historical and was not repeated. The full production dashboard UI under Partner/unassigned/revoked accounts remains outside this Data API matrix.

**Logout boundary, verified rather than assumed:** actual sign-out revoked refresh; a refresh request failed with a recognized session/refresh error. The already issued access JWT still read reports while its Owner mapping existed. Removing that temporary Owner mapping immediately denied report/private/settings reads and Owner saves under the same retained JWT. Therefore logout alone is **not immediate JWT revocation**. Approve the residual JWT lifetime/role-revocation procedure or implement live per-session authorization if immediate API denial is required. Never label the observed residual access as a revoked-JWT denial pass.

## Discovered hosted bug and verification

The first real create returned 503 with zero committed orders/deductions. A focused **synthetic SQL-role rollback diagnostic** reproduced `42501` when deferred order completeness ran after leaving the creator's SECURITY DEFINER context. The unchanged private checker body was SECURITY INVOKER and lacked table privileges at commit.

New forward `20261102001100_order_commit_checks.sql` makes only that private trigger SECURITY DEFINER, preserving owner/empty search path/body and revoking application execution. New disposable preflight/postflight passed, counts unchanged; its new rollback regression proved complete orders pass and incomplete orders still fail, without granting direct table/checker access. This synthetic-role regression remains distinct from the subsequent successful **real HTTP commit**.

The initial deployment helper also needed to accept an empty successful HTTP 201 response from the secrets API. A failed harness CORS event-count assertion was replaced by direct real CORS behavior tests. Neither issue changed application authorization. Applied migration files 001–010 were not edited.

## Continuations and evidence

Failed stages were retained as failed, never relabeled as overall passes. Completed cases were skipped during guarded continuations:

1. Original run passed setup, real login, settings and RPC boundaries; creation was unresolved.
2. Zero-order continuation isolated the hosted create failure; no committed order/deduction.
3. After **new 011 only**, pending browser commit/retry/recovery/replacement cases passed, leaving two orders and M stock 3. Setup/settings/RPC cases and function deployment were not repeated.
4. A two-order continuation ran only the remaining CORS, populated-session, revocation and closed-intake-recovery checks. It neither created another order nor repeated completed checkout cases. Fresh temporary sessions were necessary prerequisites for those pending checks, not credited as repeated login tests.

Scripts: `disposable-hosted-deployment.mjs`, `verify-hosted-checkout.mjs`, `verify-hosted-access-pending.mjs`, `verify-disposable-commit-fix.mjs`, and `record-hosted-acceptance.mjs`. The single-run/zero-order/two-order guards are fixture-specific and must not be repurposed as customer restart logic. Do not rerun these completed checks or initialize this project again.

Sanitized evidence is under ignored `.tmp/hosted-acceptance/`: **`acceptance-summary.json`** consolidates the original/continuation result references, `pending-access-results.json`, `commit-check-fix.json`, `deployment-run-result.json`, schema/source/deployment metadata. Private `.env.hosted.local` and `scope-secret.txt` must never be printed/shared. Results contain fixed check labels/statuses and aggregate counts only. No full existing local suite, accepted production migration/review or old browser suite was rerun. Earlier new artifact syntax/offline Deno checks are recorded in the preparation document.

Final local review: the prepared full runner now fails closed unless the trusted deferred checker fix is present and uses direct preflight response assertions instead of counting Playwright events. Its syntax check passed; completed acceptance cases were not rerun for these harness changes. `git diff --check` passed on the changed tracked handover files. SHA256 comparison confirmed all nine accepted schema-definition source files used in initialization remain unchanged; new 011 is separately fingerprinted in its handover.

## Final closure — independently verified

- New scope issuance returns HTTP 503 `checkout_unavailable`; disposable Edge intake is off.
- Anonymous Auth is restored off; temporary Auth users and role mappings are both zero.
- All five database readiness flags, all method preferences and the public checkout/method gates are off.
- Two complete pending/unpaid synthetic COD orders remain: two items/customer/key/context rows each, four initial history rows. M stock is 3 from its starting 5. PKR monetary snapshots and COD verification context are unchanged; no wallet payment was enabled or marked paid.
- Owned browser/loopback servers were stopped. Immutable fixture orders remain in the isolated project for evidence review; do not disable triggers/delete rows to clean them. Delete the whole disposable project after evidence acceptance, and retire its short-lived Management token when no longer needed. Nothing is deployed to the existing storefront hosting.

## Remaining launch checklist

- [x] BATOOL 011 manually applied by the user; CSV (40) postflight accepted with unchanged counts and closed gates. Do not repeat migrations or checks.
- [ ] **Before first real order:** implement/review the [production client/backend origin and availability integration](production-checkout-handover.md), then separately authorize deployment/static publication and production-specific verification; this acceptance used a loopback browser harness, not the production UI.
- [ ] **Before first real order:** implement/rehearse authenticated operational recovery and signing-key retention/rotation; approve JWT revocation latency or add immediate session checks. Follow the [concrete recovery procedure](hosted-checkout-verification.md#operational-recovery-procedure--required-before-real-intake): preserve cart/intent, privately verify the requester, find a committed order, otherwise resolve the exact original identity atomically and independently confirm retirement before replacement. If original identity cannot be established, replacement remains blocked. Original retry keys stored only as hashes cannot be reconstructed. Do not ask for bearer credentials or infer safety from a missing row.
- [ ] **Before first real COD order:** genuine approved merchandise/images, known per-size stock, Owner shipping, approved policy/COD wording and support route, tax decision, fulfillment/cash reconciliation, retention/abuse/monitoring procedures. Production intake stays off until these are ready.
- [ ] **Only before each wallet:** real Owner account configuration and approved manual verification/reconciliation/status handling; a customer claim never marks paid. Automated notifications/polished operational tooling are optional for initial COD when adequate manual procedures exist.
