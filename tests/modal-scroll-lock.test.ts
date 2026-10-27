import { test } from "node:test";
import assert from "node:assert/strict";
import { lockPageScroll } from "../src/components/ui/modal-scroll-lock.ts";

// Minimal style/document ports for the production helper, not a copied scroll lock.
function style() {
  const properties = new Map<string, { value: string; priority: string }>();
  return {
    getPropertyValue: (key: string) => properties.get(key)?.value ?? "",
    getPropertyPriority: (key: string) => properties.get(key)?.priority ?? "",
    setProperty: (key: string, value: string, priority = "") => { properties.set(key, { value, priority }); },
    removeProperty: (key: string) => { const value = properties.get(key)?.value ?? ""; properties.delete(key); return value; },
  };
}
function setup() {
  const body = style();
  const root = style();
  const positions: ScrollToOptions[] = [];
  const page = { body: { style: body }, documentElement: { style: root, clientWidth: 980 } } as unknown as Document;
  const view = {
    scrollX: 12, scrollY: 460, innerWidth: 1000,
    getComputedStyle: () => ({ paddingRight: "8px" }),
    scrollTo: (value: ScrollToOptions) => positions.push(value),
  } as unknown as Window;
  return { body, root, positions, page, view };
}

test("modal scroll lock restores prior styles, priorities and position while preserving unrelated style changes", () => {
  const { body, root, positions, page, view } = setup();
  body.setProperty("position", "relative");
  body.setProperty("padding-right", "8px");
  root.setProperty("overflow", "scroll", "important");
  const release = lockPageScroll(page, view);
  assert.equal(body.getPropertyValue("position"), "fixed");
  assert.equal(body.getPropertyValue("top"), "-460px");
  assert.equal(body.getPropertyValue("padding-right"), "28px");
  assert.equal(root.getPropertyValue("overflow"), "hidden");
  body.setProperty("color", "plum");
  release();
  release();
  assert.equal(body.getPropertyValue("position"), "relative");
  assert.equal(body.getPropertyValue("padding-right"), "8px");
  assert.equal(body.getPropertyValue("top"), "");
  assert.equal(body.getPropertyValue("color"), "plum");
  assert.equal(root.getPropertyValue("overflow"), "scroll");
  assert.equal(root.getPropertyPriority("overflow"), "important");
  assert.deepEqual(positions, [{ left: 12, top: 460, behavior: "instant" }]);
});

test("overlapping dialog locks release once, in either close/unmount order", () => {
  for (const reverse of [false, true]) {
    const { body, positions, page, view } = setup();
    const a = lockPageScroll(page, view);
    const b = lockPageScroll(page, view);
    const [first, last] = reverse ? [b, a] : [a, b];
    first();
    first();
    assert.equal(body.getPropertyValue("position"), "fixed");
    assert.equal(positions.length, 0);
    last();
    assert.equal(body.getPropertyValue("position"), "");
    assert.equal(positions.length, 1);
    const again = lockPageScroll(page, view);
    again();
    assert.equal(positions.length, 2);
  }
});
