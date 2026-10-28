import { cartSubtotal, type CartLine } from "./cart.ts";

export const expressShipping = {
  label: "Express Shipping",
  estimate: "2–4 business days",
  cost: 0,
} as const;

export function checkoutTotals(items: readonly CartLine[], privilegeDiscount = false) {
  const subtotal = cartSubtotal(items);
  const discount = privilegeDiscount ? Math.round(subtotal * 0.1) : 0;
  const shipping = items.length ? expressShipping.cost : 0;
  return { subtotal, discount, shipping, total: Math.max(0, subtotal - discount + shipping) };
}
