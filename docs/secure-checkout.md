# Secure checkout — local preparation

For the completed application record and remaining work, see [manual application review and classified launch blockers](secure-checkout-manual-application.md). User application and prepared configuration inspection are complete; actual-session checks remain pending. Reviewing the CSVs did not rerun completed tests or change migration 009/preflight/postflight.

**Subsequent local recovery fix:** [Intent recovery](checkout-intent-recovery.md) prepares new migration 010 and implements durable resolution, a pinned replacement identity/quote and bounded expired-capability recovery. It is not applied remotely. The 009 acceptance record below is historical; do not replay it or its completed inspection.

Migration **`20261102000900_secure_checkout.sql`** was tested locally and subsequently **manually applied by the user** after preflight CSV (34) and ACL-resolution CSV (35). **Postflight CSV (36) is reviewed and accepted:** all eight configuration checks PASS and all nine baseline counts match. Do not replay 001–009 or repeat completed inspection/tests. Existing migrations were not edited. The 008 SHA256 remains `e29d4d0f61379fa4a3467a4a2aa20156606c0af1f704cbea8c42bbadd7a6408a`. The agent performed no remote writes, deployment, checkout enablement, notifications, commit or push. All readiness flags/public methods remain disabled; actual-session authorization and hosted integration remain pending.

## Order transaction and recovery

The backend issues a seven-day HMAC-signed guest capability with an unpredictable scope UUID. Customers cannot choose scopes or dashboard roles. Capabilities are bearer secrets; keep them out of URLs/logs/support messages. The browser persists capability, quote, UUID retry key and receipt in session storage. Delivery/contact details stay in memory. This is guest checkout, not Supabase Auth-session verification.

`checkout_quote` accepts only product ID, size, integer quantity and method identifier. The database sorts lines, rejects duplicates, and reads current PKR prices, active nonarchived **non-demo** products and active per-size inventory. Unknown/NULL stock is rejected, never unlimited. Quotes expire after ten minutes and do not reserve inventory. Creation rechecks stock.

Shipping uses locked database settings. Unconfigured shipping blocks orders; explicit free delivery charges zero; explicit flat rate charges the exact nonnegative paisa fee. Coverage remains Pakistan. A changed settings revision or quoted name/price requires a fresh quote before an unsubmitted purchase. Submitted prices, shipping, totals, tax, discounts and paid claims are not accepted. Tax policy was not supplied: operational `zero_tax_reviewed` starts false, so zero tax is not silently approved. No discounts or commissions are implemented.

`checkout_create` serializes scope/retry identity with a transaction advisory lock, then locks quote, readiness/settings, ascending parent products and ascending variants. Parent locks precede the existing variant revision trigger. It rechecks the quote and atomically decrements stock and inserts order, immutable item/amount snapshots, private delivery details, retry identity, checkout context and generated history. Orders start pending/unpaid. Identical retries return the saved receipt even after expiry/intake shutdown. Changed canonical delivery details/quote with the same key conflict. A consumed quote cannot create a second order under a new key.

The Edge handler uses fixed POST RPC requests and never forwards customer headers, `Prefer`, SQL or arbitrary DB errors. PostgREST runs each request in a transaction; failures roll back. A second independent `checkout_recover` request must see the same committed order before returning `confirmed: true`. See [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html) and [PostgreSQL locks](https://www.postgresql.org/docs/18/explicit-locking.html). Actual hosted HTTP/commit/deferred-constraint behavior remains a separate integration check.

The browser durably stores its retry intent before sending; storage failure blocks submission. Rejection, timeout, malformed receipt or uncertain commit preserves cart/key. A not-found recovery does not discard identity: another attempt could still commit. Only a matching confirmed receipt permits cart consumption. Unchanged purchased lines clear; new/edited lines remain. A durable receipt marker prevents consuming again after reload. A crash between marker and cart write conservatively retains the cart. Confirmed purchases can explicitly start another order.

The local 010 follow-up adds **Resolve saved checkout**: committed attempts recover their receipt; uncommitted attempts are durably closed under the creator's locks, and the client saves a server-assigned replacement identity before proceeding. Lost responses and another tab reuse one pinned key/quote. The bag is preserved, and no momentary missing row or browser-storage clearing authorizes restart. Re-entered details retry the original canonical identity. Missing credentials or tokens beyond the bounded recovery window still need an authenticated operational process. See [the implementation and new tests](checkout-intent-recovery.md); remote application and hosted acceptance of 010 remain pending.

## Payment and privacy

Private readiness seeds `enabled`, `cod_ready`, both wallet manual-handling flags and `zero_tax_reviewed` **false**. No application role, including service role, can read/write that table. Owner enabled flags cannot change these operational gates. Each method needs both gates, configured shipping and approved nonempty policy/instructions; wallets also need configured title/number. No account details, delivery times, exchange/refund terms or tax approval were invented.

COD starts unpaid. Wallets use `manual_wallet` handling and start unpaid. Customer assertions never mark payments paid; automatic verification does not exist. An authorized manual verification/reconciliation/status-management workflow is still needed before wallet readiness. Never supply PINs, OTPs, passwords or wallet login credentials.

Only service role can execute the four public checkout RPCs. Anonymous/authenticated/Partner/unassigned roles cannot invoke them or directly write orders/settings/stock. Existing report RLS remains: Partner gets report-safe amounts/statuses; customer/items/history stay Owner-only. New immutable `order_checkout_details` is Owner-only, snapshotting method, handling, shipping mode, settings revision, approved wording and wallet account context. Notification recipients are never read, copied or published.

Owner retrieves saved orders in the existing Orders screen. **Load checkout context** in private details makes an explicit order-scoped read with live Owner checks before/after response. Neither private table is accessed during static generation.

## Static export and backend preparation

Next remains `output: "export"`; hosting/routes stay unchanged. Public settings still return `checkout_enabled: false`, `available_payment_methods: []`. Default checkout stays closed; query parameters cannot unlock it. Public contacts, approved wording and **shipping text require rebuilding and publishing** after saves. Previously published text remains until publication; order creation independently uses fresh database settings.

Only local UI opt-in: `BATOOL_LOCAL_CHECKOUT_URL`, an explicit HTTP loopback origin/port without credentials/path/query. The page itself must be loopback. Live endpoints are rejected. Omit it from production builds. Demo snapshots are display-only: the real backend rejects demo merchandise; disposable SQL fixtures use non-demo synthetic products.

Prepared, undeployed entrypoint: `supabase/functions/secure-checkout/index.ts`. Server-only configuration names: platform `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, separately generated >=32-byte `BATOOL_CHECKOUT_SCOPE_SECRET`, exact comma-separated `BATOOL_CHECKOUT_ORIGINS`, explicit `BATOOL_CHECKOUT_ENABLED`. Missing configuration fails closed. These are names, not a request to share values. Never expose elevated keys/scope secrets through Next. Scoped recovery remains available with intake off.

The handler bounds JSON streams to 16 KiB, rejects extra top-level fields, restricts origins, applies timeouts/sanitized errors and DB-backed keyed-address limits (30/minute) plus global ceiling (120/minute). Invented addresses/scopes cannot evade the global ceiling. Hosted forwarding-header trust, realistic abuse capacity, secret rotation/recovery, retention and cleanup need review. Consumed quotes participate in recovery; do not prune them as expired unused quotes.

## Manual migration review

**Completed historical sequence:** CSVs (34)/(35), user application success, then accepted CSV (36). Do not repeat the steps below; the files remain the preparation/configuration record.

Never use remote fixture suites, `db reset`, folder replay or automatic remote migration application.

1. Run the **entire** [combined read-only preflight](../supabase/tests/secure_checkout_preflight.sql) as trusted SQL administrator; review every labeled result. Seven rows should PASS; row 07 is the saved count baseline. STOP means stop; REVIEW requires resolving default ACLs. It prints metadata/counts and public closure, never private settings.
2. **After reviewing those results**, manually apply the entire exact [20261102000900_secure_checkout.sql](../supabase/migrations/20261102000900_secure_checkout.sql) in one SQL Editor execution. It contains BEGIN/COMMIT and seeds disabled readiness. Do not replay 001–008. This is prepared user guidance; the agent has not applied it remotely. Reconcile any separately maintained migration ledger deliberately; SQL Editor execution must not be assumed to register it automatically.
3. Run the **entire** [combined read-only postflight](../supabase/tests/secure_checkout_postflight.sql). Eight configuration rows should PASS; row 07 counts must match preflight. It checks grants/source fingerprints, Owner RLS/triggers, disabled readiness, public closure and unchanged counts without printing private values.

`node scripts/prepare-checkout-review.mjs` regenerates seven function-body fingerprints from the exact migration without DB/environment access. Migration 009 SHA256: `a9050cf3209f95fe33cfd4f021cc94eeaf2e4e09fbce5449a669532ded089eaf`.

## Executed checks — November 2, 2026

The prior 143-test batch, settings SQL/UI suite, order-foundation suite and product-draft suite were **not repeated**.

- **15 new Node tests passed:** exact/tampered amounts, loopback gate, key reuse, unconfirmed receipts, storage failure, cart preservation, reload recovery, changed lines, double click, forged/expired scopes, intake gate, origin/body/claim validation, new-intent handling and independent commit proof. Quote/receipt/line objects reject extra fields, including private canaries. HTTP/RPC fixtures are synthetic. This new batch was rerun after tightening those response allowlists; legacy suites were not repeated.
- **2 new Owner reader tests passed:** scoped projection, pre/post access checks and Partner/unassigned/signed-out/demoted mock denial. These are not actual Auth sessions.
- `npm.cmd run typecheck` passed after adding the handler/Owner tests. Preview build checked TypeScript after final form/client changes.
- `deno check --no-remote supabase/functions/secure-checkout/index.ts` **passed**. Types/imports only; not hosted bundling/runtime.
- New PostgreSQL 18.4 preflight/postflight **passed**, unchanged baseline. Migration 009 applied only inside the owned disposable cluster.
- Rollback SQL batch **passed**: price-field tampering/change, Unknown/insufficient stock, injected late failure after writes, exact multi-line totals, unconfigured/free/flat shipping and immutable history, duplicate/mismatched retries, quote/scope isolation, service/browser grants, populated Owner/Partner/unassigned/anonymous-claim isolation and unpaid wallet handling. Fixture rollback verified before concurrency setup.
- Independent-session SQL concurrency **passed**: last-unit contention (one commit/one stock rejection), simultaneous identical retries (one order/decrement), retry after rollback (no orphan/extra stock). Advisory barriers established overlap for contention/identical retries.
- SQL logs: ignored `.tmp/checkout-pg-1793618382771/`, including batch and pre/postflight logs. Runner stopped its loopback cluster in `finally`. Remote BATOOL data preserved. Auth/Storage used stubs, not hosted services.
- Preview build **passed**, all 17 static pages, explicit demo/synthetic public configuration and loopback endpoint; no remote catalog/settings load.
- Preview browser **passed**: quoted totals, bag preserved pending/rejection, same-key retry, clearing after confirmation and receipt reload without resubmission. Synthetic intercepted HTTP only; zero unexpected external attempts/script errors. Server/browser closed.

- **Final default export passed**, all 17 static pages, demo/synthetic public configuration and no preview endpoint. Final browser verification confirmed checkout closed, no customer form, zero external checkout attempts and zero script errors. A bounded scan of 101 exported text artifacts found no preview URL, private fixture canaries or elevated-key-prefix literals; this is not a universal privacy proof. Server/browser closed. `git diff --check` passed.

Reproduce new checks only:

```powershell
node --experimental-strip-types --test tests/secure-checkout.test.ts tests/checkout-owner.test.ts
node scripts/test-business-settings-local.mjs --postgres-bin 'C:/Program Files/PostgreSQL/18/bin' --checkout
```

The runner takes a local binary directory, no DB URL; creates an owned `.tmp` cluster; binds loopback/ephemeral port; supplies Auth/Storage stubs; omits seed 002; applies required schema locally; runs only new checkout checks; stops the cluster. The environment is disposable and compatible. Previously blocked order/draft suites already passed in the earlier task and were not rerun.

Browser: set `BATOOL_PLAYWRIGHT_MODULE` to installed module, build an explicit `http://127.0.0.1:43179` preview, run `node tests/secure-checkout.browser.mjs --preview`. Rebuild **without** the local endpoint, run without `--preview` for final closure. Scripts own/close isolated browser and loopback server and intercept non-static requests; no real customer/session data is used.

## Launch blockers

- Migration preparation/application/configuration inspection is complete on user CSVs (34)–(36). No repeat migration or inspection is needed. This clears only that preparation blocker, not launch or actual-session authorization. The agent performed no remote application.
- Approve real saleable merchandise and known per-size stock. Demo merchandise is rejected. Owner draft `is_demo` is deliberately immutable; a separately reviewed promotion workflow is needed.
- Owner must configure shipping, real payment details and approved wording; operational tax treatment needs review. No delivery/refund/exchange terms were assumed.
- COD handling and manual wallet verification/reconciliation/status workflow need review/implementation before readiness. All readiness flags/public methods remain disabled.
- The expired/conflicted-intent code fix is implemented locally in prepared migration 010; its reviewed application and hosted acceptance remain pending. Complete retention/cleanup/abuse, credential-loss recovery and hosted secret/origin/header review. Notification delivery remains unimplemented; no messages/emails were sent.
- **Pending:** disposable Supabase Edge/PostgREST end-to-end commit, deferred-constraint and retry/recovery integration. Deno checking, standalone SQL and mocked HTTP/browser checks are distinct evidence.
- **Pending:** populated actual Owner/Partner/unassigned/anonymous/revoked-session authorization unless separately executed. Prior user-confirmed empty Owner observations remain historical and were not repeated.
- Live UI/readiness integration, rebuild/publication and deployment need separate authorization. Existing catalog/image-validator blockers remain applicable; hosting is unchanged.
