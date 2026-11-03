# BATOOL storefront

A Next.js App Router + TypeScript storefront for BATOOL's stitched clothing, developed by Aonicon Valley. The published site is a private design preview. Catalog data, prices and sample imagery are illustrative. Orders and payments are not enabled.

## Local development in VS Code

Use Node.js 24 LTS (the included test runner requires Node 22.18 or newer).

```bash
npm ci
# Configure .env.local as described in docs/supabase-catalog.md first.
npm run dev
```

Open http://localhost:3000. `npm run build` exports production assets into `out/`. The preview host serves that directory; use a static web server to inspect a local production export. `next start` is not used for static exports.

```bash
npm test
npm run typecheck
npm run build
```

## Organization

| Path                               | Responsibility                                                        |
| ---------------------------------- | --------------------------------------------------------------------- |
| `src/app/`                         | Routes, metadata, page composition, global styles                     |
| `src/components/layout/`           | Server-rendered header, footer and editorial sections                 |
| `src/components/ui/`               | Reusable image, icon and dialog primitives                            |
| `src/features/catalog/model/`      | Product types, demo catalog, repository boundary and query functions  |
| `src/features/catalog/components/` | Catalog search, sorting and reusable product cards                     |
| `src/features/cart/model/`         | Validated cart operations and narrowly subscribed browser store       |
| `src/features/cart/components/`    | Bag trigger, lazy-loaded drawer and size/add controls                 |
| `src/lib/`                         | Currency formatter and static image loader                            |
| `assets/source/`                   | Original editorial image; never shipped in `out/`                     |
| `public/images/`                   | Generated WebP variants used by the image loader                      |
| `scripts/`                         | Build-time asset processing                                           |
| `tests/`                           | Cart correctness, persisted-data validation, search and sorting tests |
| `docs/architecture.md`             | Rendering decisions, limits and phased roadmap                        |

Page files compose features. Business rules stay in pure model functions, outside JSX. Keep generic UI small; feature-specific components belong in their feature. Avoid empty abstraction layers and a single catch-all components directory.

## Content changes

[Current production checkout integration and operational recovery](docs/operational-checkout-integration.md) are implemented locally. BATOOL migrations **001–012 are accepted**; do not replay them or completed suites. 012 adds protected original-intent escrow, Owner-verified recovery cases and immutable audit; user-reported manual application and postflight CSV (42) are accepted with unchanged counts and closed gates. Runtime/session evidence remains confined to the separately recorded disposable checks. Use the [single remaining launch checklist](docs/checkout-launch-checklist.md) for known code fixes, exact configuration, verification and approvals. Production release/payment gates stay disabled; no changed function or storefront was deployed. Older implementation/verification notes below are historical where superseded by these current records.

[Secure checkout local implementation](docs/secure-checkout.md) uses user-applied migration **`20261102000900_secure_checkout.sql`**, with preflight/ACL CSVs (34)/(35) and accepted postflight CSV (36): eight configuration checks PASS and all existing-row counts match. Do not replay migrations 001–009 or completed checks. It adds trusted database quotes, atomic per-size stock/order creation, shipping/price snapshots, retry identities and scoped commit recovery. New checkout SQL/concurrency tests previously passed in disposable PostgreSQL; actual-session/Supabase integration checks remain pending. Live intake and every payment method remain disabled. The default static checkout stays closed; a loopback-only opt-in supports local tests. See the documented remaining launch blockers.

[Business/shipping migration record](docs/business-settings-manual-application.md) records user application of `20261102000800_owner_business_settings.sql` and reviewed preflight/postflight CSVs (32)/(33). Configuration checks pass and all existing-table counts match. Migrations 001–008 are applied; do not replay them. The previously blocked order/draft SQL suites pass in disposable standalone PostgreSQL with synthetic Auth/Storage stubs and verified rollback; actual-session checks remain distinct.

[Owner business settings](docs/owner-business-settings.md) use user-applied migration 008, reviewed configuration checks, and disposable SQL tests. Public contacts, wallet configuration, Pakistan-wide shipping, and draft/approved text are Owner-managed; private notification recipients have their own protected record. Shipping starts unconfigured: Owner must select free delivery or enter a nonnegative flat PKR fee. Public shipping text and other public snapshots require rebuilding/publishing. Future checkout must calculate from trusted backend settings and snapshot the charged fee on each order; later settings changes cannot alter historical charges. All shopper payment methods and real checkout remain unavailable; the checkout preview is a bag summary only. Actual-session settings verification remains pending.

[Owner product creation and draft management](docs/owner-product-drafts.md) uses user-applied migration 007. New drafts are inactive with S/M/L/XL stock and no image; saving does not publish or create storefront routes. Activation requires complete storefront fields and a trusted product-specific image. Upload controls remain disabled while hosted validation is blocked. Disposable database tests passed in the earlier recorded task with Auth/Storage stubs; actual-session verification remains distinct. No deployment was performed.

The catalog now loads from Supabase at build time. Follow [Supabase catalog setup](docs/supabase-catalog.md) for project identification, environment variables, migration conflict checks, RLS verification and an explicit offline demo option. `src/features/catalog/model/products.ts` remains the approved offline fixture, not a live-data fallback. Product updates require rebuilding; stock snapshots are not authoritative. Before real orders, authoritative prices, stock, shipping and checkout validation must live on a server.

## Deployment

[Hosted checkout and actual-session acceptance](docs/hosted-checkout-acceptance.md) passed in the isolated Supabase test project: real browser/client → Edge → PostgREST → database commits/retries/recovery/replacement, CORS and populated actual-session access. A new [011 deferred-checker fix](docs/order-commit-checks.md) was required and verified only there; manual production application remains pending. BATOOL's accepted 001–010 were not replayed or edited. Test intake/payment gates are closed and temporary Auth identities removed; two immutable synthetic orders remain for evidence review. Production checkout/payment gates and its existing Owner were untouched. Production UI integration, operational credential recovery and the documented COD/wallet prerequisites remain pending.

[Order database foundation and read-only dashboard](docs/order-foundation.md) use user-applied migration 006: report-safe order amounts/statuses, Owner-only private details and snapshots, append-only history and backend-only retry identities. The local `/admin/` Orders section uses session-scoped queries, filters and pagination. Prepared migration 009 adds a service-only creation path; direct application order-write grants remain absent. The earlier foundation SQL suite passed in disposable PostgreSQL; populated actual Auth-session checks remain pending. Live checkout stays unavailable and no commissions are added.

[Owner main-image uploads](docs/owner-product-images.md) include private staging, a prepared trusted Supabase Edge validator and immutable responsive public images. The user applied migration `20261030000500_owner_product_images.sql` and supplied passing post-migration configuration checks. The hosted validator, actual uploads/attachment and public image delivery remain unverified; deployment has not been confirmed. Next.js remains statically exported. See [commit readiness and verification boundaries](docs/commit-readiness.md) before pushing.

The static `/admin/login/`, `/admin/` and `/admin/reset-password/` routes provide the authentication foundation. See [admin authentication setup](docs/admin-auth.md) for protected-role setup, disabling public signup, trusted account provisioning, Vercel build variables, recovery redirects and remote acceptance checks. The documented handover starts with the setup operator's personal account as Owner, then explicitly invites/assigns the client as Owner and verifies their access before changing the operator's existing account to Partner. All provisioning and role changes stay in a trusted administrative workflow. [Focused Owner product editing](docs/owner-product-editing.md) is implemented for the six existing products; the user reported migration 004 and its recorded acceptance checks successful. Orders are read-only; real intake remains disabled. No Auth accounts or role assignments are seeded.

`.openai/hosting.json` preserves the existing private Site identity and points to `out`. Run the production build before packaging. Source is versioned in the Site Git repository. See `docs/architecture.md` for static-export limitations.

## Stitched-only frontend demo

All products are stitched 3-piece ready-to-wear. Header/footer links and catalog filters offer All 3-Piece, Daily Pret (Gulnaar, Saba and Noor), Festive Edit (Meher and Zeenat), and Luxury Formals (Mira). Each card has a style-specific 3-piece RTW badge and size indicators drawn from its available S, M, L and XL options. Category links use shareable URLs; filter changes preserve search, sorting and other URL parameters, with browser Back/Forward support. The featured grid contains six products. Noor is in row one and Mira in row two; Mira has a distinct editorial card zoom over the disclosed Meher sample portrait. Noor is restored as a stitched 3-piece ensemble with a new SKU. Retained product IDs stay stable, so saved bags keep valid items and discard unavailable products. IDs 9 and 10 remain reserved after the Amanah/Layal imagery review; neither product is seeded or shown in offline mode. Replace product data and photography before real sales.

This adapts category-focused retail navigation for BATOOL. It does not include homeware, fragrances, shoes, accounts, stock services or payment/order processing. No third-party retailer assets were copied.

## Product and checkout preview

Mira and Zeenat use distinct neckline and dupatta embroidery crops on catalog cards and bag thumbnails. Full product photography remains visible on the detail page. Products retain S/M/L/XL selection, a Size & Fit Guide, and concept-detail, fit and exchange disclosures. Exact garment components, materials and tailoring specifications await brand confirmation. The size chart contains sample finished-garment measurements in inches; the brand must confirm final measurements and fabric compositions.

To review the demo bag, select a product size, add it to the bag, and choose **Review demo bag**. The drawer links to `/checkout/?preview=1`, which shows a bag summary only. `/checkout/` is unavailable for real orders; query flags cannot enable payment or dispatch controls. No customer details are collected and no test confirmation, order, payment or WhatsApp submission is generated. Cart sizes and quantities survive reloads when browser storage is available. Pakistan-wide shipping remains unconfigured until Owner explicitly saves free delivery or a flat rate. Public shipping text requires rebuilding and publishing; delivery times and exchange/refund terms await approved wording in Owner settings.
