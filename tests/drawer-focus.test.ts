import { test } from "node:test";
import assert from "node:assert/strict";
import { createCartStore } from "../src/features/cart/model/cart-store.ts";
import { cartLineKey, removalFocusTarget } from "../src/features/cart/model/drawer-focus.ts";

test("drawer focus follows the next line, previous line, then the empty CTA using actual cart removals", () => {
  const store = createCartStore({
    read: () => "[]", write: () => { throw new Error("writes blocked"); }, listen: () => () => {},
  });
  store.actions.add(0, "M");
  store.actions.add(0, "L");
  store.actions.add(3, "S");
  store.actions.add(2, "XL");
  let before = store.getSnapshot();
  store.actions.remove(0, "M");
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "0:M"), "0:L");
  before = store.getSnapshot();
  store.actions.remove(2, "XL");
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "2:XL"), "3:S");
  before = store.getSnapshot();
  store.actions.change(3, "S", -1);
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "3:S"), "0:L");
  before = store.getSnapshot();
  store.actions.remove(0, "L");
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "0:L"), null);
});

test("drawer focus skips other lines removed by a cross-tab update and keeps size keys distinct", () => {
  let raw = '[{"id":0,"size":"M","quantity":1},{"id":0,"size":"L","quantity":1},{"id":3,"size":"S","quantity":1}]';
  let notify: ((event: { key: string }) => void) | undefined;
  const store = createCartStore({ read: () => raw, write: (value) => { raw = value; }, listen: (fn) => { notify = fn; return () => {}; } });
  const stop = store.subscribe(() => {});
  const before = store.getSnapshot();
  assert.notEqual(cartLineKey(before[0]), cartLineKey(before[1]));
  raw = '[{"id":3,"size":"S","quantity":1}]';
  notify!({ key: "batool-bag" });
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "0:M"), "3:S");
  raw = "[]";
  notify!({ key: "batool-bag" });
  assert.equal(removalFocusTarget(before, store.getSnapshot(), "0:L"), null);
  stop();
});
