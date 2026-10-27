import { test } from "node:test";
import assert from "node:assert/strict";
import { createCartStore } from "../src/features/cart/model/cart-store.ts";

const bag = (quantity: number) => JSON.stringify([{ id: 0, size: "M", quantity }]);
function setup(raw: string | null = null) {
  const storage = { raw, failRead: false, failWrite: false, reads: 0, writes: 0 };
  const handlers = new Set<(event: { key: string | null }) => void>();
  const store = createCartStore({
    read() {
      storage.reads++;
      if (storage.failRead) throw new Error("read blocked");
      return storage.raw;
    },
    write(value) {
      storage.writes++;
      if (storage.failWrite) throw new Error("write blocked");
      storage.raw = value;
    },
    listen(notify) {
      handlers.add(notify);
      return () => { handlers.delete(notify); };
    },
  });
  return { store, storage, handlers, event(key: string | null = "batool-bag") {
    handlers.forEach((handler) => handler({ key }));
  } };
}

test("restoration drops retired sizes and the next add persists only supported selections", () => {
  const { store, storage } = setup('[{"id":0,"size":"XS","quantity":2},{"id":0,"size":"M","quantity":1}]');
  const stop = store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot(), [{ id: 0, size: "M", quantity: 1 }]);
  assert.equal(store.getCount(), 1);
  assert.equal(store.actions.add(0, "S"), true);
  assert.deepEqual(JSON.parse(storage.raw!), [
    { id: 0, size: "M", quantity: 1 },
    { id: 0, size: "S", quantity: 1 },
  ]);
  stop();
});

test("successful reads and failed writes preserve two matching adds", () => {
  for (const raw of [null, "[]", bag(1)]) {
    const { store, storage } = setup(raw);
    storage.failWrite = true;
    assert.equal(store.actions.add(0, "M"), true);
    assert.equal(store.actions.add(0, "M"), true);
    assert.equal(store.getCount(), raw === bag(1) ? 3 : 2);
    assert.equal(storage.writes, 1);
    assert.equal(storage.reads, 1);
  }
});

test("stale storage cannot undo quantity changes or resurrect removed lines", () => {
  const { store, storage } = setup(bag(2));
  const unsubscribe = store.subscribe(() => {});
  storage.failWrite = true;
  store.actions.change(0, "M", 3);
  store.actions.add(0, "M");
  assert.equal(store.getCount(), 6);
  store.actions.remove(0, "M");
  assert.deepEqual(store.getSnapshot(), []);
  store.actions.add(0, "M");
  assert.equal(store.getCount(), 1);
  store.actions.change(0, "M", -1);
  store.actions.add(0, "M");
  assert.equal(store.getCount(), 1);
  unsubscribe();
});

test("memory-only policy survives events and resubscription without retries", () => {
  const { store, storage, handlers, event } = setup();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  storage.failWrite = true;
  store.actions.add(0, "M");
  const unsaved = store.getSnapshot();
  storage.raw = bag(9);
  storage.failWrite = false;
  event();
  event(null);
  assert.equal(store.getSnapshot(), unsaved);
  unsubscribe();
  assert.equal(handlers.size, 0);
  const stop = store.subscribe(() => { notifications++; });
  assert.equal(handlers.size, 1);
  assert.equal(store.getSnapshot(), unsaved);
  store.actions.add(0, "M");
  assert.equal(store.getCount(), 2);
  assert.equal(notifications, 2);
  assert.equal(storage.writes, 1);
  assert.equal(storage.raw, bag(9));
  stop();
  assert.equal(handlers.size, 0);
});

test("normal restoration, persistence, cross-tab updates and cleanup work", () => {
  const { store, storage, handlers, event } = setup('[{"id":0,"size":"M","qty":2}]');
  const server = store.getServerSnapshot();
  const stop = store.subscribe(() => {});
  const stopOther = store.subscribe(() => {});
  assert.equal(handlers.size, 1);
  assert.equal(store.getCount(), 2);
  store.actions.add(0, "M");
  assert.equal(storage.raw, bag(3));
  store.actions.change(0, "M", 1);
  assert.equal(storage.raw, bag(4));
  storage.raw = bag(8);
  event("other-key");
  assert.equal(store.getCount(), 4);
  event();
  assert.equal(store.getCount(), 8);
  const snapshot = store.getSnapshot();
  event();
  assert.equal(store.getSnapshot(), snapshot);
  storage.raw = null;
  event(null);
  assert.equal(store.getCount(), 0);
  storage.raw = bag(99);
  event();
  assert.equal(store.actions.add(0, "M"), false);
  assert.equal(store.getCount(), 99);
  store.actions.remove(0, "M");
  assert.equal(storage.raw, "[]");
  assert.equal(store.getServerSnapshot(), server);
  assert.deepEqual(server, []);
  assert.equal(store.getServerCount(), 0);
  stop();
  assert.equal(handlers.size, 1);
  stopOther();
  assert.equal(handlers.size, 0);
  storage.raw = bag(7);
  const stopAgain = store.subscribe(() => {});
  assert.equal(store.getCount(), 7);
  stopAgain();
});

test("both reads and writes throwing leave an operational in-memory cart", () => {
  const { store, storage, event } = setup();
  storage.failRead = storage.failWrite = true;
  const stop = store.subscribe(() => {});
  store.actions.add(0, "M");
  store.actions.add(0, "M");
  store.actions.change(0, "M", 2);
  event();
  assert.equal(store.getCount(), 4);
  store.actions.remove(0, "M");
  assert.deepEqual(store.getSnapshot(), []);
  stop();
});
