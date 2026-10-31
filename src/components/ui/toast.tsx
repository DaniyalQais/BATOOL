"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import { CatalogImage } from "@/components/ui/catalog-image";
import type { UploadedProductImage } from "../../../supabase/functions/_shared/image-policy";
import { formatPrice } from "@/lib/format";
import styles from "./toast.module.css";

export interface ToastItem {
  id: string;
  product: {
    id: number;
    name: string;
    price: number;
    imageSlug: string;
    uploadedImage?: UploadedProductImage;
  };
  size?: string;
  message?: string;
  duration?: number;
}

type ToastListener = () => void;
let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function emit() {
  listeners.forEach((l) => l());
}

const EMPTY_TOASTS: ToastItem[] = [];

const toastStore = {
  subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return toasts;
  },
  getServerSnapshot() {
    return EMPTY_TOASTS;
  },
  add(item: Omit<ToastItem, "id">) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      ...item,
      id,
      duration: item.duration ?? 5000,
    };
    toasts = [newToast, ...toasts.slice(0, 2)];
    emit();
    return id;
  },
  remove(id: string) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
};

export function showToast(item: Omit<ToastItem, "id">) {
  return toastStore.add(item);
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isDismissing, setIsDismissing] = useState(false);

  const triggerDismiss = useCallback(() => {
    setIsDismissing(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 250);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      triggerDismiss();
    }, toast.duration ?? 3500);

    return () => clearTimeout(timer);
  }, [toast.duration, triggerDismiss]);

  const handleOpenCart = () => {
    window.dispatchEvent(new CustomEvent("batool:open-cart"));
    triggerDismiss();
  };

  const isSimpleMessage = Boolean(toast.message && !toast.product?.imageSlug);

  return (
    <div
      className={styles.toast}
      role="status"
      aria-live="polite"
      data-dismissing={isDismissing}
      style={isSimpleMessage ? { gridTemplateColumns: "1fr auto", minWidth: "200px", width: "auto" } : undefined}
    >
      {toast.product?.imageSlug ? (
        <div className={styles.thumbnailWrapper}>
          <CatalogImage
            src={toast.product.imageSlug}
            uploadedImage={toast.product.uploadedImage}
            alt={toast.product.name}
            width={48}
            height={64}
            className={styles.thumbnail}
          />
        </div>
      ) : null}

      <div className={styles.content}>
        <h4 className={styles.title}>
          {toast.message ? toast.message : `Added to Bag - ${toast.product.name}`}
        </h4>
        {toast.product?.price > 0 && (
          <p className={styles.meta}>
            {toast.size && <span>Size {toast.size}</span>}
            {toast.size && <span aria-hidden="true">·</span>}
            <span className={styles.price}>{formatPrice(toast.product.price)}</span>
          </p>
        )}
      </div>

      <div className={styles.actions}>
        {!isSimpleMessage && (
          <button
            type="button"
            className={styles.viewBagBtn}
            onClick={handleOpenCart}
            aria-label="View shopping bag"
          >
            View Bag
          </button>
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={triggerDismiss}
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>

      <div
        className={styles.progressBar}
        style={{ animationDuration: `${toast.duration ?? 3500}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}

export function ToastContainer() {
  const activeToasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getServerSnapshot
  );

  const handleDismiss = useCallback((id: string) => {
    toastStore.remove(id);
  }, []);

  if (!activeToasts.length) return null;

  return (
    <div className={styles.container} aria-label="Notifications">
      {activeToasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
