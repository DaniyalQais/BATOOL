import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutIsWired, isSampleItem, releaseCopy } from "../src/features/checkout/model/release-copy.ts";

test("build wiring requires both release approval and endpoint", () => {
  const oldRelease = process.env.NEXT_PUBLIC_CHECKOUT_RELEASE;
  const oldEndpoint = process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT;
  try {
    for (const [release, endpoint, expected] of [
      ["false", "https://example.invalid", false], ["true", "", false],
      ["true", "https://example.invalid", true],
    ] as const) {
      process.env.NEXT_PUBLIC_CHECKOUT_RELEASE = release;
      process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT = endpoint;
      assert.equal(checkoutIsWired(), expected);
    }
  } finally {
    if (oldRelease === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_RELEASE;
    else process.env.NEXT_PUBLIC_CHECKOUT_RELEASE = oldRelease;
    if (oldEndpoint === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT;
    else process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT = oldEndpoint;
  }
});

test("sample provenance survives release and unknown provenance stays conservative", () => {
  assert.equal(isSampleItem(), true);
  assert.equal(isSampleItem({}), true);
  assert.equal(isSampleItem({ isDemo: false }), false);
  for (const wired of [false, true]) {
    const copy = releaseCopy(wired, true);
    assert.match(copy.item, /Sample.*cannot be ordered/);
    assert.match(copy.addLabel, /demo/);
  }
});

test("genuine merchandise copy does not turn wiring into ordering approval", () => {
  const closed = releaseCopy(false, false);
  assert.match(closed.availability, /not enabled/);
  assert.doesNotMatch(closed.addLabel, /demo/);
  const wired = releaseCopy(true, false);
  assert.match(wired.availability, /Check checkout/);
  assert.match(wired.item, /snapshot/);
  assert.match(wired.bagNotice, /does not place an order or confirm payment/);
});
