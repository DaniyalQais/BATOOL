"use client";
import { memo, useState, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { ProductPhoto } from "@/components/ui/product-photo";
import { EyeIcon } from "@/components/ui/icons";
import { formatPrice } from "@/lib/format";
import { cartActions } from "@/features/cart/model/store";
import { flyToCart } from "@/lib/fly-to-cart";
import { showToast } from "@/components/ui/toast";
import type { Product, Size } from "../model/types";
import { QuickAddDialog } from "./quick-add";
import styles from "./product-card.module.css";

/** Stable product references allow cards to skip unrelated search/sort renders. */
export const ProductCard = memo(function ProductCard({
  product: p,
}: {
  product: Product;
}) {
  const [selectedSize, setSelectedSize] = useState<Size>(() =>
    p.sizes.includes("M" as Size) ? ("M" as Size) : p.sizes[0]
  );
  const [isAdded, setIsAdded] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Add to cart
    cartActions.add(p.id, selectedSize);

    // 1. Button text -> "Added ✓" for 5 seconds then back
    setIsAdded(true);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = setTimeout(() => {
      setIsAdded(false);
    }, 5000);

    // 4. Card scale up slightly (1.02) on add
    setIsScaling(true);
    if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    scaleTimeoutRef.current = setTimeout(() => {
      setIsScaling(false);
    }, 600);

    // 2. Product image fly-to-cart animation to top-right cart icon
    flyToCart(mediaRef.current, p.imageSlug);

    // 3. Toast top-right "Added to Bag - Gulnaar"
    showToast({
      product: p,
      size: selectedSize,
    });
  }

  return (
    <article
      className={`${styles.card} ${isScaling || isAdded ? styles.cardAdding : ""}`}
      style={{
        "--card-position": p.cardPosition ?? "50% 6%",
        "--card-zoom": p.cardZoom ?? 1,
      } as CSSProperties}
    >
      <div className={styles.media} ref={mediaRef}>
        <Link
          href={`/products/${p.slug}/`}
          className={styles.imageLink}
          aria-label={`View ${p.name}`}
        >
          <ProductPhoto
            slug={p.imageSlug}
            alt={`${p.name}: ${p.description}. ${p.imageNote ?? "Sample editorial imagery."}`}
            className={styles.photo}
            sizes="(max-width: 560px) calc(44vw - 7px), (max-width: 900px) calc(45vw - 7px), (max-width: 1600px) calc(22.5vw - 16.5px), 344px"
          />
        </Link>
        <span className={styles.badge}>{p.tag}</span>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={`${styles.quickAdd} ${isAdded ? styles.added : ""}`}
            onClick={handleAddToCart}
            aria-label={isAdded ? `Added ${p.name} to Bag` : `Add ${p.name} to Bag`}
          >
            <span>{isAdded ? "Added ✓" : "Add to Bag"}</span>
            <span aria-hidden="true">{isAdded ? "✓" : "+"}</span>
          </button>
          <button
            type="button"
            className={styles.quickViewBtn}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setQuickViewOpen(true);
            }}
            aria-label={`Quick View / Details for ${p.name}`}
            title="Quick View"
          >
            <EyeIcon />
          </button>
        </div>
      </div>

      <div className={styles.details}>
        <Link className={styles.name} href={`/products/${p.slug}/`}>
          {p.name}
        </Link>
        <p className={styles.description}>{p.description}</p>
        <ul className={styles.sizes} aria-label={`Available sizes for ${p.name}`}>
          {p.sizes.map((size) => (
            <li key={size}>
              <button
                type="button"
                className={selectedSize === size ? styles.sizeSelected : styles.sizeBtn}
                onClick={() => setSelectedSize(size)}
                aria-pressed={selectedSize === size}
                aria-label={`Select size ${size}`}
              >
                {size}
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.price}>{formatPrice(p.price)}</p>
      </div>

      {quickViewOpen && (
        <QuickAddDialog
          product={p}
          initialSize={selectedSize}
          onClose={() => setQuickViewOpen(false)}
        />
      )}
    </article>
  );
});
