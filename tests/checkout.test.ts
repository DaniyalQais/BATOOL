import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutTotals, expressShipping } from "../src/features/cart/model/checkout.ts";
import { getProductBySlug } from "../src/features/catalog/model/products.ts";

test("checkout carries quantities and distinct selected sizes into the COD total", () => {
  const product = getProductBySlug("mira")!;
  const lines = [
    { id: product.id, size: "S" as const, quantity: 2 },
    { id: product.id, size: "XL" as const, quantity: 1 },
  ];
  const totals = checkoutTotals(lines);
  assert.equal(totals.subtotal, product.price * 3);
  assert.equal(totals.total, product.price * 3);
  assert.equal(totals.shipping, 0);
  assert.equal(expressShipping.cost, 0);
});

test("privilege discount applies to garments and cannot create a negative empty-bag total", () => {
  const product = getProductBySlug("zeenat")!;
  const totals = checkoutTotals([{ id: product.id, size: "M", quantity: 1 }], true);
  assert.equal(totals.discount, Math.round(product.price * 0.1));
  assert.equal(totals.total, product.price - totals.discount);
  assert.deepEqual(checkoutTotals([], true), { subtotal: 0, discount: 0, shipping: 0, total: 0 });
});
