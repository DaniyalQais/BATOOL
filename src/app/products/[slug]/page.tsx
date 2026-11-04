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
  return {
    title: p ? `${p.name} · Luxury 3-Piece Stitched Pret | BATOOL` : "Product not found",
    description: p?.description,
    ...(p ? { alternates: { canonical: `/products/${p.slug}/` } } : {}),
  };
}

export default async function ProductPage({ params }: Props) {
  const p = catalogRepository.findBySlug((await params).slug);
  if (!p) notFound();
  const image = productImagePresentation(p);
  const sample = isSampleItem(p);
  const copy = releaseCopy(checkoutIsWired(), sample);

  const whatsappMessage = encodeURIComponent(
    `Salam BATOOL, I would like to inquire about the ${p.name} 3-Piece Stitched ensemble (${formatPrice(p.price)}). Please assist me with availability.`
  );

  return (
    <main id="main" className={styles.page}>
      {/* Editorial Breadcrumbs */}
      <nav className={styles.breadcrumbBar} aria-label="Breadcrumb">
        <div className={styles.breadcrumbs}>
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href="/#collection">Ready-to-Wear</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.currentCrumb}>{p.name}</span>
        </div>
        <Link href="/#collection" className={styles.backLink}>
          ← Back to collection
        </Link>
      </nav>

      <div className={styles.layout}>
        {/* Photography Showcase */}
        <div className={styles.galleryColumn}>
          <figure
            className={styles.photography}
            style={{
              "--photo-aspect": `${image.width} / ${image.height}`,
              "--photo-desktop-width": `${image.desktopWidth}px`,
              "--photo-mobile-width": image.mobileWidth,
            } as CSSProperties}
          >
            <div className={styles.photoFrame}>
              <span className={styles.photoTag}>✦ 3-PIECE STITCHED</span>
              <ProductPhoto
                slug={p.imageSlug}
                uploadedImage={p.uploadedImage}
                alt={`${p.name}: ${p.description}. ${p.imageNote ?? "Sample editorial imagery."}`}
                className={styles.photo}
                priority
                sizes={image.sizes}
              />
            </div>
            <figcaption className={styles.caption}>
              {image.caption}
            </figcaption>
          </figure>
        </div>

        {/* Product Details & Ordering */}
        <div className={styles.information}>
          <div className={styles.headerBlock}>
            <span className={styles.categoryBadge}>
              {categoryLabels[p.category].toUpperCase()} · READY-TO-WEAR
            </span>
            <h1 className={styles.title}>{p.name}</h1>
            <div className={styles.priceRow}>
              <span className={styles.price}>{formatPrice(p.price)}</span>
              <span className={styles.taxPill}>Inclusive of all taxes</span>
            </div>
          </div>

          {/* 3-Piece Ensemble Composition Card */}
          <div className={styles.ensembleCard}>
            <div className={styles.ensembleHeader}>
              <span className={styles.sparkleIcon}>✦</span>
              <strong className={styles.ensembleTitle}>Complete Stitched 3-Piece Ensemble</strong>
            </div>
            <ul className={styles.ensembleList}>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span><strong>Stitched Kurta (Shirt):</strong> Master-tailored with detailed collar &amp; sleeve cuffs</span>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span><strong>Stitched Trousers:</strong> Coordinated matching tailored silhouette</span>
              </li>
              <li>
                <span className={styles.checkIcon}>✓</span>
                <span><strong>Pure Dupatta:</strong> Complete finish with delicate borders</span>
              </li>
            </ul>
            <span className={styles.ensembleNote}>
              {sample
                ? "Concept styling; garment details await confirmation."
                : "See this product’s description; confirm any unlisted details with BATOOL."}
            </span>
          </div>

          <p className={styles.description}>{p.description}</p>

          {/* Add to Bag (includes Size Selection & Size Guide) */}
          <AddToBag key={p.id} product={p} />

          {/* WhatsApp Direct Concierge Order */}
          {settings.public_whatsapp && (
            <a
              href={`https://wa.me/${settings.public_whatsapp}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsappButton}
            >
              <span className={styles.whatsappIcon} aria-hidden="true">💬</span>
              <span>Order via WhatsApp Concierge</span>
            </a>
          )}

          {/* Trust & Delivery Pillars */}
          <div className={styles.trustStrip}>
            <div className={styles.trustItem}>
              <span className={styles.trustEmoji}>🚚</span>
              <div>
                <strong>Express Nationwide Delivery</strong>
                <small>3–5 days across Pakistan via TCS &amp; Trax</small>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustEmoji}>💵</span>
              <div>
                <strong>Cash on Delivery (COD)</strong>
                <small>Pay at your doorstep with confidence</small>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustEmoji}>📦</span>
              <div>
                <strong>Open Parcel Inspection</strong>
                <small>Check your ensemble before payment</small>
              </div>
            </div>
            <div className={styles.trustItem}>
              <span className={styles.trustEmoji}>🔄</span>
              <div>
                <strong>7-Day Easy Exchange</strong>
                <small>Hassle-free size &amp; style assistance</small>
              </div>
            </div>
          </div>

          <p className={styles.disclosure}>
            {copy.item} {sample && copy.availability}
          </p>

          {/* Accordion Details */}
          <div className={styles.details}>
            <details className={styles.accordion}>
              <summary className={styles.accordionHeader}>
                <span>{sample ? "3-Piece Concept Details" : "Garment & Fabric Details"}</span>
                <span className={styles.accordionIcon}>+</span>
              </summary>
              <div className={styles.accordionBody}>
                <p>
                  {sample
                    ? "Illustrative styling for a stitched 3-piece ensemble. Exact garment components, fabric composition, lining and embellishment specifications await brand confirmation."
                    : "Refer to the product description. Contact BATOOL about materials, lining or embellishments that are not listed."}
                </p>
              </div>
            </details>

            <details className={styles.accordion}>
              <summary className={styles.accordionHeader}>
                <span>Tailoring &amp; Fit</span>
                <span className={styles.accordionIcon}>+</span>
              </summary>
              <div className={styles.accordionBody}>
                <p>
                  {sample ? "Demo size options" : "Listed size options"}: {p.sizes.join(", ") || "none currently selectable"}.
                  {sample
                    ? " Open the Size & Fit Guide above for sample measurements. Final garment details and fit await brand confirmation."
                    : " A size label is not a garment measurement. Confirm style-specific measurements with BATOOL before ordering."}
                </p>
                <p><Link href="/help/size/" className={styles.detailLink}>Read size guidance →</Link></p>
              </div>
            </details>

            <details className={styles.accordion}>
              <summary className={styles.accordionHeader}>
                <span>Delivery &amp; Exchange Terms</span>
                <span className={styles.accordionIcon}>+</span>
              </summary>
              <div className={styles.accordionBody}>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {shippingDescription(settings.shipping)} {settings.policy_text ?? "Delivery times and exchange/refund terms have not been approved for publication."}
                </p>
                <p><Link href="/help/delivery/" className={styles.detailLink}>Read delivery and returns information →</Link></p>
              </div>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
