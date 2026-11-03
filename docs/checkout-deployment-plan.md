# Concrete checkout deployment plan — prepared, not authorized for production

Current status: migration 013 manual application and postflight are accepted from the user success report and CSV (44). All three checks PASS; all eight counts match CSV (43): products 7, variants 28, six order-related tables 0. Migrations 001–013 must not be rerun. Historical references below to pending 013 or its application sequence are completed records, not remaining actions. Production actual-session/runtime verification, deployment/publication and release approval remain pending. See checkout-013-manual-application.md and checkout-launch-approvals.md.

Production remains untouched. User confirmed **only** `https://batool-lake.vercel.app`; exclude the old chatgpt.site origin. No custom domain is confirmed. Canonical/layout metadata now uses this origin locally; home/product/help canonical paths were checked in the new static export. Existing noindex behavior is unchanged.

## Exact targets and artifacts

| Item | Exact target / value |
| --- | --- |
| Production Supabase project | **`cydnirqrsjrlljrjfidq`**, matched to existing local public configuration |
| Production function | **`secure-checkout` only** |
| Production endpoint | `https://cydnirqrsjrlljrjfidq.supabase.co/functions/v1/secure-checkout` |
| Production allowlist | **`https://batool-lake.vercel.app` only**; no wildcard, localhost, chatgpt.site or unconfirmed custom domain |
| Storefront | Existing `https://batool-lake.vercel.app` static hosting, `output: "export"`; no hosting migration |
| Function setting | `verify_jwt=false`: guest HMAC scopes/case proofs are validated in the handler; Owner operations use authenticated PostgREST RPCs with live-session/current-role checks |
| Function source | `supabase/functions/secure-checkout/index.ts`, reviewed local contracts/availability/handler imports |
| Prepared deployment artifact | `.tmp/production-checkout/secure-checkout.bundle.ts`, multipart source entrypoint **`index.ts`**; source hashes/target in sibling `deployment-plan.json` |
| New pending production migration | **`20261102001300_checkout_recovery_order_validation.sql`**; accepted 001–012 must not be replayed |
| 013 SHA256 | `3f1fa81903caec6c5204de794032de08381c414b0bfb554c3ecced41b96aa1dc` |
| Function bundle SHA256 | `0a429f7c2957adf8add55ad4086c9182e431a803d268e75c2238252d3ee61f4b` |
| Disposable verification target | **`jcbxxgjrnkhgcspbscgb`**, endpoint `https://jcbxxgjrnkhgcspbscgb.supabase.co/functions/v1/secure-checkout`; isolated allowed origin `http://127.0.0.1:43871` |

The disposable origin/secret/fixture scripts must never be copied into the production configuration. Source changes invalidate these hashes and require regenerating the reviewed bundle/manifest before any deployment. The local preparer makes no remote requests.

## Configuration names and initial closed state

| Layer | Configuration | Initial state / handling |
| --- | --- | --- |
| Server platform | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Platform production project URL and **legacy service-role JWT** used only server-side by this entrypoint; test helper Secret-key compatibility does not change this bearer transport |
| Server secret | `BATOOL_CHECKOUT_SCOPE_SECRET` | Production-only durable random secret, at least 32 bytes; retain safely, never reuse disposable secret, print or embed it in the export |
| Server origin | `BATOOL_CHECKOUT_ORIGINS` | Exactly `https://batool-lake.vercel.app` |
| Server release | `BATOOL_CHECKOUT_ENABLED`, `BATOOL_RECOVERY_ENABLED` | Both **`false`** for deployment/config verification |
| Build inputs | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CATALOG_SOURCE` | Production URL, publishable key only, `supabase`; no elevated secret in Next configuration |
| Build endpoint | `BATOOL_CHECKOUT_ENDPOINT` | Exact production endpoint above |
| Build release | `BATOOL_CHECKOUT_RELEASE`, `BATOOL_RECOVERY_RELEASE` | Both **`false`** for initial publication |
| Local test seam | `BATOOL_LOCAL_CHECKOUT_URL` | Omit from production builds |
| Database checkout gates | `batool_checkout_internal.readiness`: `enabled`, `cod_ready`, `easypaisa_manual_ready`, `jazzcash_manual_ready`, `zero_tax_reviewed` | All **false** |
| Database recovery gates | `batool_checkout_internal.recovery_controls.enabled`, `verification_policy_ref` | **false**, **null** until the independent verification procedure is approved |
| Owner payment preferences | `cod_enabled`, `easypaisa_enabled`, `jazzcash_enabled` | Off until a separately approved method release; account details alone never enable handling or prove payment |

No new trusted-address-header variable is required: the changed handler consumes **no** forwarded/client-address header. Server-selected HMAC cohorts share the existing database limiter: availability **30 requests/minute across all clients**, checkout/recovery **30 requests/minute across all clients**, plus the existing **120/minute global ceiling**. This is a conservative abuse defense, not a per-shopper quota. Requests rejected by a cohort still count toward the global ceiling; high traffic/abuse can throttle recovery. Approve capacity or implement a separately reviewed stronger gateway/per-client design before live intake. No caller field can select a new bucket, and no address reaches storage/logs.

## Ordered production change plan — requires separate approval

1. Review exact new 013 and [combined read-only preflight](../supabase/tests/recovery_order_validation_preflight.sql). Review user results before one manual application of only 013, then accept [combined read-only postflight](../supabase/tests/recovery_order_validation_postflight.sql) with unchanged baseline counts and closed gates. Do not replay 001–012. SQL Editor execution is not assumed to register migration history automatically.
2. Obtain a separate approval for this production backend deployment. Before writing, privately retain the actual currently deployed function artifact/metadata, initial flag state and approved signing-secret backup; if no production function exists, record that instead of inventing a prior version. Only `secure-checkout` changes; `validate-product-image`, Auth users/providers, tables/settings/stock and other functions are outside deployment scope. The [official function-body retrieval API](https://supabase.com/docs/reference/api/v1-get-a-function-body) can back up an existing artifact; verify the returned artifact's format and restoration path before claiming rollback is ready. No production discovery request was made here.
3. Configure the server-only names above privately, initially with both server flags false, and deploy only the reviewed function/import graph or bundle, `verify_jwt=false`. Do not enable anonymous Auth for production guest checkout: this handler uses its own signed guest capability, not anonymous Auth sessions. Configure the sole production origin exactly. Confirm the deployed source/version rather than accepting a generic 200 from an older function.
4. Perform only separately approved production configuration/CORS/service-only RPC and actual-session/UI verification, keeping intake/payment/recovery off. No fixture orders, customer payload disclosure, recovery mutations or alteration of the existing Owner are authorized. Actual production commit/stock/retry behavior remains distinct from disposable evidence; any later real-order observation needs its own agreed scope.
5. Obtain separate static rebuild/publication approval. Use the production public build inputs, confirmed endpoint/origin and closed release flags above. Preserve current static hosting. Never publish the ignored synthetic/demo export generated for local checks. Public contact, approved wording/shipping text and build endpoint/release changes require rebuilding/publishing; database stock/prices/shipping remain authoritative on order creation.
6. Resolve the client decisions and consolidated blockers below, then seek **separate activation approval**. This plan does not approve enabling recovery, COD or wallets. Approved recovery handling must precede first intake. Keep original identities, cart and case evidence on uncertainty; unknown originals remain escalated with replacement blocked.

## Rollback and incident steps

- For this initially closed deployment, keep both backend flags false, both build release flags false, all database readiness/method/recovery gates off. Stop publication if runtime/source/config verification fails. Do not attempt to fix an incident by enabling another method.
- Restore only the reviewed previous function artifact/configuration, preserving its prior `verify_jwt` decision; if there was no prior function, leave intake disabled and remove the new function only under the agreed rollback authorization. In either case retain the disabled database schema. Re-verify the expected closed response and authorization boundaries.
- Restore the previous reviewed static release on the existing host if publication was separately performed. Cached public text can remain stale until rebuild/publication; it never authorizes prices/shipping or order creation.
- **Do not down-migrate, replay 001–012, delete orders/audit/escrow, disable RLS/triggers, change stock or rotate the signing key as rollback.** Migration 013 adds guarded wrappers without rewriting existing data; retain it and fix forward if necessary. It can safely remain with an older disabled function.
- Preserve orders, charged fee/price snapshots, retry/retirement mappings, original credentials and audit evidence. For a future live incident, closing new intake should retain a safe configured recovery route if that route is not implicated; the exact live-incident policy requires approval before activation. When recovery itself is unsafe/unconfirmed, keep it closed and escalate through verified support instead of issuing replacement purchases.
- Disposable-only backup of the prior deployed function body/metadata is retained in `.tmp/checkout-gap-fixes/previous-function-body.bin` and `previous-function-metadata.json`. It is **not** a production backup or authorization to deploy that old disposable artifact to BATOOL.

## Remaining client decisions and code blockers — one set

Use the [short approval sheet](checkout-launch-approvals.md) for the consolidated decisions. The local release-aware copy is now implemented; genuine catalog inputs, business approval, rebuild and publication remain pending. Shared 30/minute cohorts are recommended only for a capped pilot; unrestricted public intake remains blocked on a stronger approved capacity design.

1. Approve the shared admission capacity above, monitoring/abuse response, and acceptable service degradation under the global cap; or authorize a stronger gateway design. Address-header spoofing no longer supplies admission identity.
2. Approve an independent human requester-verification procedure, private evidence-record system, support channel and audit/escrow/quote retention. Current verification is a live Owner attestation plus opaque references; it does not automatically validate external evidence or contact ownership. Choose that manual model explicitly or authorize a stronger verifier.
3. Approve signing-key storage/recovery and rotation requirements. Seamless multi-key rotation and automatic archival/purge tooling are not implemented. Approve manual lifecycle procedures or authorize those code changes. New recovery RPCs check live sessions; choose whether older report/settings issued-JWT access after logout is acceptable or needs immediate session-check changes.
4. Approve genuine product/image/catalog readiness and known per-size inventory, Pakistan free/flat shipping, public support, policy/payment wording, tax treatment, COD fulfillment/cash reconciliation. Local home/product/help/bag copy now follows release wiring while retaining sample disclosures; it does not approve runtime availability or business terms. Existing noindex stays until SEO/indexing is approved. Static publication must use genuine catalog inputs, not the local synthetic export.
5. Complete remaining **production** configuration/actual-session/UI verification under an agreed nonfixture scope. The changed hosted Edge evidence is disposable-only. No automatic claim that production is tested follows from source/type checks or disposable results.
6. Wallets remain optional for initial COD. Before enabling either wallet, provide real Owner account configuration and implement/approve manual payment verification, reconciliation and status handling. Neither account storage, recovery nor a customer's claim marks payment paid. Automated notifications are optional when approved manual operations suffice.

Execution results for these fixes are recorded separately in [the focused fix record](checkout-gap-fixes.md). No secret values appear in this plan. No production write, production deployment, publication, email, commit or push is authorized or performed here.
