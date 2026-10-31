import Link from "next/link";
import { ProductPhoto } from "@/components/ui/product-photo";
import { collectionHref } from "@/features/catalog/model/catalog";
import styles from "./collection-discovery.module.css";

export function CollectionDiscovery() {
  return (
    <section className={styles.section} aria-labelledby="shop-collections">
      <div className={styles.card}>
        <ProductPhoto
          slug="gulnaar"
          alt="Gulnaar in dusty mauve, with embroidered shirt and draped dupatta. Sample editorial imagery."
          className={styles.photo}
          sizes="(max-width: 560px) 88vw, (max-width: 1600px) 90vw, 1440px"
        />
        <div className={styles.caption}>
          <p className={styles.eyebrow}>THE ART OF EVERYDAY DRESSING</p>
          <h2 id="shop-collections" className={styles.title}>The 3-Piece Collection</h2>
          <p className={styles.subtitle}>
            Stitched 3-piece styling.<br />
            Beautifully complete. Effortlessly yours.
          </p>
          <Link href={collectionHref()} className={styles.explore}>
            Shop The Collection
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
