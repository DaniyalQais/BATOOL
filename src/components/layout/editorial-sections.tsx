import Link from "next/link";
import { Gift, Scissors, Shirt } from "lucide-react";
import { ProductPhoto } from "@/components/ui/product-photo";
import { collectionHref } from "@/features/catalog/model/catalog";
import styles from "./editorial-sections.module.css";
export { Hero } from "@/features/campaign/components/hero";
export function EditorialStory() {
  return (
    <>
      <section className="story" aria-labelledby="featured-atelier-look">
        <ProductPhoto
          slug="meher"
          alt="Sample plum festive outfit"
          className="story-photo"
          sizes="(max-width:560px) 60vw, 36vw"
        />
        <div className="story-copy">
          <p className="eyebrow">FEATURED ATELIER LOOK</p>
          <h2 id="featured-atelier-look">
            Some days deserve{" "}
            <em>a little more.</em>
          </h2>
          <p>
            Rich colours. Delicate details. An effortless sense of occasion.
            Meet your next celebration look.
          </p>
          <small className={styles.note}>
            Stitched 3-piece concepts. Garment components, fabric and embellishment details will be confirmed by BATOOL.
          </small>
          <Link href={collectionHref()} className="text-link">
            Explore 3-Piece <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
      <section className="brand-note">
        <p className="eyebrow">THE WORLD OF BATOOL</p>
        <h2>Familiar roots. Fresh perspective.</h2>
        <p>
          Thoughtfully stitched 3-piece Pakistani ensembles, from everyday
          favourites to occasion-ready looks. Discover BATOOL ready-to-wear in S–XL.
        </p>
        <span className="ornament">✧</span>
      </section>
      <section className={styles.highlights} aria-label="3-piece fit and tailoring highlights">
        <div className={styles.highlight}>
          <Shirt className={styles.icon} size={48} strokeWidth={1} aria-hidden="true" focusable="false" />
          <span className={styles.number} aria-hidden="true">01</span>
          <h3>Complete <span className={styles.keepTogether}>3-Piece</span> Ensembles</h3>
          <p>Concept styling; garment details await confirmation</p>
        </div>
        <div className={styles.highlight}>
          <Scissors className={styles.icon} size={48} strokeWidth={1} aria-hidden="true" focusable="false" />
          <span className={styles.number} aria-hidden="true">02</span>
          <h3>Precision Tailoring</h3>
          <p>Demo sizes S–XL; final fit awaits confirmation</p>
        </div>
        <div className={styles.highlight}>
          <Gift className={styles.icon} size={48} strokeWidth={1} aria-hidden="true" focusable="false" />
          <span className={styles.number} aria-hidden="true">03</span>
          <h3>Ready to Wear</h3>
          <p>Dispatched in 48 hours with 7-day size exchange</p>
        </div>
      </section>
    </>
  );
}
