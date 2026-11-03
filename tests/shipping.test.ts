import test from "node:test";
import assert from "node:assert/strict";
import { shippingConfiguration, unconfiguredShipping, parseShippingFeePKR, shippingDescription, maxShippingFeeMinor } from "../src/features/settings/model/shipping.ts";
import { businessSettings, emptyBusinessSettings } from "../src/features/settings/model/settings.ts";
import { publicSettings, unpublishedPublicSettings } from "../src/features/settings/model/public-settings.ts";
import { checkoutTotals } from "../src/features/cart/model/checkout.ts";
import { products } from "../src/features/catalog/model/products.ts";

test("Owner shipping choice preserves unconfigured, explicit free and flat-rate amounts through private/public mappings", () => {
  for (const shipping of [unconfiguredShipping(),
    { country_code: "PK", currency: "PKR", mode: "free", fee_minor: 0 },
    ...[0, 1, 25050, maxShippingFeeMinor].map(fee_minor => ({ country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor })),
  ]) {
    const privateSettings = businessSettings({ ...emptyBusinessSettings(), shipping });
    assert.deepEqual(privateSettings.shipping, shipping);
    const snapshot = publicSettings({ ...unpublishedPublicSettings(), shipping });
    assert.deepEqual(snapshot.shipping, shipping);
    assert.equal(snapshot.checkout_enabled, false);
    assert.deepEqual(snapshot.available_payment_methods, []);
  }
  assert.deepEqual(unpublishedPublicSettings().shipping, unconfiguredShipping());
});
test("shipping validation rejects missing modes, fee/mode mismatches, fractions, overflow and unsupported coverage", () => {
  const flat = { country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor: 25000 };
  for (const patch of [
    { mode: undefined }, { mode: null }, { mode: "express" }, { mode: "free", fee_minor: 1 },
    { mode: "free", fee_minor: null }, { mode: "unconfigured", fee_minor: 0 },
    { fee_minor: null }, { fee_minor: -1 }, { fee_minor: 0.1 }, { fee_minor: "25000" },
    { fee_minor: Infinity }, { fee_minor: NaN }, { fee_minor: maxShippingFeeMinor + 1 },
    { country_code: "US" }, { currency: "USD" }, { estimate: "tomorrow" },
  ]) assert.throws(() => shippingConfiguration({ ...flat, ...patch }));
  for (const value of [null, [], {}, { country_code: "PK", currency: "PKR", fee_minor: 0 }]) assert.throws(() => shippingConfiguration(value));
});
test("PKR fee input converts exactly to paisa, including explicit zero and decimals, without rounding invalid input", () => {
  for (const [input, expected] of [["0", 0], ["0.00", 0], ["0.01", 1], ["250.5", 25050], ["250.50", 25050], ["000250.50", 25050], ["21474836.47", maxShippingFeeMinor]] as const) {
    assert.equal(parseShippingFeePKR(input), expected);
  }
  for (const input of ["", " ", "-1", "+1", "1.001", "1e2", "NaN", "Infinity", "1,000", "250.", "21474836.48"]) assert.throws(() => parseShippingFeePKR(input));
});
test("public shipping copy distinguishes every mode without inventing free shipping", () => {
  assert.match(shippingDescription(unconfiguredShipping()), /Shipping is not configured/);
  assert.doesNotMatch(shippingDescription(unconfiguredShipping()), /[Ff]ree|PKR 0/);
  assert.match(shippingDescription({ country_code: "PK", currency: "PKR", mode: "free", fee_minor: 0 }), /Free delivery across Pakistan \(PKR 0\)/);
  assert.match(shippingDescription({ country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor: 25050 }), /Flat shipping fee: PKR 250\.50/);
  assert.match(shippingDescription({ country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor: 0 }), /Flat shipping fee: PKR 0\.00/);
});
test("display-only totals use the configured fee once per bag; unconfigured shipping yields no payable total", () => {
  const product = products[0];
  const items = [{ id: product.id, size: "M" as const, quantity: 2 }];
  const settings = { country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor: 25050 } as const;
  assert.deepEqual(checkoutTotals(items, false, settings), { subtotal: product.price * 2, discount: 0, shipping: 250.5, total: product.price * 2 + 250.5 });
  assert.equal(checkoutTotals(items).total, null);
  assert.deepEqual(checkoutTotals([], false, settings), { subtotal: 0, discount: 0, shipping: 0, total: 0 });
});
