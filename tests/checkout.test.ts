import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutTotals } from "../src/features/cart/model/checkout.ts";
import { getProductBySlug } from "../src/features/catalog/model/products.ts";

test("bag preview carries quantities and sizes, but does not default unconfigured shipping to zero", () => {
  const product = getProductBySlug("mira")!;
  const lines = [
    { id: product.id, size: "S" as const, quantity: 2 },
    { id: product.id, size: "XL" as const, quantity: 1 },
  ];
  const totals = checkoutTotals(lines);
  assert.equal(totals.subtotal, product.price * 3);
  assert.equal(totals.total, null);
  assert.equal(totals.shipping, null);
});

test("privilege discount applies to garments and cannot create a negative empty-bag total", () => {
  const product = getProductBySlug("zeenat")!;
  const free = { country_code: "PK", currency: "PKR", mode: "free", fee_minor: 0 } as const;
  const totals = checkoutTotals([{ id: product.id, size: "M", quantity: 1 }], true, free);
  assert.equal(totals.discount, Math.round(product.price * 0.1));
  assert.equal(totals.total, product.price - totals.discount);
  assert.deepEqual(checkoutTotals([], true, free), { subtotal: 0, discount: 0, shipping: 0, total: 0 });
  assert.deepEqual(checkoutTotals([], true), { subtotal: 0, discount: 0, shipping: null, total: null });
});
