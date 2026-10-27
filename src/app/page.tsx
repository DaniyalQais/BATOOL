import { Suspense } from "react";
import { Hero, EditorialStory } from "@/components/layout/editorial-sections";
import { CollectionDiscovery } from "@/components/layout/collection-discovery";
import { ProductCatalog, CatalogFallback } from "@/features/catalog/components/product-catalog";
import { catalogRepository } from "@/features/catalog/model/repository";
import styles from "./page.module.css";
export default function Home() {
  const products = catalogRepository.list();
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
            A first look at BATOOL · Sample styles, imagery and prices for design
            preview. Concept imagery includes reused sample portraits.
            No orders or payments are enabled.
          </p>
        </section>
        <EditorialStory />
      </div>
    </main>
  );
}
