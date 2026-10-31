# Owner product editing

Main-image uploads are a separate phase: see [Owner product images](owner-product-images.md) for user-applied migration 005, trusted validation, Storage configuration, retention and verification. Its post-migration configuration checks passed; hosted validation and actual uploads remain unverified. Migration 004's confirmed checks do not establish actual image upload permissions.

## Implementation and scope

The user has reported applying migration 004 after the read-only conflict checks. Shared SQL results confirm expected table/function grants; Owner browser checks were reported as passing. The user also shared successful Partner and unassigned-session RPC denials (HTTP 403 / 42501 / Owner access required), then reported deleting both temporary accounts and confirming their users/mappings absent with the original Auth user still Owner. See [the temporary-account authorization procedure and execution record](product-editing-authorization-checks.md) for evidence boundaries. No existing remote product has been modified by the agent. Do not edit or rerun migrations 001, 002, 003 or 004 on the configured project.

The existing `/admin/` dashboard shows the editor only after the browser verifies the signed-in identity and the protected `dashboard_roles` row says `owner`. It reads current Supabase product/variant data directly, including inactive products and variants, through the existing authenticated client. It does not use the storefront's generated snapshot or demo fallback. A missing migration, denied read, malformed data or missing product/variant displays an error. The UI expects the six retained IDs 0, 2, 3, 8, 7 and 11, with S/M/L/XL variants; IDs 9 and 10 remain reserved.

Editable fields are product `name`, `description`, `price_minor` displayed in PKR, `active`, and each existing variant's `stock_quantity`. Blank/whitespace-only copy, names longer than 120 Unicode characters, descriptions longer than 2000, negative/fractional quantities and out-of-range integers are rejected. Price input permits a nonnegative decimal with up to two fractional digits, without commas or exponent notation. String/BigInt conversion produces exact integer paisa, including PKR 0.29 → 29; it never rounds floating-point multiplication. The database integer range permits up to PKR 21,474,836.47 and stock 2,147,483,647.

Each size has an explicit **Unknown** control mapping to SQL `NULL`. Unchecking it requires a quantity; an empty input is not silently zero. `0` means explicitly out of stock. No reservation or authoritative order validation is added. The demo checkout and quantity controls remain unchanged.

IDs, slugs, image references/disclosures, category, piece count, currency, demo flags, variant identity/active status, and role assignments have no editor inputs or mutation arguments. The save function never writes those columns. Existing concept-image disclosures remain visible and unchanged. There is no creation, deletion, image upload, order management, reporting or commission feature.

## Database authorization and atomic saves

The only new migration is:

`supabase/migrations/20261030000400_owner_product_editing.sql`

It adds name/description constraints, a protected integer `edit_revision` and revision triggers. New SELECT RLS policies let authenticated Owners read inactive catalog rows by consulting their protected role mapping. Partner and unassigned authenticated sessions see no admin catalog rows. Existing anonymous active-product/variant read policies are unchanged.

Direct INSERT/UPDATE/DELETE privileges remain denied to browser roles, including Owner. The sole write path is `owner_update_catalog_product(integer, integer, text, text, integer, boolean, jsonb)`, called with the signed-in user's session and the publishable key. Its narrow `SECURITY DEFINER` boundary uses an empty search path, fully qualified tables, no dynamic SQL, explicit grants, a live `auth.uid()`/Owner check, anonymous-auth exclusion, and a lock on the Owner mapping. Merely having an authenticated JWT or a user-metadata `owner` value grants nothing. Owner demotion/revocation prevents subsequent saves. No browser service-role key is used or needed.

RLS restricts admin reads; explicit authorization inside the database function restricts writes because a definer function runs with its owner's table privileges. Execute is revoked from PUBLIC/anon and granted to authenticated only, with the live Owner check still required. Authenticated callers have no direct table-write path to bypass the function's validation/concurrency checks. The role allowlist itself remains unmodifiable by application users.

One RPC validates all fields, requires exactly the four existing variants and stock JSON keys, locks the product and variants, compares the expected revision, and updates product details and quantities in one transaction. No partial saves survive failure. A stale revision returns `PT409`/HTTP 409. Product updates and trusted SQL stock edits increment the parent revision; stock changes therefore invalidate an older detail form too. Revision increments are monotonic and may advance more than once per save. Trusted administrative bulk edits should lock parent products before their variants, as the RPC does; concurrent edits can otherwise encounter a safely rolled-back lock/deadlock error requiring reload.

The UI preserves drafts only in memory for the same verified Owner through session rechecks, hides them while access is being checked, and clears them on sign-out, denial or change to Partner. An uncertain/interrupted save may have reached the database; the UI requires a reload instead of blindly retrying. Conflicts also require reloading/reviewing the latest values and reapplying edits. The reload action explicitly discards unsaved drafts. Save responses are validated before success is shown.

## Static export and publishing

Hosting stays static, with `output: "export"` and no Next.js API routes, Server Actions or production server. The static HTML contains no authenticated product editor data; browser JavaScript loads it only for a verified Owner through RLS.

**Saving changes only the database.** Success messages explicitly state that the public storefront requires a fresh successful build and publication. Save does not rebuild, deploy or make the existing export current. Run the usual Supabase-mode build and follow your separately authorized publishing workflow after reviewing edits. Deactivating a product does not remove it from an old already-published export. Stock displayed by any export is a build-time snapshot and is never authoritative for placing orders.

## Original application procedure (new environments only)

No migration is applied as part of this local implementation. In the intended Supabase project, verify migration history and existing policies, grants, functions and triggers before applying the new migration. SQL Editor application of earlier migrations is not automatically recorded in CLI history; do not blindly `db push` or repair history. The new migration deliberately uses plain CREATE/ALTER so conflicting names or invalid existing data fail rather than being hidden.

Read-only preflight examples for a trusted database administrator:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='products' and column_name='edit_revision';
select to_regprocedure('public.owner_update_catalog_product(integer,integer,text,text,integer,boolean,jsonb)'),
       to_regprocedure('public.batool_product_revision()'),
       to_regprocedure('public.batool_variant_revision()');
select * from pg_policies where schemaname='public'
  and tablename in ('products','product_variants','dashboard_roles');
select id from public.products where char_length(btrim(name)) not between 1 and 120
  or name !~ '[^[:space:]]' or char_length(btrim(description)) not between 1 and 2000
  or description !~ '[^[:space:]]';
```

Also inspect existing table/column grants and triggers for conflicting custom changes. If any new name already exists or preflight finds invalid records, stop and reconcile before applying. Do not truncate copy automatically, overwrite roles, reset the database, or reapply earlier migrations. Once reviewed and separately authorized, run the entire `20261030000400_owner_product_editing.sql` once in SQL Editor as the database owner. No account creation or role assignment is part of it. Confirm the intended account already has an explicit Owner mapping through the trusted workflow in [admin-auth.md](admin-auth.md).

## Verification boundaries

Local Node tests cover exact money conversion, integer/range validation, Unknown/zero, supported variants, protected-field payload allowlisting, missing/malformed data, one atomic RPC using the original revision, conflict/denial propagation without retries, and invalid save confirmations. Existing auth/cart/catalog tests must continue to pass. Run tests and typecheck, then a Supabase-mode production build; tests explicitly generate an offline snapshot, so build afterward to restore actual database catalog content.

`supabase/tests/owner_product_editing.sql` is a **prepared, unexecuted database test**. Run only on an empty disposable Supabase test database after migrations 001, 003 and 004, without seed 002. It refuses a database containing products/variants. It creates isolated Auth/role/catalog fixtures, tests Owner reads/saves, inactive/active anonymous filtering, Partner/unassigned/anonymous mutation denial, field protection, stale revisions, invalid values, external stock revision increments and Owner demotion; all fixtures roll back. It never needs to update a legitimate catalog row. If it errors, issue `rollback;`. It has not been run against the configured project and must not be used there while it contains the legitimate catalog.

After an explicitly authorized migration, test authenticated browser behavior with provisioned Owner/Partner/unassigned identities in a trusted test environment: load all six products, save each field, distinguish null/zero, edit an inactive product, open two tabs and prove the older form conflicts, simulate offline/expired sessions, reload after an uncertain save, and verify mobile layout. Confirm Partner/unassigned sessions cannot call the RPC and direct table writes/protected-field mutations fail. Do not claim remote save/RLS behavior or browser interaction QA from a build alone. No authenticated browser save, remote product mutation or new database-policy execution occurred during local implementation.

Official references: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security). The installed Next.js static-export guide was reviewed before implementation.
