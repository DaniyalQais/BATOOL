import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addLine,
  changeQuantity,
  parseCart,
  cartCount,
  cartSubtotal,
  MAX_QUANTITY,
} from "../src/features/cart/model/cart.ts";
test("stitched occasion pieces use validated size and quantity operations", () => {
  let cart = addLine([], 2, "M");
  cart = addLine(cart, 2, "M");
  assert.equal(cartCount(cart), 2);
  assert.equal(cartSubtotal(cart), 29900);
  assert.deepEqual(parseCart(JSON.stringify(cart)), cart);
  assert.equal(addLine(cart, 999, "M"), cart);
  assert.deepEqual(changeQuantity(cart, 2, "M", -2), []);
});
test("cart preserves sizes, merges matching lines, and calculates totals", () => {
  let cart = addLine([], 0, "M");
  cart = addLine(cart, 0, "M");
  cart = addLine(cart, 0, "L");
  assert.equal(cart.length, 2);
  assert.equal(cartCount(cart), 3);
  assert.equal(cartSubtotal(cart), 26850);
  cart = changeQuantity(cart, 0, "L", -1);
  assert.equal(cart.length, 1);
  assert.equal(cartSubtotal(cart), 17900);
});
test("invalid IDs and unavailable sizes cannot enter the cart", () => {
  assert.deepEqual(addLine([], 999, "M"), []);
  for (const id of [1, 4, 5, 6]) assert.deepEqual(addLine([], id, "M"), []);
  assert.deepEqual(parseCart('[{"id":0,"size":"One size","quantity":1}]'), []);
});
test("stored state rejects malformed lines and migrates old quantities", () => {
  assert.deepEqual(parseCart("invalid"), []);
  assert.deepEqual(parseCart("{}"), []);
  const cart = parseCart(
    JSON.stringify([
      { id: 0, size: "M", qty: 2 },
      { id: 0, size: "M", quantity: 3 },
      { id: 1, size: "M", quantity: 1 },
      { id: 2, size: "XL", quantity: -1 },
      { id: 3, size: "S", quantity: 999999 },
    ]),
  );
  assert.deepEqual(cart, [
    { id: 0, size: "M", quantity: 2 },
    { id: 3, size: "S", quantity: MAX_QUANTITY },
  ]);
});
test("quantity cap and no-op updates preserve snapshot identity", () => {
  const cart = parseCart('[{"id":0,"size":"M","quantity":99}]');
  assert.equal(addLine(cart, 0, "M"), cart);
  assert.equal(changeQuantity(cart, 0, "M", 1), cart);
  assert.equal(changeQuantity(cart, 7, "M", 1), cart);
  assert.deepEqual(changeQuantity(cart, 0, "M", -99), []);
});
test("saved bags discard removed product IDs and keep retained products with their original sizes", () => {
  const cart = parseCart(JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(id => ({ id, size: "M", quantity: 1 }))));
  assert.deepEqual(cart.map(line => line.id), [0, 2, 3, 7, 8, 9, 10, 11]);
  assert.equal(cartCount(cart), 8);
  assert.equal(cartSubtotal(cart), 86600);
});
test("Noor's stitched SKU supports sized purchases without reviving its retired option", () => {
  let cart = addLine([], 8, "M");
  cart = addLine(cart, 8, "M");
  assert.deepEqual(cart, [{ id: 8, size: "M", quantity: 2 }]);
  assert.equal(cartSubtotal(cart), 13900);
  assert.deepEqual(parseCart('[{"id":1,"size":"M","quantity":1},{"id":8,"size":"XS","quantity":1}]'), []);
});
test("saved bags discard retired sizes without changing supported sizes or quantities", () => {
  const cart = parseCart(JSON.stringify([
    { id: 0, size: "XS", quantity: 2 },
    { id: 0, size: "S", quantity: 3 },
    { id: 2, size: "M", quantity: 1 },
    { id: 3, size: "L", quantity: 2 },
    { id: 7, size: "XL", quantity: 1 },
  ]));
  assert.deepEqual(cart, [
    { id: 0, size: "S", quantity: 3 },
    { id: 2, size: "M", quantity: 1 },
    { id: 3, size: "L", quantity: 2 },
    { id: 7, size: "XL", quantity: 1 },
  ]);
});
