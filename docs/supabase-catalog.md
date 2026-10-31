# Supabase catalog setup (static export)

For the Owner upload phase, see [Owner product images](owner-product-images.md): user-applied migration 005 adds Storage, protected image receipts and revision-checked attachment, and its post-migration configuration checks passed. Hosted validation and actual uploads remain unverified. Existing migrations must not be rerun. Products without an upload retain their local image; uploaded assets are independently checked during builds and never silently replaced on failure.

## Status and boundaries

This repository prepares a Supabase-backed catalog; a successful offline demo build does **not** prove a database connection. The user has applied the schema and corrected seed migrations in SQL Editor. Earlier agent-executed API checks verified six products, 24 variants with unknown stock, and anonymous write denial; the user confirmed the rollback-only catalog RLS script succeeded in SQL Editor. No remote catalog writes were performed by the agent. The authentication foundation is documented in [admin-auth.md](admin-auth.md); its Auth/RLS checks require separate verification.

The site remains a static export served from `out/`; it needs no production Next.js server. `next.config.ts` calls `scripts/prepare-catalog.ts` before compiling. This performs anonymous, paginated Supabase reads with a publishable key, validates rows, converts paisa to the existing rupee price interface and writes one ignored public TypeScript snapshot. Pages, generated product routes, cart reconciliation, totals and demo checkout consume that same snapshot. No browser catalog fetching, SDK, credentials or subscriptions are required for the catalog. The separate admin authentication routes intentionally use the browser Auth SDK and validated public configuration. Build tooling clears the prior snapshot before loading; errors stop the build, with no demo fallback. Do not publish an old `out/` directory after a failed build.

All catalog changes, including activation, sizes, stock, prices and new slugs, require a fresh successful build and publication. Existing exports keep their previous snapshot until replaced. Displayed stock is not live or authoritative, never reserves inventory, and cannot support secure order placement. Quantity controls retain their demo limit of 99; stock counts are not enforced as real reservations. This phase adds no accounts, orders, payments, checkout APIs, or admin UI. Existing demo checkout and legacy WhatsApp helpers are retained; the catalog integration invokes neither a real order nor a message.

## Configure the intended project

1. Identify the exact Supabase project by organization, project name, project reference and project URL in its dashboard. Confirm it is the intended environment before running any database command. An existing Site hosting project ID is **not** a Supabase project reference.
2. In the project's **Connect** dialog (or **Settings → API Keys**), obtain its HTTPS Project URL and **publishable** key, beginning `sb_publishable_`. This adapter deliberately accepts only the current publishable key format, not legacy JWT keys. Publishable requests without a user session use the `anon` database role and obey RLS.
3. In the app directory (`batool-nextjs/`, beside `package.json`), copy `.env.example` to `.env.local`, then set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to that project's values. Leave `CATALOG_SOURCE=supabase`. Next loads `.env.local` before evaluating configuration. `.env*` files are ignored except `.env.example`; do not commit local configuration.
4. Configure those same three variables in the hosting provider's **build environment**, with project root `batool-nextjs/`, build command `npm run build`, and static output `out/`. A runtime-only variable setting on a static host has no effect. This work does not change the existing `.openai/hosting.json` or hosting identity and does not deploy anything.

No secret/service-role key is needed by the app. Never put elevated keys in `NEXT_PUBLIC_*`, the generated snapshot, browser code, examples, logs or source control. Do not paste credentials into chat. Database-owner operations below use the CLI/dashboard authentication flow, separately from the app's anonymous read key.

For an explicitly offline design preview, set `CATALOG_SOURCE=demo` in `.env.local` or the shell. This uses only the approved fixture in `src/features/catalog/model/products.ts`, with every stock count unknown. It is not a connectivity check or a fallback. `npm test` explicitly prepares this same demo snapshot for existing cart regression tests; Next configuration always regenerates it on the next build/dev startup. `npm run typecheck` creates an empty, unconfigured snapshot only when none exists, without contacting a database. Generated snapshots are ignored and must not be hand-edited or committed.

## Review and apply migrations

Install the maintained Supabase CLI using its official installation instructions (it is not an app dependency). From `batool-nextjs/`, run `supabase init` once if no `supabase/config.toml` exists. Keep the two committed migration files in `supabase/migrations/`.

The schema migration is already applied: **do not rerun or edit `20261030000100_catalog.sql`**. The corrected seed has also been applied: do not rerun `20261030000200_approved_demo_catalog.sql`. Its expected catalog is six products and 24 variants, all stock unknown. The user has also confirmed the dashboard-role migration was applied. The separate [Owner product-editing migration](owner-product-editing.md) remains unapplied. Do not use `db push` to replay manually applied SQL; reconcile migration history first.

For future migrations, before applying anything remotely:

1. Authenticate using `supabase login`, then `supabase projects list` and compare the dashboard identity with the intended project.
2. Run `supabase link --project-ref YOUR_CONFIRMED_PROJECT_REF`, then `supabase migration list --linked`. Check history and the existing `public.products`, `public.product_variants`, policies, grants, triggers, and `public.batool_catalog_updated_at()` in the dashboard SQL editor. Read-only conflict inspection:

   ```sql
   select to_regclass('public.products'), to_regclass('public.product_variants'),
          to_regprocedure('public.batool_catalog_updated_at()');
   select * from pg_policies where schemaname = 'public'
     and tablename in ('products', 'product_variants');
   select table_name, grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('products', 'product_variants');
   ```

3. If any name, migration history, ID or slug conflicts, stop and reconcile against the actual schema/data with a reviewed new migration. Do not overwrite catalog rows, repair migration history blindly, or reset the database. The provided migrations intentionally use plain CREATE/INSERT, not conflict-hiding upserts.
4. Review `supabase db push --linked --dry-run`. Only after confirming the project, conflicts and pending files, apply with `supabase db push --linked`. The first migration creates the schema, constraints, timestamps, RLS and read-only anonymous grants. The corrected second migration inserts **only** Gulnaar (0), Meher (2), Saba (3), Noor (8), Mira (7), and Zeenat (11), with 24 S/M/L/XL variants. IDs 1, 4, 5 and 6 remain absent; IDs 9 and 10 are reserved and must not be reused. All six products have `is_demo=true`; prices, imagery disclosures and ordering preserve the retained approved fixtures. Descriptions no longer assert unverified exact garment components or materials.

No Storage migration is needed: image references resolve to the current local WebP assets. The storefront mapper accepts only the six retained image slugs and rejects reserved IDs 9 and 10. The already-applied schema retains its original image-slug constraint, including the retired names; it is intentionally unchanged. Removal from the seed and mapper prevents those assets from becoming active storefront references. Add/review assets, metadata and schema constraints before introducing new images. The database types in `src/features/catalog/model/database.types.ts` mirror these migrations and must be reviewed with future schema changes.

`stock_quantity = NULL` explicitly means unknown/unconfirmed, including all seeded variants. Zero means explicitly out of stock; positive values are recorded stock counts. Active variants with unknown stock remain selectable in the demo; explicit zero is omitted from selectable sizes. Products with no permitted/selectable variants remain visible with no purchasable sizes. An empty database catalog produces an empty storefront, never seeded fallback data. Unknown product routes return the existing not-found page. Removed products and unsupported sizes are discarded from saved bags using the current snapshot. The existing local-storage write-failure memory fallback is preserved.

## Verify before claiming a connection

1. After reviewing test fixture IDs/slugs for conflicts, run `supabase/tests/catalog_rls.sql` in the intended project's SQL editor as the database owner. It creates isolated fixtures inside a transaction, switches to `anon`, asserts only active products/variants with active parents are visible, tests denial of INSERT/UPDATE/DELETE on both tables, and rolls back. If a statement errors, explicitly roll back the open transaction. This tests the database role; it is not a substitute for the next API check.
2. Configure the real project URL/publishable key locally and run `npm run build`. Success in `CATALOG_SOURCE=supabase` proves an actual anonymous Data API catalog read and mapping worked. Inspect resulting product pages/prices/sizes against the intended project, including a read-only check that inactive records are absent. Never print environment values or request headers for troubleshooting. To inspect the anonymous response directly, use the Supabase Data API with that same publishable key in a local client, not an elevated key.
3. Run `npm test` and `npm run typecheck`, then rebuild in Supabase mode because tests prepare an offline snapshot. The admin browser chunks now intentionally contain a publishable key and the Auth SDK; verify that no secret/service-role key, database password, session token or private data is embedded. The catalog loader remains build-only. No browser QA or live RLS claim should be made without actually performing it.

Official references consulted: [Supabase client initialization](https://supabase.com/docs/reference/javascript/initializing), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), and [Next.js static export](https://nextjs.org/docs/app/guides/static-exports). The installed Next.js static export and generateStaticParams guides were also reviewed as required by `AGENTS.md`.
