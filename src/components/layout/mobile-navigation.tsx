"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./header.module.css";

/** A nonmodal disclosure: normal Tab order, with no focus trap or scroll lock. */
export function MobileNavigation({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        if (root.current?.contains(document.activeElement)) button.current?.focus();
        setOpen(false);
      }
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const dismissOnDesktop = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener("pointerdown", dismissOutside);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, [open]);

  return (
    <div
      className={styles.navigation}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d={open ? "m6 6 12 12M6 18 18 6" : "M3 6h18M3 12h18M3 18h18"} />
        </svg>
        <span>Menu</span>
      </button>
      <div
        id={panelId}
        className={styles.panel}
        data-open={open}
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            setOpen(false);
            if (open) button.current?.focus();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
