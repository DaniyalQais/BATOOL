import { Suspense } from "react";
import type { Metadata } from "next";
import { Hero, EditorialStory } from "@/components/layout/editorial-sections";
import { CollectionDiscovery } from "@/components/layout/collection-discovery";
import { ProductCatalog, CatalogFallback } from "@/features/catalog/components/product-catalog";
import { catalogRepository } from "@/features/catalog/model/repository";
import styles from "./page.module.css";
import { checkoutIsWired, isSampleItem, releaseCopy } from "@/features/checkout/model/release-copy";
export const metadata: Metadata = { alternates: { canonical: "/" } };
export default function Home() {
  const products = catalogRepository.list();
  const copy = releaseCopy(checkoutIsWired(), products.some(isSampleItem));
  return (
    <main id="main" className={styles.page}>
      <Hero />
      <div className={styles.content}>
        <CollectionDiscovery />
        <section className="collection" id="collection">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE BATOOL WARDROBE</p>
              <h2>Curated <span className={styles.keepTogether}>3-Piece</span> Ensembles.</h2>
            </div>
            <p>Stitched 3-piece ready-to-wear, in S, M, L and XL.</p>
          </div>
          <Suspense fallback={<CatalogFallback products={products} />}>
            <ProductCatalog products={products} />
          </Suspense>
          <p className="sample-note">
            {copy.collection} {copy.availability}
            {products.some(isSampleItem) && " Concept imagery includes reused sample portraits."}
            {" Stock shown here is a build-time snapshot and is not authoritative."}
          </p>
        </section>
        <EditorialStory />
      </div>
    </main>
  );
}
