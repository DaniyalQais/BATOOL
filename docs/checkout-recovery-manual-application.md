# Migration 010 manual application review

Status: migration 010 application and read-only postflight accepted from the user's success report and `Supabase Snippet Untitled query (38).csv`. Postflight rows 01–05 are PASS; row 06 matches all twelve preflight counts. Preflight was accepted from `Supabase Snippet Untitled query (37).csv` (rows 01–06 PASS). Migrations 001–010 and their accepted verification must not be replayed. Checkout, COD, Easypaisa and JazzCash remain disabled. The staged instructions below are historical, not a request to run them again.

Accepted twelve-count baseline: `{"keys":0,"items":0,"orders":0,"quotes":0,"history":0,"products":7,"variants":28,"customers":0,"rate_windows":0,"notifications":1,"checkout_context":0,"business_settings":1}`. The CSV is evidence only; no SQL or tests were rerun to review it.

Accepted postflight establishes protected empty resolution storage, four service-only RPC boundaries, no application execution of the preserved private creator, matching five source fingerprints, and continued disabled readiness/public gates. This is metadata/count evidence; hosted integration, actual-session authorization and operational credential-loss/expired-capability recovery remain pending. No remote SQL or mutation tests were executed by the agent during acceptance.

Candidate: `supabase/migrations/20261102001000_checkout_intent_recovery.sql`.

Reviewed SHA256: `3b95953ea06d299d54b10df7d0d7d91a42f2de948231b006adc9bae7cc4a6cf6`.

## Safety review

- Requires accepted 009, its exact original creator owned by the applying administrator, private checkout schema, quote/recovery helpers, order identity/context tables and existing roles. Apply under the same `postgres` creator checked by preflight. Review any unexpected current-creator default grants before writing.
- One explicit transaction includes the table, function move/rename, wrappers and grants. A five-second lock timeout fails rather than indefinitely waiting for conflicting DDL/runtime locks. A failure is not permission to replay blindly: inspect the error and current state first.
- The unchanged 009 creator becomes a private helper without application execution. Four public RPCs are `SECURITY DEFINER` with empty search paths and service-role-only execution. The new table is in the already restricted private schema, with application table privileges revoked; its protection is schema/table permissions rather than a public RLS policy. Anonymous and authenticated clients cannot invoke the RPCs directly. This metadata boundary does not establish actual-session authorization.
- Creation and resolution take the same scope/key transaction advisory lock and scoped quote row lock. A committed order wins; a consumed quote cannot be retired under another key. Retirement and quote invalidation commit together. Timeout, rollback, serialization failure or an absent recovery row never authorizes restart.
- Unique original scope/key and quote constraints, one replacement key and a once-bound replacement quote prevent independent replacements on retries. Creation checks both directions of the replacement binding and rejects retired identities/quotes. Separate-transaction resolution confirmation is implemented in the prepared handler; hosted commit behavior remains unverified.
- Applying this migration does not retire existing quotes, insert orders, deduct stock, change stored order amounts, change business settings or enable readiness. Later explicit recovery calls can invalidate only an unconsumed quote. Existing immutable order/stock transaction logic and request-digest retry protection remain in the preserved 009 body. Saved orders and recovery records must not be removed to reset checkout.

## Stage 1 — run only the read-only preflight

In the intended BATOOL project SQL editor, under `postgres`, copy the **entire** [combined preflight](../supabase/tests/checkout_recovery_preflight.sql). It uses a repeatable-read, read-only transaction and ends with rollback. It calls no mutation RPC and outputs only metadata, availability flags and counts, not private settings or credentials.

| Label | Expected result |
| --- | --- |
| 01 context | PASS: postgres, read-only, replication origin |
| 02 preserved creator | PASS: exact original 009 creator body, security configuration and ownership |
| 03 dependencies | PASS: required tables, helpers and private-schema creation permission |
| 04 new names absent | PASS: 010 objects absent; no partial/prior application |
| 05 current-creator defaults | PASS: no unexpected custom-recipient defaults in affected scopes |
| 06 disabled gates | PASS: all five private readiness flags false, public checkout false, methods empty |
| 07 existing count baseline | Save all twelve counts for comparison; zero is not required |

Return all seven labeled rows for review. Any STOP, REVIEW, missing row or SQL error holds application. Do not run fixture suites, invoke checkout RPCs or replay earlier migrations to fix a result. Counts establish a baseline, not proof of every existing row's content.

## Stage 2 — await result review

Stage 1 results are accepted. In the same intended BATOOL project, as `postgres`, copy the entire candidate 010 above into a new SQL editor query and execute it once, unchanged, including its BEGIN and COMMIT. Do not apply a migration directory or replay 001–009. If the editor offers to append RLS statements, execute the original migration without appended RLS changes: the private table intentionally uses restricted schema/table permissions. A success message alone is not postflight acceptance. If application fails or the connection drops, inspect the state before any retry.

## Stage 3 — after confirmed application

After Stage 1 review and confirmed application, the prepared [combined read-only postflight](../supabase/tests/checkout_recovery_postflight.sql) is the single follow-up inspection. Do not run it before application. Expected: rows 01–05 PASS, row 06 matches all twelve saved preflight counts. It checks empty protected resolution storage, service-only RPC grants, private-helper isolation, five function-body fingerprints and continued closure. Unexpected activity or any mismatch needs review; do not modify records to force matching counts.

The accepted 009 postflight's original public-creator fingerprint is intentionally superseded by 010's wrapper; do not rerun it to assess 010.

## Verification limits and pending work

This preparation read local migration, recovery documentation and prepared SQL only. No SQL, completed tests, migration application, remote writes or availability changes were performed for this review. Earlier disposable recovery tests remain recorded in [checkout-intent-recovery.md](checkout-intent-recovery.md); they were not repeated.

Hosted Edge/PostgREST integration and actual-session authorization remain pending, including schema-cache refresh after moving the creator, service permissions, deferred commit and the separate durable resolution read. Operational recovery for missing browser credentials, lost/rotated signing secrets or capabilities beyond the 30-day recovery window remains pending. These cases do not permit an automatic replacement or asking customers to disclose bearer credentials. The local handler's seven-day intake / thirty-day recovery policy does not provide that operational process.

Static export and hosting are unchanged. Public shipping/contact/policy updates still require a separately authorized rebuild and publication. No deployment, email, commit, push or checkout/payment enablement is part of this handover.
