"use client";
import { useId, useState, useRef, type FormEvent } from "react";
import { CatalogImage } from "@/components/ui/catalog-image";
import { Modal } from "@/components/ui/modal";
import { cartActions } from "@/features/cart/model/store";
import { formatPrice } from "@/lib/format";
import { flyToCart } from "@/lib/fly-to-cart";
import { showToast } from "@/components/ui/toast";
import type { Product, Size } from "../model/types";
import { initialQuickOption, submitQuickAdd, validQuickOption } from "../model/quick-add";
import styles from "./quick-add.module.css";

export function QuickAddDialog({
  product,
  onClose,
  initialSize,
}: {
  product: Product;
  onClose: () => void;
  initialSize?: string | null;
}) {
  const [option, setOption] = useState<string | null>(() => initialSize ?? initialQuickOption(product));
  const [feedback, setFeedback] = useState({ message: "", added: 0 });
  const [isAdded, setIsAdded] = useState(false);
  const addTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const optionId = useId();
  const selected = validQuickOption(product, option);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submitQuickAdd(product, option, cartActions.add);
    setFeedback((previous) => ({
      added: previous.added + (result.success ? 1 : 0),
      message: result.success
        ? `${result.message} Added from this panel: ${previous.added + 1}.`
        : result.message,
    }));

    if (result.success) {
      setIsAdded(true);
      if (addTimeoutRef.current) clearTimeout(addTimeoutRef.current);
      addTimeoutRef.current = setTimeout(() => {
        setIsAdded(false);
      }, 5000);

      // Trigger fly-to-cart animation and toast
      flyToCart(imageRef.current, product.uploadedImage ? null : product.imageSlug);
      showToast({
        product,
        size: option as Size,
      });
    }
  }

  return (
    <Modal label={`Quick Add: ${product.name}`} className={styles.dialog} onClose={onClose}>
      <p className={styles.eyebrow}>QUICK ADD</p>
      <div ref={imageRef} style={{ display: "none" }}>
        <CatalogImage
          src={product.imageSlug}
          uploadedImage={product.uploadedImage}
          alt={product.name}
          width={192}
          height={256}
        />
      </div>
      <h2 className={styles.name}>{product.name}</h2>
      <p className={styles.price}>{formatPrice(product.price)}</p>
      <form onSubmit={submit}>
        <label className={styles.label} htmlFor={optionId}>
          Select size
        </label>
        <select
          id={optionId}
          className={styles.select}
          value={option ?? ""}
          required
          onChange={(event) => {
            setOption(event.target.value);
            setFeedback((previous) => ({ ...previous, message: "" }));
          }}
        >
          <option value="" disabled>Choose your size</option>
          {product.sizes.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <p className={styles.selection}>
          {!product.sizes.length ? "No selectable sizes in this catalog snapshot." : selected ? `Selected: ${selected}` : "Choose a size to enable Add to demo bag."}
        </p>
        <button
          className={styles.add}
          type="submit"
          disabled={!selected}
          style={isAdded ? { background: "var(--plum)", color: "#fff" } : undefined}
        >
          {isAdded ? "Added ✓" : "Add to demo bag"}
        </button>
        <p role="status" aria-live="polite" aria-atomic="true" className={styles.feedback}>
          {feedback.message}
        </p>
      </form>
      <p className={styles.disclosure}>Design preview. No orders or payments will be submitted.</p>
      <button type="button" className={styles.cancel} onClick={onClose}>Cancel / close</button>
    </Modal>
  );
}

export function QuickAdd({
  product,
  triggerClassName,
  selectedSize,
  mediaRef,
}: {
  product: Product;
  triggerClassName: string;
  selectedSize?: Size;
  mediaRef?: React.RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddDirect = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const sizeToAdd = selectedSize || (product.sizes.includes("M" as Size) ? ("M" as Size) : product.sizes[0]);
    const success = cartActions.add(product.id, sizeToAdd);

    if (success) {
      setIsAdded(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsAdded(false);
      }, 5000);

      // Trigger fly-to-cart animation
      flyToCart(mediaRef?.current || null, product.uploadedImage ? null : product.imageSlug);

      // Show toast
      showToast({
        product,
        size: sizeToAdd,
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${triggerClassName} ${isAdded ? styles.added : ""}`}
        aria-label={isAdded ? `Added ${product.name} to Bag` : `Add ${product.name} to Bag`}
        onClick={handleAddDirect}
      >
        <span>{isAdded ? "Added ✓" : "Add to Bag"}</span>
        <span aria-hidden="true">{isAdded ? "✓" : "+"}</span>
      </button>
      {open && (
        <QuickAddDialog
          product={product}
          initialSize={selectedSize}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
