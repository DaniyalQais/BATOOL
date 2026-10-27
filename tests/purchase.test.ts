import { test } from "node:test";
import assert from "node:assert/strict";
import { products, getProductById } from "../src/features/catalog/model/products.ts";
import { initialPurchaseOption, submitPurchase } from "../src/features/catalog/model/purchase.ts";
import { createCartStore } from "../src/features/cart/model/cart-store.ts";
import { MAX_QUANTITY } from "../src/features/cart/model/cart.ts";

test("every stitched product starts unselected and requires a valid size", () => {
  for (const product of products) {
    assert.equal(initialPurchaseOption(product), null);
    let calls = 0;
    for (const size of [null, "", "One size", "XS", "XXL"]) {
      const result = submitPurchase(product, size, () => { calls++; return true; });
      assert.equal(result.success, false);
      assert.match(result.message, /Choose a valid size/);
    }
    assert.equal(calls, 0);
  }
});

test("each stitched product adds its selected size through the production store", () => {
  let persisted = "[]";
  const store = createCartStore({
    read: () => persisted,
    write: value => { persisted = value; },
    listen: () => () => {},
  });
  for (const product of products) {
    assert.equal(submitPurchase(product, "M", store.actions.add).success, true);
    assert.equal(submitPurchase(product, "M", store.actions.add).success, true);
  }
  assert.deepEqual(store.getSnapshot(), products.map(product => ({ id: product.id, size: "M", quantity: 2 })));
});

test("product purchases preserve chosen sizes and report quantity caps in memory-only mode", () => {
  const product = getProductById(7)!;
  const store = createCartStore({
    read: () => "[]",
    write: () => { throw new Error("writes unavailable"); },
    listen: () => () => {},
  });
  for (let n = 0; n < MAX_QUANTITY; n++) {
    assert.equal(submitPurchase(product, "L", store.actions.add).success, true);
  }
  const result = submitPurchase(product, "L", store.actions.add);
  assert.equal(result.success, false);
  assert.match(result.message, /maximum quantity.*Mira \(L\)/);
  assert.equal(submitPurchase(product, "S", store.actions.add).success, true);
  assert.deepEqual(store.getSnapshot(), [
    { id: 7, size: "L", quantity: MAX_QUANTITY },
    { id: 7, size: "S", quantity: 1 },
  ]);
});
