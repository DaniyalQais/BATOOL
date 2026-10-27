# Local storefront fonts

The root layout defines both shared font variables using next/font/local:

- --font-serif: **Cormorant Garamond**, regular 400 and italic 400, for the
  campaign headline, collection/editorial headings and product names, including
  product-page titles and Quick Add product names.
- --font-sans: **DM Sans**, normal weights 400 to 600, for navigation, body copy,
  prices, filters, buttons, carousel controls, forms and utility headings.

Both use display: swap, with Georgia/serif and Arial/sans-serif fallbacks
respectively. Unsupported weights/styles may be synthesized by the browser;
the existing assets cover the explicitly styled 400, 500 and 600 sans weights.
The Georgia wordmark remains unchanged. Editorial fonts are applied by role,
not to every heading element: shopping-bag and help headings stay sans-serif.

The checked-in Latin WOFF2 files come from Google's official font CDN. Original
face declarations are retained in each family's source.css; root sources.json
records source URLs, hashes, byte sizes, retrieval date and pinned license URLs.
Complete SIL Open Font License 1.1 notices are retained in
public/font-licenses/cormorant-garamond-OFL.txt and
public/font-licenses/dm-sans-OFL.txt, and accompany the static export.

Builds and rendering require no Google Fonts requests. System fallbacks
supplement Latin glyph coverage. The previously used Inter files and their
provenance/license remain intact, but are no longer loaded by the layout.
