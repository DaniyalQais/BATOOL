import { test } from "node:test";
import assert from "node:assert/strict";
import { initialQuickOption, submitQuickAdd } from "../src/features/catalog/model/quick-add.ts";
import { products, getProductById } from "../src/features/catalog/model/products.ts";
import { createCartStore } from "../src/features/cart/model/cart-store.ts";

const stitched = getProductById(0)!;
const formal = getProductById(2)!;

test("Quick Add requires explicit selection for every product, even with a single size", () => {
  for (const product of products) assert.equal(initialQuickOption(product), null);
  assert.equal(initialQuickOption({ ...stitched, sizes: ["M"] }), null);
});

test("missing or unavailable sizes never call the cart action", () => {
  let calls = 0;
  const add = () => { calls++; return true; };
  for (const option of [null, "", "One size", "XS", "XXL"]) {
    const result = submitQuickAdd(stitched, option, add);
    assert.equal(result.success, false);
    assert.match(result.message, /Choose a valid size/);
  }
  assert.equal(submitQuickAdd({ ...stitched, sizes: ["S"] }, "M", add).success, false);
  assert.equal(calls, 0);
});

test("Quick Add preserves selected sizes and repeated adds during storage failure", () => {
  const store = createCartStore({
    read: () => "[]",
    write: () => { throw new Error("storage unavailable"); },
    listen: () => () => {},
  });
  assert.equal(submitQuickAdd(stitched, "L", store.actions.add).success, true);
  const repeated = submitQuickAdd(stitched, "L", store.actions.add);
  assert.equal(repeated.success, true);
  assert.match(repeated.message, /Gulnaar \(L\) added/);
  assert.equal(submitQuickAdd(stitched, "M", store.actions.add).success, true);
  assert.equal(submitQuickAdd(formal, "S", store.actions.add).success, true);
  assert.deepEqual(store.getSnapshot(), [
    { id: 0, size: "L", quantity: 2 },
    { id: 0, size: "M", quantity: 1 },
    { id: 2, size: "S", quantity: 1 },
  ]);
});

test("quantity-cap failures are never reported as successful Quick Adds", () => {
  let raw = '[{"id":0,"size":"M","quantity":99}]';
  const store = createCartStore({
    read: () => raw,
    write: value => { raw = value; },
    listen: () => () => {},
  });
  const result = submitQuickAdd(stitched, "M", store.actions.add);
  assert.equal(result.success, false);
  assert.match(result.message, /maximum quantity.*Gulnaar \(M\)/);
  assert.equal(store.getSnapshot()[0].quantity, 99);
});
