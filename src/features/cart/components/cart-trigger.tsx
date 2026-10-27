"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { BagIcon } from "@/components/ui/icons";
import { useCartCount } from "../model/store";

const CartDrawer = dynamic(() => import("./cart-drawer"));

export function CartTrigger() {
  const count = useCartCount();
  const [open, setOpen] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);
  const bounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOpenCart() {
      setOpen(true);
    }

    function handleCartBounce() {
      setIsBouncing(true);
      if (bounceTimeout.current) clearTimeout(bounceTimeout.current);
      bounceTimeout.current = setTimeout(() => {
        setIsBouncing(false);
      }, 600);
    }

    window.addEventListener("batool:open-cart", handleOpenCart);
    window.addEventListener("batool:cart-bounce", handleCartBounce);

    return () => {
      window.removeEventListener("batool:open-cart", handleOpenCart);
      window.removeEventListener("batool:cart-bounce", handleCartBounce);
      if (bounceTimeout.current) clearTimeout(bounceTimeout.current);
    };
  }, []);

  return (
    <>
      <button
        id="cart-trigger-btn"
        data-cart-target="true"
        aria-label={`Open shopping bag, ${count} items`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={isBouncing ? "cart-trigger-bouncing" : undefined}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
      >
        <BagIcon />
        <span id="count">{count}</span>
      </button>
      {open && <CartDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
