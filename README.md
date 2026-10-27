# BATOOL storefront

A Next.js App Router + TypeScript storefront for BATOOL's stitched clothing, developed by Aonicon Valley. The published site is a private design preview. Catalog data, prices and sample imagery are illustrative. Orders and payments are not enabled.

## Local development in VS Code

Use Node.js 24 LTS (the included test runner requires Node 22.18 or newer).

```bash
npm ci
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

Update `src/features/catalog/model/products.ts` for the sample catalog. Add new image slugs to `scripts/optimize-images.mjs` when replacing the current contact-sheet imagery. The repository interface is the replacement point for a future CMS or commerce API. Before real orders, authoritative prices, stock, shipping and checkout validation must live on a server.

## Deployment

`.openai/hosting.json` preserves the existing private Site identity and points to `out`. Run the production build before packaging. Source is versioned in the Site Git repository. See `docs/architecture.md` for static-export limitations.

## Stitched-only frontend demo

All products are stitched 3-piece ready-to-wear. Header/footer links and catalog filters offer All 3-Piece, Daily Pret (Gulnaar, Saba and Noor), Festive Edit (Meher and Zeenat), and Luxury Formals (Mira, Amanah and Layal). Each card has a style-specific 3-piece RTW badge and size indicators drawn from its available S, M, L and XL options. Category links use shareable URLs; filter changes preserve search, sorting and other URL parameters, with browser Back/Forward support. The featured grid contains two complete rows of four. Noor is in row one and Mira in row two; Mira has a distinct editorial card zoom over the disclosed Meher sample portrait. Noor is restored as a stitched 3-piece ensemble with a new SKU. Retained product IDs stay stable, so saved bags keep valid items and discard unavailable products. Replace product data and photography before real sales.

This adapts category-focused retail navigation for BATOOL. It does not include homeware, fragrances, shoes, accounts, stock services or payment/order processing. No third-party retailer assets were copied.
