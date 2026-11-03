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
import { publicBusinessSettings as settings } from "@/features/settings/model/generated/public-settings";
import { shippingDescription } from "@/features/settings/model/shipping";
import { checkoutIsWired, isSampleItem, releaseCopy } from "@/features/checkout/model/release-copy";
type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return catalogRepository.list().map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = catalogRepository.findBySlug((await params).slug);
  return { title: p?.name ?? "Product not found", description: p?.description,
    ...(p ? { alternates: { canonical: `/products/${p.slug}/` } } : {}) };
}
export default async function ProductPage({ params }: Props) {
  const p = catalogRepository.findBySlug((await params).slug);
  if (!p) notFound();
  const image = productImagePresentation(p);
  const sample = isSampleItem(p);
  const copy = releaseCopy(checkoutIsWired(), sample);
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
            uploadedImage={p.uploadedImage}
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
          <div className={styles.ensemble}>
            <p>Complete Stitched 3-Piece Ensemble</p>
            <span>{sample ? "Concept styling; garment details await confirmation." : "See this product’s description; confirm any unlisted details with BATOOL."}</span>
          </div>
          <p className={styles.description}>{p.description}</p>
          <AddToBag key={p.id} product={p} />
          <p className={styles.disclosure}>
            {copy.item} {sample && copy.availability}
          </p>
          <div className={styles.details}>
            <details>
              <summary>{sample ? "3-Piece Concept Details" : "Garment details"}</summary>
              <p>{sample ? "Illustrative styling for a stitched 3-piece ensemble. Exact garment components, fabric composition, lining and embellishment specifications await brand confirmation." : "Refer to the product description. Contact BATOOL about materials, lining or embellishments that are not listed."}</p>
            </details>
            <details>
              <summary>Tailoring &amp; Fit</summary>
              <p>
                {sample ? "Demo size options" : "Listed size options"}: {p.sizes.join(", ") || "none currently selectable"}.
                {sample ? " Open the Size & Fit Guide above for sample measurements. Final garment details and fit await brand confirmation." : " A size label is not a garment measurement. Confirm style-specific measurements with BATOOL before ordering."}
              </p>
              <p><Link href="/help/size/">Read size guidance</Link></p>
            </details>
            <details>
              <summary>Delivery &amp; returns</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{shippingDescription(settings.shipping)} {settings.policy_text ?? "Delivery times and exchange/refund terms have not been approved for publication."}</p>
              <p><Link href="/help/delivery/">Read delivery and returns information</Link></p>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
