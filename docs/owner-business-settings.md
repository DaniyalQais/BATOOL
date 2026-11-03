# Owner-managed business settings

The subsequent [local secure checkout preparation](secure-checkout.md) implements the backend order contract in migration 009. Public checkout/methods remain disabled. The completed settings application and checks below remain historical evidence and were not repeated.

Migration `20261102000800_owner_business_settings.sql` was **manually applied by the user**. The user reported success and supplied all thirteen postflight rows in `Supabase Snippet Untitled query (33).csv`; the expected configuration and unchanged preflight row counts are verified. The shipping revision preceded application; the migration file remains unchanged. **Do not replay it or migrations 001–007.** This is user-executed configuration evidence, not actual-session authorization testing. The agent performed no remote writes, deployment, notifications, checkout enablement, commit or push during this verification.

## Confirmed configuration

- PKR, ready stock, delivery across Pakistan. Shipping starts **unconfigured**, with no fee selected. Owner can choose free delivery or a nonnegative flat rate.
- Planned payment methods: COD, Easypaisa, JazzCash. All shopper methods remain unavailable.
- Public WhatsApp and support email are initially absent. Wallet titles/numbers are absent, enabled flags false, payment instructions and policy text empty drafts. No account details, delivery estimates, or exchange/refund terms were invented.

## Shipping modes and future order handling

Shipping is persisted atomically inside the revision-checked business-settings document with exactly four keys: `country_code: "PK"`, `currency: "PKR"`, `mode`, and `fee_minor`. Modes and fees must agree:

| Mode | Stored fee in paisa | Meaning |
| --- | --- | --- |
| `unconfigured` | `null` | Owner has not selected a shipping charge; never assume free delivery. |
| `free` | `0` | Owner explicitly selected free delivery. |
| `flat_rate` | Nonnegative integer | Owner explicitly entered a flat fee, including an explicit zero. |

The Owner form accepts decimal PKR with up to two decimal places and stores integer paisa exactly. The supported maximum is 2,147,483,647 paisa (PKR 21,474,836.47). Empty/negative/invalid amounts are rejected rather than converted to zero. Switching to flat rate requires entering an amount; selecting free writes zero; selecting unconfigured clears the fee to null. Saving other business fields leaves shipping unconfigured until explicitly changed. Pakistan-wide coverage cannot be changed through the settings API. Client and database both reject legacy objects with a missing mode, unknown fields, unsupported countries/currencies, mode/fee mismatches, fractional paisa and out-of-range amounts. These saves retain the existing live Owner authorization, row lock and expected-revision check; Partner/unassigned/anonymous cannot modify them.

All public delivery text is generated from the allowlisted shipping snapshot, including home, product, delivery/help, checkout notice and bag preview surfaces. Unconfigured shipping displays an explicit message and yields no shipping/payable total in preview arithmetic. Configured fees shown in previews are informational only. Saving a shipping mode or fee **requires rebuilding and publishing** to update public text; it does not publish or enable checkout. Static export remains unchanged. An older published copy stays visible until a new export is published.

Future checkout must read **trusted database settings** inside its backend order-creation transaction, reject unconfigured shipping, enforce Pakistan coverage, calculate free or flat-rate shipping, and store the charged integer paisa in `orders.shipping_minor` alongside the order's monetary totals. It must not trust a submitted/browser fee, preview total, or build snapshot. The existing order guard makes monetary snapshots immutable. Setting changes must never recalculate old orders or join live settings to derive historical charges. Migration 008 documents this contract on the existing column without adding an order-creation endpoint. The SQL batch creates a complete synthetic order from a configured fee and proves that subsequent free, zero flat-rate and unconfigured saves leave the stored order unchanged; direct monetary edits remain denied.

## Database boundary

`public.business_settings` is a singleton validated JSON document plus a database-managed revision, timestamp, and actor. `public.order_notification_settings` is a **separate** singleton with its own revision and private email/WhatsApp recipient arrays (maximum ten per channel). Neither table is publicly readable. Authenticated SELECT uses Owner-only RLS with the existing nonanonymous live-role helper. Partner, unassigned, and anonymous Auth users cannot read raw records. No application role has direct INSERT/UPDATE/DELETE/TRUNCATE privileges, including Owner and service role.

`owner_save_business_settings(expected_revision, settings)` and `owner_save_notification_settings(expected_revision, settings)` are the only browser write paths. Each security-definer RPC has an empty search path, rechecks `auth.uid()`/anonymous status and the **live** Owner mapping, holds the mapping `FOR SHARE` against concurrent demotion, validates the exact document shape and values, locks the singleton `FOR UPDATE`, and rejects a stale revision with `PT409`. A trigger advances revisions even for trusted SQL updates; callers cannot choose revision/timestamp/actor. Auth metadata does not authorize anything. Trusted database administrators retain their inherent administrative access.

Wallet enabled flags require nonempty titles and digit-string account numbers (7–24 digits; leading zeroes retained). Disabled wallets can hold incomplete drafts. Account titles are at most 120 characters. Public WhatsApp and private WhatsApp recipients use `92` followed by ten digits; emails are at most 254 characters. Text is at most 8,000 characters, rendered as plain text, and approved text must be nonblank. Unknown fields, inconsistent shipping, duplicate recipients, and invalid types are rejected in the database and client.

The UI describes enabled flags as configuration intent. **Saving wallet details does not automatically verify a payment.** There are no credential fields: never supply PINs, OTPs, passwords, or wallet login credentials.

## Explicit public projection and static publication

`get_public_business_settings()` returns exactly nine allowlisted fields: public WhatsApp, support email, PKR currency, ready-stock model, structured shipping, approved payment instructions, approved policy text, `checkout_enabled: false`, and `available_payment_methods: []`. Draft text becomes JSON null. Wallet configuration, raw enabled flags, actors/revisions, and notification recipients are excluded. The public RPC never reads the notification table.

`scripts/prepare-settings.ts` uses only the publishable key and that public RPC. It validates and reconstructs an allowlist before writing ignored `src/features/settings/model/generated/public-settings.ts`. No raw response is serialized. A prior snapshot is cleared before fetching; a live error fails the build instead of silently reusing old values. `CATALOG_SOURCE=demo` explicitly generates blank public contacts/text and unconfigured shipping with Pakistan-wide coverage. Tests and typechecking prepare safe snapshots. No settings secrets are added to Next's public environment.

Next remains `output: "export"`. The contact page and footer use the public snapshot; the delivery page shows approved text. **Saving public settings requires rebuilding and publishing before shoppers see the change.** Saving does not publish. Returning previously approved text to draft also needs a rebuild/publication to remove an older published copy. Editing text in the Owner form resets its state to draft; Owner must explicitly approve the new wording.

`/checkout/` now displays an unavailable notice. `?preview=1` shows only a local bag summary, with no customer-data form, order creation, payment selection, wallet details, or WhatsApp submission. `?admin=true` cannot unlock checkout or a dispatch panel. Legacy message-format utilities are unused by the app; an explicit recipient is required, with no hardcoded number, environment override, or public-contact fallback. Unconfirmed 48-hour dispatch, 2–4-day delivery and seven-day exchange promises have been removed from shopper surfaces.

## Preflight and local checks

The user supplied preflight CSV (32); all ten rows were reviewed and the conservative default-ACL flag was resolved for execution as `postgres`. The user then reported migration success and supplied postflight CSV (33). All twelve configuration rows pass; all thirteen existing-table counts in row `10` match the saved baseline. Settings RLS/policies, exact function contracts/source fingerprints, restricted grants, revisions, constraints, initial unconfigured shipping and the redacted public projection match. [The application record](business-settings-manual-application.md) preserves the review and baseline. Actual Owner/Partner/unassigned/anonymous session tests remain separate and incomplete; completed tests were not repeated.

The combined preflight and postflight files remain available as the inspected configuration record. Both open read-only transactions, print metadata/counts/redacted flags and call no mutation RPCs. Local query validation is distinct from the user's remote CSV evidence. No repeat preflight, migration or postflight is requested for the completed application.

`supabase/tests/business_settings.sql` is a rollback batch for an **empty disposable** database with the existing migrations and 008, without seed 002. It requires the same-connection `batool.test_disposable='yes'` opt-in and refuses existing Auth users, roles, products/orders, or modified settings. Run with `ON_ERROR_STOP`. It tests role/anonymous denial, metadata spoofing, Owner-only reads/RPC saves, direct DML denial, validation, wallet prerequisites, revision/second-Owner conflicts, demotion, private/public canaries, approved/draft projection, unavailable payments, and trusted-write revision/constraint behavior. Never run fixtures on BATOOL's remote database.

The optional local runner creates an isolated PostgreSQL cluster under ignored `.tmp/`, listens only on `127.0.0.1` on a temporary port, applies existing migrations plus 008, runs preflight and the rollback batch, writes local logs, and stops its own database:

```powershell
node scripts/test-business-settings-local.mjs --postgres-bin 'C:/Program Files/PostgreSQL/18/bin'
```

It supplies minimal Auth/Storage **test stubs**, not Supabase services. Local PostgreSQL checks cannot prove Supabase Auth JWT verification, PostgREST exposure, custom hosted ACLs, or live role-session behavior. The full Supabase stack was unavailable because Docker was not running. No remote SQL was executed.

Executed checks for this implementation:

- `npm.cmd test`: 143 passed, zero failed/skipped, including shipping mode/fee/PKR parsing, private/public preservation and unconfigured preview totals.
- `npm.cmd run typecheck`: passed.
- `CATALOG_SOURCE=demo` production build with synthetic public Auth configuration: passed, all 17 static pages exported. No live catalog/settings load was attempted.
- Local PostgreSQL 18.4 runner: preflight, migrations 001/003–008, and revised rollback SQL batch passed using test stubs, including immutable order shipping snapshots; temporary database stopped. Logs: `.tmp/settings-pg-1793613492475/preflight.log` and `batch.log`.
- `tests/business-settings.browser.mjs`: passed Owner shipping mode/fee entry, invalid-input denial, flat-fee reload persistence, explicit free/unconfigured saves, and the existing access/conflict/logout/mobile/public-page/checkout scenarios. Browser/server stopped afterward.
- The previous settings iteration also passed `tests/product-drafts.browser.mjs` and all nine `tests/orders-dashboard.browser.mjs` scenarios. These were not rerun for the shipping-only revision; their mocks isolate settings readiness.
- Export inspection scanned 101 HTML/JS/JSON/text artifacts: no private fixture canaries, old hardcoded contact number, or removed dispatch/exchange promises. Home/delivery/product HTML explicitly shows unconfigured shipping, without a free-delivery promise. This was a demo export, not a live-data privacy audit.
- `git diff --check`: passed.

`tests/business-settings.browser.mjs` uses installed Playwright and the static `out/` build, intercepting **every** non-loopback request with synthetic Auth/REST fixtures. Set `BATOOL_PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs`. It checks forms, validation, approvals returning to draft, conflict/reload behavior, separate saves, mobile width, demotion/logout, anonymous access, public surfaces, and closed checkout query variants. This is UI evidence only, not live Supabase authorization evidence.

## Launch blockers

1. Application and configuration inspection are complete for migrations 001–008; do not replay them. Actual Owner, Partner, unassigned, anonymous and revoked-session authorization checks for settings remain pending. Passing standalone PostgreSQL fixtures with synthetic Auth/Storage stubs does not replace those checks.
2. Owner must explicitly configure free or flat-rate shipping, supply public contacts, private notification recipients if wanted, and real wallet account title/number details. Owner must write and approve payment instructions and policy wording, including delivery/exchange/refund terms when confirmed.
3. Implement trusted order creation, authoritative ready-stock/price checks, backend shipping calculation and immutable fee snapshots as specified above, idempotency, payment handling/reconciliation and explicit verification workflow before enabling any shopper payment method. Saved settings or enabled flags cannot unlock this.
4. Implement and verify private notification delivery, credentials/secret handling, retry/idempotency and recipients usage on a backend before sending operational messages. No delivery is implemented by these settings.
5. Existing catalog/image-validator/stock and other launch checks remain applicable. Rebuild and publish the approved public snapshot only when separately authorized. The current build is an offline demo artifact, not a live release.
