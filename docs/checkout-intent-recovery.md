# Checkout intent recovery — local implementation

Hosted update: [actual browser/Edge/PostgREST recovery and replacement acceptance now passes](hosted-checkout-acceptance.md) in the disposable project, alongside real-session Data API isolation. The run discovered a deferred-checker privilege bug fixed by new **011 only in that project**; BATOOL application of 011 is pending. Accepted 001–010 were not replayed. Production UI integration and operational lost-credential/out-of-window recovery remain pending. Historical hosted-pending statements below are superseded within this tested scope.

Update: the user has now manually applied migration 010 and its postflight is accepted. CSV (38) reports rows 01–05 PASS and all twelve counts unchanged from CSV (37). Checkout and every payment method remain disabled. See [accepted manual application record](checkout-recovery-manual-application.md). Statements below about pending remote application describe the original local preparation; that application blocker is now resolved. Hosted integration, actual-session authorization and operational recovery for lost credentials/expired capabilities remain pending. No migration or completed test was rerun for this acceptance.

Migration 009 and its user postflight remain accepted. They were not edited or reapplied to BATOOL. This change prepares **`20261102001000_checkout_intent_recovery.sql`**, not yet applied remotely, and updates the local client/prepared Edge handler. Checkout and COD/Easypaisa/JazzCash remain disabled. No remote writes, deployment, notifications, commit or push occurred.

## Customer behavior

**Check saved order** still looks up the original scope/key. A missing row is only an observation: it does not release the saved intent. **Resolve saved checkout** now waits for an in-flight creation and either recovers its committed receipt or durably retires the uncommitted attempt. It never cancels/deletes/changes a committed order or marks a payment paid.

The same operation can close an expired quote, a price/settings conflict, or an unexpired attempt the customer explicitly wants to restart. It is not limited to waiting out the ten-minute quote lifetime. An already committed order always wins for its original scope/key. A different key cannot retire a consumed quote.

On confirmed retirement, the client saves the returned replacement identity and refreshed scope before releasing its old intent. The bag is untouched. The customer reviews a new trusted quote and delivery details before another creation. One server-assigned replacement key and one pinned quote belong to each resolution. Two tabs, repeated clicks or lost responses cannot turn that resolution into independently keyed purchases. Different bag/method selections in another tab receive the already pinned quote; the client saves it for recovery but blocks placing a mismatched selection and offers resolution again.

An expired successor can itself be resolved into the next replacement. An older tab can recover the original successor DTO and resolve that exact key/quote to follow the same chain; it cannot reactivate a retired quote. Preserved finite expiry metadata is for displaying/recovering that old DTO, not permission to create an order.

Failures, timeouts, missing/malformed/mismatched proofs and failed session-storage writes preserve the old saved identity and bag. A lost resolve response is retried with the old identity and returns the same durable resolution. A lost replacement-quote response is retried using the saved resolution and returns its same quote/key. A lost replacement-create response recovers or retries the pinned scope/key without another deduction. Only a matching confirmed order receipt consumes unchanged purchased cart lines. Reloading a saved receipt does not consume them again.

## Database protocol

The new private `intent_resolutions` table stores resolution UUID, original scope/key hash/quote, original quote expiry and one replacement key/quote binding. Application roles have no schema/table grants. No customer delivery/contact data or notification recipients enter this table or its public response.

Migration 010 moves the **unchanged 009 creator body** into `batool_checkout_internal.create_order_v009`, revokes all application execution on it, and installs a guarded `public.checkout_create` with the same arguments/response. This is a new forward migration; applied migration files remain unchanged. Existing orders, amounts, settings, readiness and inventory are not rewritten during application. No quote is retired by merely applying the migration.

Creator and resolver take the same advisory transaction lock over scope/key, then the same quote row lock. The public creator rejects a retired key, retired quote, unbound replacement key, or replacement quote used with another key before calling the preserved atomic price/shipping/stock transaction. Quote locks also exclude a different key racing the same quote.

The resolver first checks committed identity under the lock. If committed, it returns that receipt. Otherwise it locks the scoped quote, refuses a consumed quote, inserts its durable retirement and sets that unconsumed quote expiry to `-infinity` atomically. The expiry write also protects stale snapshots/older code paths. If either write fails, both roll back. A transaction timeout or serialization failure is retriable recovery, never restart permission.

The replacement-quote RPC locks the assigned replacement key and resolution row. It binds a newly database-calculated quote once; later requests return that cached binding even if another tab supplies a different bag. The final creation wrapper checks both directions of that key/quote binding. Creating a new quote still requires configured shipping, readiness, approved text, valid merchandise and known inventory. No readiness gate was relaxed.

## Commit confirmation and guest capability limits

`checkout_resolve` returns an in-transaction outcome. Before returning a restart to the browser, the Edge handler performs a **separate HTTP transaction** through `checkout_resolution`. It must see a matching durable resolution ID/original quote/replacement key, or the matching committed order receipt. No-row, changed outcome, mismatched ID/key or mismatched receipt fails closed. This also prevents a database rollback preference or lost transaction from being mistaken for completed retirement.

Quote lifetime remains ten minutes. Scope tokens still authorize intake for seven days. The handler now accepts a cryptographically valid token for **recovery/resolve only for up to 30 days from issuance** (23 days beyond its intake expiry). An expired token cannot quote or create. Only a separately confirmed retirement permits issuing a fresh seven-day token for the **same original scope**. A committed resolution returns the existing receipt, not a replacement capability. After acknowledging a confirmed order, Start another order obtains a fresh scope for that independent purchase.

This is an explicit local recovery policy, not removal of token validation. Malformed/forged tokens, tokens beyond the recovery window and tokens invalidated by signing-secret loss/rotation remain denied. Missing browser intent/capability also cannot be guessed from customer information. An authenticated, privacy-preserving operational process for those credential-loss/out-of-window cases remains a launch responsibility. Do not ask customers to paste bearer tokens, keys or private delivery data into chat. Secrets must be durable/backend-only; review rotation/key retention before real intake.

Recovery and retirement can operate with new intake switched off. Replacement quotes/intake are still blocked by the Edge intake gate and database readiness checks. Saving wallet details or resolving an intent never verifies payment. All orders remain subject to existing unpaid/manual-verification behavior.

## Static export and application preparation

The form remains available only through the explicit loopback test endpoint and loopback page-origin checks. Default `/checkout/` stays closed; production URLs are rejected by the local-only configuration. Next remains `output: "export"`; hosting is unchanged. Public shipping/contact/policy text still requires rebuilding and publishing after Owner changes. No publication occurred.

New review artifacts are [010 preflight](../supabase/tests/checkout_recovery_preflight.sql) and [010 postflight](../supabase/tests/checkout_recovery_postflight.sql). They are combined read-only metadata/count/gate queries and call no mutation RPCs. They are prepared for a future separately authorized application, **not an instruction to write remotely now**. Do not rerun 009's accepted preflight, ACL lookup, migration or postflight.

The new preflight expects rows 01–06 PASS, row 07 saved baseline counts. It verifies the original 009 creator body/ownership, dependencies, new-name absence, relevant current-creator default ACLs and disabled gates. It deliberately scopes default-ACL review to the current creator, including the affected private schema, rather than flagging unrelated platform creators.

After a future reviewed application of only 010, its postflight expects rows 01–05 PASS and row 06 unchanged baseline counts. It verifies empty protected resolution storage, new service-only RPC boundaries, no application execution on the preserved private creator, five exact source bodies, and disabled readiness/public methods. 009's old source-fingerprint postflight is historical: 010 intentionally replaces its public creator with a wrapper, so **do not replay that old inspection to judge 010**.

`node scripts/prepare-checkout-recovery-review.mjs` regenerates source fingerprints without database/environment access. Prepared 010 SHA256: `3b95953ea06d299d54b10df7d0d7d91a42f2de948231b006adc9bae7cc4a6cf6`.

## Executed verification

Inspected the current client, prepared Edge handler, migration 009, accepted postflight record, recovery docs and local harness before editing. No accepted BATOOL migration/configuration check was repeated. The old foundation/draft/settings/checkout SQL suites were not rerun. Fresh disposable schema dependencies were installed only inside the owned new local cluster; this is not reapplication to BATOOL.

- New Node recovery tests: **14 passed**, covering committed recovery, durable retirement/reload, lost resolve/quote/create responses, storage failure, wrong/malformed/private-field proofs, exclusive in-flight client actions, pinned quote mismatch, independent commit proof, disabled intake and bounded expired-capability recovery/renewal.
- The **15 existing checkout Node tests** passed as targeted regressions because the shared client/handler/contracts changed. No full application test batch or unrelated Owner/draft/settings suite was run.
- New PostgreSQL 18.4 rollback batch: expiry, committed recovery while disabled, durable retirement, old-key/new-key rejection, wrong scope/identity, replacement binding, duplicate replacement submission, creator privilege boundary, injected resolution rollback, successor chains and public closure. The final batch passed, including the tightened guard rejecting a pinned replacement quote under a different key. Empty-fixture rollback was verified before concurrency setup.
- Five independent-session races passed in the first batch. Both holder advisory barriers and actual `pg_stat_activity` lock waits established overlap: creator commits before resolver; resolver commits before creator; creator rolls back before resolver; resolver rolls back before creator; another key competes for the same quote. Parallel resolve/quote/replacement-create retries and discarded committed responses produced one replacement order/decrement.
- `npm.cmd run typecheck` passed; preview production build passed TypeScript and exported all 17 pages.
- `deno check --no-remote supabase/functions/secure-checkout/index.ts` passed. Imports/types only; not hosted integration.
- New recovery browser mode passed with synthetic HTTP: preserves bag/intent during held resolution and failed proof, persists restart across reload, uses pinned replacement identity, preserves bag on a lost creation response and recovers the receipt without another create. Zero unexpected external attempts or browser script errors. Owned browser/server stopped.

- Final new 010 combined read-only preflight/postflight passed locally: all expected non-baseline rows PASS, all twelve baseline counts unchanged, five source fingerprints matched and all readiness/public gates disabled. The final rollback/concurrency batch passed and the owned cluster stopped. Logs: ignored `.tmp/recovery-pg-1793623783535/`, including `recovery-batch.log` and new pre/postflight logs. The first iteration used `.tmp/recovery-pg-1793623299896/`; only new recovery checks were rerun after the guard refinement.
- Final production build with the loopback endpoint removed passed, including TypeScript and all 17 static pages. Final browser check passed: default checkout closed, no customer form, zero external checkout attempts/script errors. A bounded scan of 101 exported text artifacts found no preview endpoint, private fixture canaries or elevated-key-prefix literals. This is bounded export evidence, not a universal privacy proof. Browser/server stopped.
- `git diff --check` passed. Applied migration 008 and 009 hashes remain unchanged (`e29d4d0f...` and `a9050cf3...`); 010 matches the SHA256 above. No applied migration file was edited, no remote accepted inspection repeated and no remote writes performed.

To run **new** database tests in the same disposable platform:

```powershell
node scripts/test-business-settings-local.mjs --postgres-bin 'C:/Program Files/PostgreSQL/18/bin' --recovery
```

The harness accepts only a local binary directory, never a DB URL. It owns an ignored `.tmp/recovery-pg-*` cluster on loopback/ephemeral port, uses minimal Auth/Storage stubs, installs schema prerequisites without demo seed 002, runs only new 010 review/recovery suites and stops the cluster in `finally`. Its fixtures temporarily enable handling inside that disposable cluster only. No BATOOL records, emails or payment services are touched.

Node: `node --experimental-strip-types --test tests/checkout-recovery.test.ts tests/secure-checkout.test.ts`. Browser: build an explicit loopback preview, set installed `BATOOL_PLAYWRIGHT_MODULE`, run `node tests/secure-checkout.browser.mjs --recovery`. Rebuild without the preview endpoint before final default-export verification. Tests use synthetic data; they do not establish real Auth sessions.

## Remaining launch blockers

The expired/uncommitted-intent code blocker is fixed locally. New 010 has not been applied remotely or accepted there. Required before first real order: review/apply/inspect 010 under separate authorization; genuine saleable merchandise/promotion/images and known stock; Owner shipping/approved COD wording/support route; tax decision; COD monitoring/fulfillment/cash procedure; retention/abuse/secret-rotation and credential-loss recovery operations; production UI/backend integration and public rebuild/publication. Public text remains static until a separately authorized publish.

**Actual-session authorization and hosted Edge/PostgREST integration remain pending.** Standalone PostgreSQL, mocked handler/browser responses and offline Deno checks do not establish those. A future disposable Supabase acceptance run must exercise the real gateway/service permissions, schema cache after moving the creator, signed-scope recovery/renewal, deferred commit, separate resolution proof, lost responses and concurrency. Do not create acceptance orders on BATOOL.

Wallet account details and authorized manual verification/reconciliation/status handling are required only before enabling each wallet. Automated private notifications and polished operational tooling can follow an initial COD launch where adequate manual procedures exist; the image-validator dependency remains conditional on the catalog/image workflow used. None is enabled here. The [existing classified handover](secure-checkout-manual-application.md) remains relevant except its previously missing automatic intent-resolution path is now implemented locally as described above.
