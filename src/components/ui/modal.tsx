"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { lockPageScroll } from "./modal-scroll-lock";
/** Native dialog provides focus trapping, Escape, and focus restoration. */
export function Modal({
  children,
  label,
  onClose,
  className = "",
  header,
  headerClassName,
  closeButtonClassName = "",
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  className?: string;
  header?: ReactNode;
  headerClassName?: string;
  closeButtonClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    const unlock = lockPageScroll(document, window);
    try { dialog.showModal(); } catch (error) { unlock(); throw error; }
    return () => {
      dialog.close();
      unlock();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const closeButton = (
    <button type="button" className={`close ${closeButtonClassName}`} aria-label={`Close ${label}`} onClick={onClose}>
      ×
    </button>
  );
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={className}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      {header ? <div className={headerClassName}>{header}{closeButton}</div> : closeButton}
      {children}
    </dialog>
  );
}
