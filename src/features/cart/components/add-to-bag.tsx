"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import type { Product, Size } from "@/features/catalog/model/types";
import {
  initialPurchaseOption,
  validPurchaseOption,
  submitPurchase,
} from "@/features/catalog/model/purchase";
import { flyToCart } from "@/lib/fly-to-cart";
import { showToast } from "@/components/ui/toast";
import { cartActions } from "../model/store";
import styles from "./add-to-bag.module.css";

const CartDrawer = dynamic(() => import("./cart-drawer"));

export function AddToBag({ product }: { product: Product }) {
  const [size, setSize] = useState<Size | null>(() => initialPurchaseOption(product));
  const [feedback, setFeedback] = useState({ message: "", additions: 0 });
  const [isAdded, setIsAdded] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [open, setOpen] = useState(false);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstSize = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selectionId = `${id}-selection`;
  const feedbackId = `${id}-feedback`;
  const selected = validPurchaseOption(product, size);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // If size is not selected, do not add to bag; show error message
    if (!size || !selected) {
      setSizeError(true);
      firstSize.current?.focus();
      return;
    }

    setSizeError(false);
    const result = submitPurchase(product, size, cartActions.add);
    setFeedback((previous) => ({
      additions: previous.additions + (result.success ? 1 : 0),
      message: result.success
        ? `${result.message} Added from this page: ${previous.additions + 1}.`
        : result.message,
    }));

    if (result.success) {
      setIsAdded(true);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => {
        setIsAdded(false);
      }, 5000);

      // Card / Photography figure scale up slightly (1.02) on add
      const photoFigure = (document.querySelector('figure[class*="photography"]') || document.querySelector('main figure')) as HTMLElement | null;
      if (photoFigure) {
        photoFigure.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.02)" },
            { transform: "scale(1)" },
          ],
          { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
        );
      }

      // Trigger fly-to-cart from the primary product image to top-right cart icon
      const heroPhoto = document.querySelector(`img[alt*="${product.name}"]`) as HTMLElement | null;
      flyToCart(heroPhoto || photoFigure, product.imageSlug);

      // Show toast: "Added to Bag - [Product Name]"
      showToast({
        product,
        size: size as Size,
      });
    }
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.options} aria-describedby={`${selectionId} ${feedbackId}`}>
          <legend>Select size</legend>
          <div className={`${styles.sizes} ${sizeError ? styles.sizesError : ""}`}>
            {product.sizes.map((option, index) => (
              <button
                key={option}
                ref={index === 0 ? firstSize : undefined}
                type="button"
                className={styles.size}
                aria-pressed={selected === option}
                aria-describedby={`${selectionId} ${feedbackId}`}
                onClick={() => {
                  setSize(option);
                  setSizeError(false);
                  setFeedback((previous) => ({ ...previous, message: "" }));
                }}
              >
                {option}
              </button>
            ))}
          </div>
          <p
            id={selectionId}
            className={`${styles.selection} ${sizeError ? styles.selectionError : ""}`}
            role={sizeError ? "alert" : undefined}
          >
            {sizeError ? (
              <>
                <span aria-hidden="true">⚠️ </span>Please choose your size
              </>
            ) : selected ? (
              <>Selected: <strong>{selected}</strong></>
            ) : (
              "Choose your size before adding."
            )}
          </p>
        </fieldset>
        <button
          type="submit"
          className={`${styles.add} ${isAdded ? styles.added : ""}`}
          style={isAdded ? { background: "var(--plum)", color: "#fff" } : undefined}
        >
          {isAdded ? "Added ✓" : <>Add to Bag <span aria-hidden="true">+</span></>}
        </button>
        <p id={feedbackId} className={styles.feedback} role="status" aria-atomic="true">
          {feedback.message}
        </p>
        <button type="button" className={styles.viewBag} aria-haspopup="dialog"
          aria-expanded={open} onClick={(event) => {
            event.currentTarget.focus();
            setOpen(true);
          }}>
          View shopping bag
        </button>
      </form>
      {open && <CartDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
