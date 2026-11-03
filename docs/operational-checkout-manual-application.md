# Migration 012 — staged manual BATOOL review

Status: **BATOOL 012 manual application and postflight are accepted** on user-supplied evidence. CSV (41) passed all three preflight checks; the user reported success, and CSV (42) passed all four postflight checks. All eight baseline counts match: products 7, variants 28; orders/items/keys/customers/history/context each 0. The checked private-table/RPC restrictions and closed database readiness/recovery gates passed; recovery fixture tables are empty. This is metadata/count evidence, not production runtime, stock-quantity checksum or actual-session verification. Migrations **001–012 are accepted and must not be replayed**. No production query, mutation, fixture, deployment, email, commit or push was executed by tools in this review. Completed suites were not rerun; migration/application source is unchanged.

Use the [single remaining launch checklist](checkout-launch-checklist.md). The manual sequence below is a historical audit record; **do not repeat it**.

Exact file: `supabase/migrations/20261102001200_operational_checkout_recovery.sql`.

SHA256: `4ab5c68e2b026a8c124eb774253a3b8414f6e951080e7d212c52d6251808943d`.

## Review conclusion

012 is a transactional, forward-only schema/RPC change with a five-second lock timeout. It requires postgres, the accepted SECURITY DEFINER order checker and 010's resolver. It creates four new RLS-enabled private tables, one disabled recovery-controls record, immutable audit/escrow triggers and new narrow RPCs. It does not update existing orders, items, customers, keys, history, checkout details, products, variants, stock quantities, settings or checkout/payment readiness. It neither creates an order nor backfills old retry identities. Order-time price/shipping snapshots and all earlier order/stock protections remain intact. Normal recovery use can retire an uncommitted quote; installation itself invokes no recovery operation.

Raw escrow/cases/audit/controls and the audit sequence have no grants to PUBLIC, anon, authenticated or service_role. Private helpers also revoke application execution. Four guest-backend RPCs are service-only. The three Owner RPCs grant authenticated execution but enforce current Owner mapping, nonanonymous identity and a matching live Auth session internally. Their SECURITY DEFINER functions use an empty search path. Owner case views omit claim proofs and original retry keys. Administrators remain trusted; RLS/revokes do not prevent a database administrator from accessing private data.

Raw original retry keys are intentionally escrowed only in the protected database table; this is sensitive credential retention, not encrypted application escrow. Approve restricted administrator/backup access and retention before activation. Audit/escrow updates/deletes are rejected by triggers. Installing this schema is not approval of the manual requester-verification policy or permission to enable recovery/intake.

Resolution locks the case, then reuses 010's scope/key advisory lock and quote lock; it waits for an in-flight creator before permitting retirement. Committed orders are recovered; only an uncommitted original can obtain the existing pinned replacement identity. Case revisions guard verification/resolution, and completed-case retries return the saved outcome. The backend separately reads the durable resolution before returning a replacement capability. Missing original identity escalates instead of permitting replacement. These conclusions are source review plus previously recorded disposable evidence, not a new production authorization or runtime test.

## Historical step — combined read-only preflight (accepted CSV 41)

Run the **entire** [prepared preflight](../supabase/tests/operational_recovery_preflight.sql) in BATOOL's SQL editor as postgres. It uses one repeatable-read, read-only transaction and rolls back. It reads metadata, aggregate counts and public closure only; it invokes no mutation or recovery RPC and prints no private settings, credentials or customer rows.

| Row | Expected |
| --- | --- |
| 01 accepted 011 prerequisite | PASS: postgres, SECURITY DEFINER checker present and accepted resolver present |
| 02 new migration absent | PASS: the checked new recovery objects do not exist |
| 03 existing gates closed | PASS: five operational flags off, public checkout false and methods empty |
| 04 baseline counts | Save all eight values: orders, items, keys, customers, history, context, products, variants. Do not assume values or zeros. |

Return all four rows for review. Any STOP, error or missing row holds application. A PASS is a prerequisite check, not a full re-verification of 001–011, hosted checkout or authorization. Counts do not independently checksum every stock quantity or order field; source review establishes that this migration performs no writes to those existing tables.

Preflight review and the subsequent one-time manual application are complete. **Do not apply 012 again.**

## Historical step — combined read-only postflight (accepted CSV 42)

The [single combined read-only postflight](../supabase/tests/operational_recovery_postflight.sql) is prepared. After confirmed application, rows 01–04 should PASS (protected recovery tables, checked RPC boundaries, all gates closed, no operational fixture rows); row 05 must equal the eight-count preflight baseline. It invokes only metadata/aggregate reads and the read-only availability projection. No fixtures or Owner/recovery mutations belong in BATOOL. It is metadata/count evidence, not a replacement for actual-session/hosted verification.

That postflight is accepted. Remaining configuration, deployment/publication, verification and business/operational approvals are consolidated in the [current launch checklist](checkout-launch-checklist.md). Keep every checkout/payment/recovery gate closed. Public text or build configuration changes still require separately authorized rebuilding/publishing of the static export.

## Known code gaps and limitations identified now

**Subsequent update:** items 1 and 5 below are historical findings now fixed by [the focused recovery/admission changes](checkout-gap-fixes.md). New 013 is pending manual BATOOL review/application; 012 itself is unchanged. Remaining decisions are consolidated in [the deployment plan](checkout-deployment-plan.md).

These do **not** require editing 012 to install its disabled schema. Address any selected fixes together in a later local implementation task; SQL changes after the already tested 012 require a new forward migration, not edits to accepted/applied files. Keep activation blocked until required fixes/decisions are complete.

1. **Committed-order input validation edge case.** `owner_verify_recovery` accepts any existing `public.orders` ID. `owner_resolve_recovery` then labels an order-bound case committed, but `checkout_support_result` requires a matching checkout quote to produce its receipt. A non-checkout foundation order therefore can become a committed case whose receipt exchange fails. Validate checkout-backed orders before verification, or explicitly support their receipt format, before offering that input path. This is a source-identified case, not an executed fixture test. It does not alter the order/stock or grant unauthorized access.
2. **Independent verification is manual.** The backend requires a live Owner, explicit attestation, opaque evidence/policy UUIDs and revision checks, but it does not validate an external evidence record or implement a customer contact challenge. Use an approved independent human-verification/evidence process, or implement a stronger verifier; a UUID/checkbox alone must not be treated as automated identity proof.
3. **Signing-key rotation and retention tooling.** Normal guest tokens have a single-key verifier; seamless multi-key rotation is absent. The approved operational route can reissue after independent verification where an exact original mapping exists, but cannot reconstruct old unescrowed keys or unknown identity. No reviewed automatic escrow/audit/consumed-quote archival or purge job is provided. Preserve required mappings until retention/recovery procedures are approved; never disable immutability or delete orders as cleanup.
4. **Older authorization policies.** Live-session denial is implemented for the new recovery RPCs. Older report/settings policies retain the previously observed issued-JWT window after logout. Approve that boundary or implement immediate per-session revocation there if required.
5. **Admission and gateway review.** The availability action returns before `checkout_admit`; it currently has no application-level admission check. Other guest actions use the existing keyed/global limiter, with the first forwarded-address header value as input. Decide the availability limit and verify the actual gateway's address-header trust before release. This is a source observation, not a claimed production exploit or completed hosted check.
6. **Wallet handling remains a separate feature.** Saved account details and recovery never verify a payment. The approved manual payment-verification/reconciliation/status workflow remains necessary before either wallet can be enabled; it is not required for an initial COD-only launch.

The changed hosted Edge bundle, new operational RPCs under actual anonymous Auth, and production-specific actual-session/UI/configuration checks remain **verification gaps**, distinct from the code items above. Prior disposable Auth/PostgREST and synthetic lock-barrier evidence is preserved in [the integration record](operational-checkout-integration.md); it has not been rerun or relabeled as production proof.
