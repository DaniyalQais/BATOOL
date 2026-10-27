import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { catalogRepository } from "@/features/catalog/model/repository";
import { ProductPhoto } from "@/components/ui/product-photo";
import { AddToBag } from "@/features/cart/components/add-to-bag";
import { formatPrice } from "@/lib/format";
import { categoryLabels } from "@/features/catalog/model/types";
import { productImagePresentation } from "@/features/catalog/model/product-image-presentation";
import styles from "./product-page.module.css";
type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return catalogRepository.list().map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = catalogRepository.findBySlug((await params).slug);
  return { title: p?.name ?? "Product not found", description: p?.description };
}
export default async function ProductPage({ params }: Props) {
  const p = catalogRepository.findBySlug((await params).slug);
  if (!p) notFound();
  const image = productImagePresentation(p);
  return (
    <main id="main" className={styles.page}>
      <Link href="/#collection" className={styles.back}>
        ← Back to collection
      </Link>
      <div className={styles.layout}>
        <figure className={styles.photography} style={{
          "--photo-aspect": `${image.width} / ${image.height}`,
          "--photo-desktop-width": `${image.desktopWidth}px`,
          "--photo-mobile-width": image.mobileWidth,
        } as CSSProperties}>
          <ProductPhoto
            slug={p.imageSlug}
            alt={`${p.name}: ${p.description}. ${p.imageNote ?? "Sample editorial imagery."}`}
            className={styles.photo}
            priority
            sizes={image.sizes}
          />
          <figcaption>
            {image.caption}
          </figcaption>
        </figure>
        <div className={styles.information}>
          <p className={styles.category}>{categoryLabels[p.category].toUpperCase()}</p>
          <h1 className={styles.title}>{p.name}</h1>
          <p className={styles.price}>{formatPrice(p.price)}</p>
          <p className={styles.description}>{p.description}</p>
          <AddToBag key={p.id} product={p} />
          <p className={styles.disclosure}>
            Illustrative product and price. Design preview only: no orders or
            payments will be submitted.
          </p>
          <div className={styles.details}>
            <details>
              <summary>Product details</summary>
              <p>{p.description} A complete stitched 3-piece ensemble; final fabric and embellishment specifications await brand confirmation.</p>
            </details>
            <details>
              <summary>Size guidance</summary>
              <p>
                Available sizes: {p.sizes.join(", ")}, with interior seam allowance. Verified measurements are awaiting brand confirmation; these labels are not confirmed measurements.
              </p>
              <p><Link href="/help/size/">Read size guidance</Link></p>
            </details>
            <details>
              <summary>Delivery and exchanges</summary>
              <p>Dispatched in 48 hours with 7-day size exchange. Delivery charges and full exchange terms will be provided before checkout. No orders are accepted in this preview.</p>
              <p><Link href="/help/delivery/">Read delivery and returns information</Link></p>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
