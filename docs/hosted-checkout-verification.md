# Hosted checkout and actual-session acceptance preparation

**2026-11-02 production update:** BATOOL migration 011 manual application and postflight CSV (40) are accepted after preflight CSV (39); all counts match and checkout/payment gates remain disabled. Do not repeat 001–011 or completed checks. The [production integration handover and operational recovery procedure](production-checkout-handover.md) now supersede older pending-011 statements and the runbook proposal below. The following setup history remains an audit record; disposable runtime/session evidence is not production verification.

**Current status:** [hosted checkout and actual-session Data API acceptance passed](hosted-checkout-acceptance.md) in disposable project `jcbxxgjrnkhgcspbscgb`, after a new deferred-checker fix **011 applied only there**. Edge/database/payment intake is off, anonymous Auth restored off, temporary users/roles zero; two immutable synthetic unpaid COD orders remain with exactly two stock deductions. BATOOL's accepted migrations 001–010 were not replayed or edited. New 011 is pending manual production review/application. Do not rerun completed checks or initialize this disposable project again.

Production storefront/dashboard UI integration and operational recovery for missing credentials/expired capabilities remain pending. Logout's retained-JWT boundary was observed explicitly; live role revocation denied access immediately. Earlier inventory/setup/pending statements below are historical; the linked acceptance record is authoritative for executed hosted/API checks, failures, continuations and cleanup. Synthetic SQL-role evidence remains separate from real Auth sessions.

Migrations 001–010 are accepted on BATOOL. Do not replay them or their completed tests. This is a new hosted acceptance plan, not a production launch. No hosted checkout or new Auth-session checks have yet been executed. Earlier SQL JWT/role simulation and mocked browser evidence remain synthetic; historical user-executed production Owner observations remain separately recorded in [orders-live-verification.md](orders-live-verification.md).

## Selected disposable target — awaiting configuration verification

The user supplied project reference **`jcbxxgjrnkhgcspbscgb`**. A local comparison confirms it differs from the BATOOL URL in `.env.local`; that comparison does not establish that the selected project is empty or disposable on the server. No hosted request was made. The proposed display name below remains a local acceptance label, not a verified dashboard name.

Prepared ignored `.tmp/hosted-acceptance/target.json` with that reference/URL and direct database host, plus ignored `.env.hosted.local` with empty secret fields. `schemaReadyThrough:null` and `noProductionData:false` deliberately keep execution blocked until the server's schema/data state is inspected. Do not change these flags merely to bypass the guard. The direct hostname is derived from the project reference, not connectivity-tested; use its verified session pooler if needed.

The exact proposed Edge deployment target is now `https://jcbxxgjrnkhgcspbscgb.supabase.co/functions/v1/secure-checkout` (CLI target `--project-ref jcbxxgjrnkhgcspbscgb`). Proposed changes remain: initialize the reviewed schema only if this is a new empty project, deploy only `secure-checkout`, configure its isolated scope secret/test-origin/intake settings, and run temporary COD/Auth fixtures there. No initialization, Auth configuration, secret changes or deployment has occurred. BATOOL and its existing Owner remain excluded.

Next setup: fill disposable publishable/admin keys and database password privately in `.env.hosted.local`, and provide an installed Playwright module path. Do not send their values in chat. Then perform the initial read-only target/schema/data inspection before permitting fixtures or deciding whether fresh schema provisioning is needed. Earlier prerequisite inventory below is historical; the target reference and local configuration scaffolds are now available, but credentials, schema/data verification and deployment remain pending.

### Read-only discovery after private credential setup

The user subsequently configured all three private credential fields. A new read-only discovery helper, `scripts/inspect-hosted-target.mjs`, permits inspection before schema readiness while retaining production exclusion, explicit ref confirmation and database binding. It cannot enable mutation readiness or run fixtures. Three new focused discovery-guard tests passed; the completed earlier suites were not rerun.

The sandbox-only attempt could not reach DNS/network services. A network-enabled read-only attempt against `jcbxxgjrnkhgcspbscgb` established:

- Public Auth settings GET: HTTP 200; email/password reported enabled. The probe did not report anonymous Auth enabled; its dashboard configuration still needs confirmation for the actual anonymous-session test.
- Admin Auth users GET using the privately configured service key: HTTP 200, valid users-list response, no first-page users. This establishes actual read-only admin-key acceptance, not any role-session test or database emptiness.
- `secure-checkout` OPTIONS: HTTP 404, no permitted-origin response. Hosted function availability remains pending; this is not a CORS denial pass.
- Direct database hostname: DNS resolution failed. No database SQL executed successfully and schema/data state remains unverified. The project's exact **session pooler hostname and port** are requested; do not guess its region or weaken TLS. Do not share a full connection string/password.

No migration, account creation, checkout fixture, secret change or deployment ran. Mutation flags in the manifest remain blocked. The diagnostic artifact is ignored `.tmp/hosted-acceptance/inspection.json`, containing only statuses/booleans/counts. Run the read-only inspector with private env configuration only; do not invoke the fixture runner to bypass this connectivity step.

Playwright was subsequently installed from the official npm registry into ignored `.tmp/hosted-tools` with install scripts disabled, and its module path configured privately. A matching browser cache is being prepared inside that ignored directory; no browser suite was run. Source dependencies/package files and the production export are unchanged. After receiving the verified Session pooler hostname, use `--database-only` on the new inspector to avoid repeating the completed HTTP availability checks; its results are written separately to `inspection-database.json`.

### Session-pooler / CA follow-up

The user supplied `aws-0-eu-west-1.pooler.supabase.com:5432`; the ignored target manifest now uses that host and `postgres.jcbxxgjrnkhgcspbscgb`. The database-only inspection initially failed issuer trust with system roots. Supabase's [official Studio certificate configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json) identifies the production distribution URL as `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. That public CA was downloaded over verified HTTPS, checked for CA status, valid dates, Supabase identity and self-signature, saved in the ignored test folder and configured as `BATOOL_HOSTED_CA_FILE`. `sslmode=verify-full` was retained; no certificate or hostname checks were disabled. The apex-domain certificate URL returned 404 and was not used.

The next read-only attempt passed TLS but failed **database password authentication**. No schema/data SQL succeeded. Stop password retries until the user corrects the disposable database password privately; it must be the database password, not an API key/account password, and is passed as a raw password rather than a URL-encoded connection-string component. No password reset was performed. Completed HTTP checks were not repeated.

A browser-cache tooling link located an existing matching Playwright 1.61.1 / Chromium revision 1228. Private local configuration now uses that existing module/cache; filesystem verification confirms the matching Chromium executable exists. The unnecessary newer Chromium download was stopped. No browser test was launched. The extra package/cache files remain ignored; source package dependencies/export were not changed. Three new inspection-guard tests passed, and the new inspector's syntax check passed. Earlier completed test suites and migrations were not rerun.

Current missing prerequisites: valid disposable database authentication and subsequent empty-schema/data inspection, any required reviewed fresh-schema initialization, anonymous Auth configuration confirmation, and reviewed single-function deployment/secrets. Actual-session authorization and hosted checkout remain pending. Production checkout/payments and the existing Owner are unchanged.

### Completed fresh disposable initialization / next deployment setup

After the user's password correction, the pending database-only inventory passed (`read_only:true`, administrator, Auth users 0, public tables 0, no application tables/recovery functions/prior acceptance marker/custom Auth triggers). Completed HTTP probes were not repeated.

`scripts/prepare-disposable-hosted-schema.mjs` prepared ignored `initialize-disposable-schema.sql` and `schema-sources.json`. Nine accepted definition sources (001, 003–010) were combined into one transaction without modifying source files; demo seed 002 was excluded. The artifact rejects existing public tables, Auth users, Storage buckets/objects, BATOOL schemas, custom Auth triggers and unexpected current-creator default-ACL recipients. It seeds only canonical default settings/readiness and empty Storage buckets, not products, users, role mappings or orders. `scripts/initialize-disposable-hosted-schema.mjs` verified target/SQL/source hashes before applying it **once to the new empty disposable target**, then independently checked closure, emptiness and all five reviewed checkout body fingerprints. It marked only the ignored manifest's prerequisite flags ready. This first-time dependency setup did not rerun an accepted production migration or a completed fixture suite. Result: ignored `schema-initialization-result.json`. Never replay it on this target.

Source review caught and fixed a prepared hosted fixture inconsistency before execution: synthetic catalog ID now uses permitted legacy ID 0, is inserted inactive, receives all four active size variants, and is then activated under the existing guard. No product/activation constraints were disabled. The hosted batch remains unexecuted; this is a fixture preparation correction, not a new production catalog change.

`scripts/disposable-hosted-deployment.mjs --prepare` prepared ignored `secure-checkout.bundle.ts`, `deployment-plan.json` and a private scope-secret file. It inlines the actual contracts/shared handler/entrypoint without external imports or embedded credentials. The new single-file deployment artifact passed **offline Deno checking**; new initializer/deployment/runner syntax checks passed. No completed test suite or previous Deno check was repeated. Source/export configuration is unchanged.

The orchestrator's `--run` is bound to only `jcbxxgjrnkhgcspbscgb` and requires ready schema flags. It reads project identity/Auth configuration, rejects custom Auth hooks/CAPTCHA, sets test-only checkout secrets with intake initially off, temporarily enables anonymous Auth, deploys only `secure-checkout` with `verify_jwt:false`, enables disposable Edge intake, then waits for a valid gateway scope response before allowing fixture creation. It invokes the new hosted batch and finally disables disposable Edge intake and restores the original anonymous Auth setting, including on failure. The batch itself closes database gates and removes owned temporary Auth identities. Results are sanitized and kept in ignored files. Existing source three-file hashes and exact deployment changes are reviewable in `deployment-plan.json`.

Next missing setup: populate **`BATOOL_HOSTED_MANAGEMENT_TOKEN` privately in `.env.hosted.local`** with a short-lived [scoped Management API token](https://supabase.com/docs/reference/api/introduction) limited to the disposable project and required project identity, Edge deployment, secrets and Auth configuration permissions. Its empty slot is prepared. This is separate from `BATOOL_HOSTED_SERVICE_KEY`; never paste either value into chat. No Management API mutation or deployment has run. Once configured, the orchestrator can batch the remaining work:

```powershell
node --env-file=.env.hosted.local scripts/disposable-hosted-deployment.mjs --run
```

Do not rerun initialization or bypass a failed acceptance marker. On interrupted cleanup, the same orchestrator's `--disable` closes only the disposable Edge intake; inspect database/Auth cleanup separately before project deletion. Operational recovery for customer credential loss/expired capabilities remains a separate launch blocker.

## Available prerequisites and exact missing setup

Local inspection found Node, Deno, the installed Supabase JS SDK, PostgreSQL 18's `psql.exe`, cached Chromium/browser binaries, the prepared Edge handler, and the accepted schema/review artifacts. Docker executable exists but no running server is inferred. Supabase CLI was not found on PATH. No CLI link (`supabase/.temp/project-ref`) or process access token was found. No software was installed or started during this inventory.

`.env.local` contains only the existing catalog source, Supabase URL and public key. The new runner reads its URL solely to exclude production and never sends its key. No disposable target manifest, hosted-test credentials or Playwright module path is configured. Cached browser binaries alone are not an importable Playwright package.

Required setup, still missing:

1. A **new, empty disposable hosted Supabase project**, proposed exact display name `batool-checkout-acceptance-20261102`. Organization, region and resulting project reference/URL are not yet supplied. It must contain no production users/data. Never use BATOOL or a data-bearing branch/backup. There is no identified existing disposable hosted project.
2. The accepted schema through 010 provisioned **once in that new project**, without demo seed/data or synthetic SQL Auth stubs. Provisioning is a separate reviewed initialization of the new environment, not replay of BATOOL migrations. The runner never applies migrations or runs existing suites. If the instruction against rerunning migrations is intended to prohibit initializing a new project too, a compatible, already provisioned empty disposable project is required instead. Keep schema provisioning pending until target review; do not invoke a project-wide database push.
3. Actual Supabase Auth with email/password and anonymous sign-ins enabled **in the disposable project only**. Public email signup can remain disabled. The batch uses admin `createUser` with `email_confirm:true`, never invitations, signup confirmation or recovery emails. Four random-password temporary accounts plus one real anonymous Auth identity are created automatically. No credentials are solicited in chat, source, shell arguments or browser UI. Disable any custom Auth webhooks/triggers/integrations that could send messages; a default isolated project is expected.
4. Deploy exactly **`secure-checkout`** and its local shared/contracts dependencies to that new project, with gateway `verify_jwt=false` as in `supabase/config.toml`. No image-validator function, storefront, existing hosting, production secrets or production deployment changes. The endpoint will be `https://<disposable-ref>.supabase.co/functions/v1/secure-checkout`. Use an explicitly targeted CLI deployment (`--project-ref <disposable-ref>`), only after target/change review; do not link the workspace to production or deploy all functions.
5. Disposable Edge secrets: `BATOOL_CHECKOUT_ENABLED=true`, `BATOOL_CHECKOUT_ORIGINS=http://127.0.0.1:43871`, and a new backend-only random `BATOOL_CHECKOUT_SCOPE_SECRET` of at least 32 bytes. The function uses platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not copy production scope secrets. After the run, switch disposable Edge intake off and then delete the whole disposable project after reviewing evidence.
6. Private local configuration: copy [the target template](../scripts/hosted-verification-target.example.json) to ignored `.tmp/hosted-acceptance/target.json`; fill its disposable reference/URL and matching database host/user. Configure the variables below through a private ignored env file or process environment, never chat or command-line secret values. A separate project-confirmation variable must exactly match the manifest reference. The runner validates these before any network access.

| Variable | Purpose |
| --- | --- |
| `BATOOL_HOSTED_CONFIRM_REF` | Explicit disposable project reference |
| `BATOOL_HOSTED_PUBLISHABLE_KEY` | Disposable public API key |
| `BATOOL_HOSTED_SERVICE_KEY` | Disposable server-only administration key; never enters browser |
| `BATOOL_HOSTED_DB_PASSWORD` | Disposable database password; passed to psql through environment only |
| `BATOOL_PLAYWRIGHT_MODULE` | Absolute installed Playwright `index.mjs` path; matching browser required |
| `BATOOL_HOSTED_PSQL` | Optional override for PostgreSQL 18 client path |
| `BATOOL_HOSTED_CA_FILE` | Optional trusted CA bundle; default PostgreSQL `system` trust, always `verify-full` |

Direct database host must be `db.<ref>.supabase.co`, user `postgres`, port 5432. If IPv6 is unavailable, use the project's exact session-pooler hostname (`aws-….pooler.supabase.com`), user `postgres.<ref>`, port 5432. Transaction pooler port 6543 and cross-project connections are rejected. Database certificates must validate; do not disable TLS verification to work around connectivity.

## Prepared scripts and execution boundaries

[verify-hosted-checkout.mjs](../scripts/verify-hosted-checkout.mjs) defaults to `--check`: local prerequisites only, no network. This can run now:

```powershell
node scripts/verify-hosted-checkout.mjs --check
```

Once private configuration exists, inspect it without remote calls:

```powershell
node --env-file=.env.hosted.local scripts/verify-hosted-checkout.mjs --check .tmp/hosted-acceptance/target.json
```

**Do not run the following until the exact disposable reference, provisioning and deployment changes have been reviewed.** After review, the new acceptance batch is:

```powershell
node --env-file=.env.hosted.local scripts/verify-hosted-checkout.mjs --run .tmp/hosted-acceptance/target.json
```

The guard rejects BATOOL's URL, unknown/non-disposable targets, ref/URL/database mismatches, absent explicit confirmation and an unreviewed schema designation. The database must be empty of Auth users, products, orders, roles, quotes and resolutions; all readiness flags must initially be false. A private single-run marker prevents replay on a previously used target. It will not clean/reseed or silently reuse a failed run. Existing immutable order triggers are retained; delete the **whole disposable project**, not order rows, to dispose of fixtures. A new run needs another reviewed empty target.

The only localhost hosting is a test harness on `http://127.0.0.1:43871`. It serves type-stripped copies of the actual checkout client/contracts without building or changing the production export. Browser fetches go **directly to the real hosted Edge Function**, which calls real PostgREST/database. No proxy or mocked HTTP responses are used. Response-loss tests deliberately discard successful real responses before giving them to the client; this tests the ambiguous-response state, not a physical packet-loss simulation. Concurrency uses parallel real HTTP requests; earlier SQL barrier tests are not rerun or relabeled as hosted tests.

The batch temporarily enables **COD only inside the disposable database** using synthetic approved instructions/policy and a synthetic flat shipping fee. Wallet gates/details remain off. It checks:

- Trusted quote amounts; a committed complete unpaid order and one size-stock deduction; cart retention on a discarded creation response, reload recovery, matching receipt confirmation and no repeated cart consumption.
- Parallel same-key creation retries, committed-order resolution, another scope's inability to recover the order, and unchanged order/stock counts.
- A database-expired uncommitted quote, failed placement with cart retained, durable resolution, lost resolve response retry, pinned replacement quote after a discarded response, parallel replacement submissions and replacement-order recovery. Final expected counts: two complete unpaid orders and stock 5 → 3.
- Actual browser allowed-origin preflight and request success; real forbidden-origin browser rejection plus direct forbidden OPTIONS/POST status 403 without allow-origin. CORS is browser policy, not a substitute for scope validation or database permissions.
- All seven checkout RPCs reject publishable-only and actual Owner/Partner/unassigned/anonymous-Auth/revoked-candidate sessions with object-permission `42501`; missing endpoints, invalid JWTs and network errors are failures, not denial passes.
- Owner settings save and revision conflict, private recipient save, exact public DTO allowlist, direct settings/role/order write denial, and populated reads/embeds under actual sessions.

The temporary Owner's settings and synthetic private recipient values stay in memory. Node logs and ignored result JSON contain fixed check labels/statuses only, never raw provider errors, row contents, identities, passwords, tokens, keys or headers. Browser tracing, HAR, video, screenshots and console/body logging are not enabled. A failed assertion stops the batch; successful preceding labels do not establish an overall pass. Results include `complete:false` on failure. Do not share raw database/provider/browser diagnostics.

Local preparation checks actually executed: **nine new target-guard tests passed** (`node --test tests/hosted-verification-guard.test.mjs`); syntax checks of the new hosted runner passed, including after its final changes; the default local-only `--check` reported all five required variables and the target manifest missing, with PostgreSQL client present, and exited not-ready as designed. `git diff --check` passed with existing Windows line-ending notices. No completed local suite, migration, SQL query, browser test, hosted request, Auth provisioning or deployment was run. The new harness itself is prepared and syntax-checked, not end-to-end validated. Its actual hosted/real-session outcomes remain pending.

Finally, the runner closes all disposable database readiness flags and method preferences, signs out/deletes only its newly created Auth users, and stops its browser/localhost servers. It verifies database closure but cannot change the deployed Edge environment; **the operator must disable disposable Edge intake**. If cleanup is unconfirmed, do that first and dispose of the project after evidence review. A lost administrator-create response may leave an untracked temporary user; project deletion is the definitive cleanup. No original Owner can exist in the required empty fixture target.

## Actual-session authorization expectations

These are **prepared**, not executed results. The batch uses real Auth-issued sessions with `getUser` verification and HTTP Data API requests, not SQL `set role`/invented claims. It does not repeat completed production Owner UI checks or claim the full dashboard UI has been tested against the new target.

| Identity | Reports | Items/customer/history/checkout context | Raw settings/private recipients | Settings saves |
| --- | --- | --- | --- | --- |
| Temporary Owner | Both fixture orders | Populated rows permitted; customer fields positively checked in memory | One row each | Valid revision succeeds; stale revision conflicts |
| Temporary Partner | Both report-safe order rows | Empty, including embedded relationships | Empty | `42501` denial |
| Actual unassigned account, even with spoofed Owner metadata | Empty | Empty | Empty | `42501` denial |
| Actual anonymous Auth identity, even with a deliberately erroneous Owner mapping | Empty | Empty | Empty | `42501` denial |
| No-session/public-key caller | Object-privilege denial | Object-privilege denial | Object-privilege denial | No authenticated grant |
| Temporary revoked Owner mapping with retained JWT | Empty after role deletion | Empty after role deletion | Owner RPC denied | `42501` denial |

All application identities, including Owner, must be unable to directly write orders/settings/roles or read retry keys. Role lookup is self-only; signup metadata grants nothing. The disposable anonymous mapping is deliberate negative-test data and is never proposed for production.

**Revocation nuance:** [Supabase sign-out](https://supabase.com/docs/guides/auth/signout) revokes refresh sessions; issued access JWTs may remain valid until expiry. The batch first checks actual refresh denial and explicitly observes retained-JWT report access while its temporary mapping still exists. It then removes that temporary mapping and checks immediate row/RPC denial with the same JWT. Do not label ordinary logout as immediate JWT revocation. If immediate per-session Data API revocation is a launch requirement, current row policies do not implement a live session-presence check; decide whether Owner-role revocation plus bounded JWT expiry is acceptable or implement that separate requirement before launch. Deleted users likewise must not be assumed to have instantly invalid JWTs.

Sources for platform behavior: [admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [anonymous Auth](https://supabase.com/docs/guides/auth/auth-anonymous), [Edge gateway authentication](https://supabase.com/docs/guides/functions/auth), and [browser CORS](https://supabase.com/docs/guides/functions/cors). The deployed guest endpoint intentionally accepts JSON without browser SDK Authorization/apikey headers; its explicit origin/signed-scope/rate controls and service-only downstream RPC boundary are tested as implemented.

## Operational recovery procedure — required before real intake

This is an operator runbook proposal, **not an implemented authenticated recovery endpoint**. Missing credentials or capabilities outside their recovery window cannot be replaced automatically by the current code. Contact and identity-verification arrangements, operator access and retention must be approved before launch.

1. Keep the cart and saved intent intact. Tell the customer the outcome is unconfirmed and to avoid placing another order. Do not ask for scope tokens, retry keys, passwords, PINs, OTPs, wallet logins or payment screenshots in chat. Use the approved private support channel; collect only the minimum non-secret order reference/contact information needed there.
2. An authorized Owner/operator verifies the requester through an approved independent process, then searches saved orders in the protected operational surface. Log the case, operator, evidence category and decision privately. The existing code can retrieve orders but does not provide a complete customer identity-verification/case-management flow.
3. If an order is committed, recover that order's status/reference through the verified support process. Never cancel it, refund it, deduct stock again or mark a wallet paid merely to resolve a missing browser credential. Do not issue a new checkout identity for the same purchase.
4. If the original scope/key can be securely recovered by an authorized backend process, use that exact identity with the existing atomic resolver. It must wait for any in-flight creation, then return a committed order or a durable retirement. Separately confirm the durable outcome before issuing a replacement capability. Never infer restart safety from a temporary missing order. An authenticated operator tool to do this when the guest token is unusable is still missing; do not bypass the public scope check or expose service credentials to the customer.
5. If the original identity cannot be established, keep replacement blocked and escalate for reconciliation. Do not clear browser storage or generate a new key as a workaround. There is currently no safe automatic matching/replacement route for that case; implementing and accepting an audited backend recovery process is a launch blocker.
6. Preserve retry/retirement mappings needed for reconciliation. Maintain durable backend signing secrets and an approved rotation/key-retention plan; existing single-secret verification provides no multi-key rotation support. Secret loss or premature rotation can strand capabilities. Complete an operator rehearsal in disposable hosting before real intake.

## Remaining launch checklist

- [ ] Review the exact disposable project reference/organization/region and initialization/deployment changes; execute and accept the new hosted checkout and real-session batch with cleanup evidence. Actual-session and hosted results stay pending until then.
- [ ] Approve and implement operational identity verification/recovery for lost credentials, expired capabilities and signing-key loss/rotation; rehearse it. Decide/document residual JWT risk and required revocation latency.
- [ ] Before first real COD order: genuine approved merchandise/images and known per-size stock; Owner-configured Pakistan shipping, support route and approved policy/COD instructions; tax decision; monitoring, fulfillment, cash reconciliation and retention/abuse procedures; separately authorized production integration and static rebuild/publication.
- [ ] Before enabling either wallet: actual Owner account details and approved manual payment verification, reconciliation and status handling. Customer claims never mark paid. Automated notifications/polished tooling are optional for initial COD if adequate manual operations exist.

Production checkout and all payment methods remain disabled. No production writes, emails, deployment, commit or push are authorized by running local prerequisite checks.
