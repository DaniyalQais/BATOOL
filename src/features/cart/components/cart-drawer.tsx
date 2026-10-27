"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ProductPhoto } from "@/components/ui/product-photo";
import { getProductById } from "@/features/catalog/model/products";
import { collectionHref } from "@/features/catalog/model/catalog";
import { formatPrice } from "@/lib/format";
import { useCartItems, cartActions } from "../model/store";
import { cartSubtotal, MAX_QUANTITY, type CartLine } from "../model/cart";
import { cartLineKey, removalFocusTarget } from "../model/drawer-focus";
import styles from "./cart-drawer.module.css";

export default function CartDrawer({ onClose }: { onClose: () => void }) {
  const items = useCartItems();
  const [checkout, setCheckout] = useState(false);
  const [message, setMessage] = useState("");
  const rows = useRef(new Map<string, HTMLLIElement>());
  const emptyLink = useRef<HTMLAnchorElement>(null);
  const checkoutButton = useRef<HTMLButtonElement>(null);
  const checkoutHeading = useRef<HTMLHeadingElement>(null);
  const previousCheckout = useRef(false);
  const focusedLine = useRef<string | null>(null);
  const previousItems = useRef(items);
  const intent = useRef<{ line: CartLine; before: readonly CartLine[] } | null>(null);
  const total = cartSubtotal(items);
  const showCheckout = checkout && items.length > 0;

  function focusAfterRemoval(before: readonly CartLine[], key: string) {
    const target = removalFocusTarget(before, items, key);
    if (target) rows.current.get(target)?.querySelector<HTMLButtonElement>('[data-action="remove"]')?.focus();
    else emptyLink.current?.focus();
  }

  useLayoutEffect(() => {
    const action = intent.current;
    intent.current = null;
    if (action) {
      const key = cartLineKey(action.line);
      const next = items.find((line) => cartLineKey(line) === key);
      const name = getProductById(action.line.id)!.name;
      if (!next) {
        focusAfterRemoval(action.before, key);
        setMessage(`${name} (${action.line.size}) removed from your bag.`);
      } else if (next.quantity !== action.line.quantity) {
        setMessage(`${name} (${next.size}) quantity: ${next.quantity}.`);
        if (next.quantity === MAX_QUANTITY) {
          rows.current.get(key)?.querySelector<HTMLButtonElement>('[data-action="decrease"]')?.focus();
        }
      }
    } else if (focusedLine.current && !items.some((line) => cartLineKey(line) === focusedLine.current)
      && (document.activeElement === document.body || document.activeElement instanceof HTMLDialogElement)) {
      // A storage update may also remove the line that contained keyboard focus.
      focusAfterRemoval(previousItems.current, focusedLine.current);
    }
    previousItems.current = items;
  }, [items]);

  useLayoutEffect(() => {
    if (showCheckout && !previousCheckout.current) checkoutHeading.current?.focus();
    if (!showCheckout && previousCheckout.current) {
      if (items.length) checkoutButton.current?.focus();
      else emptyLink.current?.focus();
      setCheckout(false);
    }
    previousCheckout.current = showCheckout;
  }, [showCheckout, items.length]);

  function change(line: CartLine, delta: number, button: HTMLButtonElement) {
    button.focus();
    intent.current = { line, before: items };
    cartActions.change(line.id, line.size, delta);
  }

  return (
    <Modal label="shopping bag" onClose={onClose} className={styles.drawer}
      header={<h2 className={styles.heading}>Shopping bag</h2>}
      headerClassName={styles.header} closeButtonClassName={styles.closeButton}>
      <div className={styles.content} onFocusCapture={(event) => {
        focusedLine.current = (event.target as HTMLElement).closest<HTMLElement>('[data-cart-line]')?.dataset.cartLine ?? null;
      }}>
        {!items.length ? (
          <div className={styles.empty}>
            <h3>Your bag awaits.</h3>
            <p>Discover a piece that feels like you.</p>
            <Link ref={emptyLink} href={collectionHref()} onNavigate={onClose} className={styles.primary}>
              Explore the collection <span aria-hidden="true">↗</span>
            </Link>
          </div>
        ) : showCheckout ? (
          <div className={styles.checkout}>
            <h3 ref={checkoutHeading} tabIndex={-1}>Your edit looks lovely.</h3>
            <p>Bag subtotal: <strong>{formatPrice(total)}</strong></p>
            <p>This is a design preview. No order has been placed and no payment is being collected.</p>
            <p>Live checkout needs the client’s confirmed products, shipping terms and payment or cash-on-delivery setup.</p>
            <button type="button" className={styles.textButton} onClick={() => setCheckout(false)}>Back to bag</button>
          </div>
        ) : (
          <>
            <ul className={styles.items} aria-label="Pieces in your bag">
              {items.map((line) => {
                const product = getProductById(line.id)!;
                const key = cartLineKey(line);
                return (
                  <li key={key} data-cart-line={key} className={styles.item}
                    ref={(node) => { if (node) rows.current.set(key, node); else rows.current.delete(key); }}>
                    <Link href={`/products/${product.slug}/`} onNavigate={onClose} className={styles.thumbnail} aria-label={`View ${product.name}`}>
                      <ProductPhoto slug={product.imageSlug} alt="" className={styles.photo} sizes="64px" />
                    </Link>
                    <div className={styles.itemDetails}>
                      <Link href={`/products/${product.slug}/`} onNavigate={onClose} className={styles.name}>{product.name}</Link>
                      <p>Size: {line.size}</p>
                      <p>Unit price: {formatPrice(product.price)}</p>
                      <div className={styles.controls}>
                        <div className={styles.quantity} role="group" aria-label={`${product.name} ${line.size} quantity`}>
                          <button type="button" data-action="decrease"
                            aria-label={`Decrease ${product.name} ${line.size} quantity${line.quantity === 1 ? "; removes this line" : ""}`}
                            onClick={(event) => change(line, -1, event.currentTarget)}>−</button>
                          <span aria-label={`Quantity ${line.quantity}`}>{line.quantity}</span>
                          <button type="button" disabled={line.quantity === MAX_QUANTITY}
                            aria-label={`Increase ${product.name} ${line.size} quantity`}
                            onClick={(event) => change(line, 1, event.currentTarget)}>+</button>
                        </div>
                        <button type="button" className={styles.textButton} data-action="remove"
                          aria-label={`Remove ${product.name} ${line.size}`}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            intent.current = { line, before: items };
                            cartActions.remove(line.id, line.size);
                          }}>Remove</button>
                      </div>
                      <p className={styles.lineTotal}><span>Line total</span><strong>{formatPrice(cartSubtotal([line]))}</strong></p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={styles.summary}>
              <p className={styles.subtotal}><span>Subtotal</span><strong>{formatPrice(total)}</strong></p>
              <Link href="/checkout/" ref={checkoutButton as any} className={styles.primary} onClick={onClose}>
                Continue to checkout <span aria-hidden="true">→</span>
              </Link>
            </div>
          </>
        )}
        <p className={styles.disclosure}>Demo bag · No orders or payments will be submitted.</p>
        <p role="status" aria-atomic="true" className={styles.feedback}>{message}</p>
      </div>
    </Modal>
  );
}
