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

The catalog now loads from Supabase at build time. Follow [Supabase catalog setup](docs/supabase-catalog.md) for project identification, environment variables, migration conflict checks, RLS verification and an explicit offline demo option. `src/features/catalog/model/products.ts` remains the approved offline fixture, not a live-data fallback. Product updates require rebuilding; stock snapshots are not authoritative. Before real orders, authoritative prices, stock, shipping and checkout validation must live on a server.

## Deployment

[Owner main-image uploads](docs/owner-product-images.md) include private staging, a prepared trusted Supabase Edge validator and immutable responsive public images. The user applied migration `20261030000500_owner_product_images.sql` and supplied passing post-migration configuration checks. The hosted validator, actual uploads/attachment and public image delivery remain unverified; deployment has not been confirmed. Next.js remains statically exported. See [commit readiness and verification boundaries](docs/commit-readiness.md) before pushing.

The static `/admin/login/`, `/admin/` and `/admin/reset-password/` routes provide the authentication foundation. See [admin authentication setup](docs/admin-auth.md) for protected-role setup, disabling public signup, trusted account provisioning, Vercel build variables, recovery redirects and remote acceptance checks. The documented handover starts with the setup operator's personal account as Owner, then explicitly invites/assigns the client as Owner and verifies their access before changing the operator's existing account to Partner. All provisioning and role changes stay in a trusted administrative workflow. [Focused Owner product editing](docs/owner-product-editing.md) is implemented for the six existing products; the user reported migration 004 and its recorded acceptance checks successful. No order/report features are enabled. No Auth accounts or role assignments are seeded.

`.openai/hosting.json` preserves the existing private Site identity and points to `out`. Run the production build before packaging. Source is versioned in the Site Git repository. See `docs/architecture.md` for static-export limitations.

## Stitched-only frontend demo

All products are stitched 3-piece ready-to-wear. Header/footer links and catalog filters offer All 3-Piece, Daily Pret (Gulnaar, Saba and Noor), Festive Edit (Meher and Zeenat), and Luxury Formals (Mira). Each card has a style-specific 3-piece RTW badge and size indicators drawn from its available S, M, L and XL options. Category links use shareable URLs; filter changes preserve search, sorting and other URL parameters, with browser Back/Forward support. The featured grid contains six products. Noor is in row one and Mira in row two; Mira has a distinct editorial card zoom over the disclosed Meher sample portrait. Noor is restored as a stitched 3-piece ensemble with a new SKU. Retained product IDs stay stable, so saved bags keep valid items and discard unavailable products. IDs 9 and 10 remain reserved after the Amanah/Layal imagery review; neither product is seeded or shown in offline mode. Replace product data and photography before real sales.

This adapts category-focused retail navigation for BATOOL. It does not include homeware, fragrances, shoes, accounts, stock services or payment/order processing. No third-party retailer assets were copied.

## Product and checkout preview

Mira and Zeenat use distinct neckline and dupatta embroidery crops on catalog cards and bag thumbnails. Full product photography remains visible on the detail page. Products retain S/M/L/XL selection, a Size & Fit Guide, and concept-detail, fit and exchange disclosures. Exact garment components, materials and tailoring specifications await brand confirmation. The size chart contains sample finished-garment measurements in inches; the brand must confirm final measurements and fabric compositions.

To test the buying journey, select a product size, add it to the bag, choose **Proceed to Checkout**, review sizes, quantities, Cash on Delivery and complimentary Express Shipping, then continue to delivery details. The drawer opens `/checkout/?preview=1`. Complete the form with sample details to receive a local `BT-TEST-` confirmation; this path clears the demo bag without opening WhatsApp or submitting an order or payment. Cart sizes and quantities survive reloads when browser storage is available. Shipping estimates are illustrative. The existing checkout behavior outside this preview path is retained.
