import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapCatalog } from "../src/features/catalog/model/catalog-mapper.ts";
import { catalogConfiguration } from "../scripts/prepare-catalog.ts";
import { products } from "../src/features/catalog/model/products.ts";

function fixture() {
  const p = products[0];
  const timestamp = "2026-10-30T00:00:00Z";
  return {
    ...p, price_minor: p.price * 100, currency: "PKR", image_slug: p.imageSlug,
    image_note: null, card_position: p.cardPosition, card_zoom: null,
    active: true, is_demo: true, sort_order: 0, piece_count: 3,
    created_at: timestamp, updated_at: timestamp,
    product_variants: ["XL", "S", "M", "L"].map(size => ({
      product_id: p.id, size, active: true, stock_quantity: null,
      created_at: timestamp, updated_at: timestamp,
    })),
  };
}
test("maps minor units and stable IDs, sorts sizes, and preserves unknown stock", () => {
  const [p] = mapCatalog([{ ...fixture(), price_minor: 895025 }]);
  assert.equal(p.id, 0);
  assert.equal(p.slug, "gulnaar");
  assert.equal(p.price, 8950.25);
  assert.equal(p.currency, "PKR");
  assert.equal(p.isDemo, true);
  assert.deepEqual(p.sizes, ["S", "M", "L", "XL"]);
  assert.ok(p.variants?.every(v => v.stockQuantity === null));
});
test("zero stock is excluded from demo purchase sizes; positive quantities remain snapshots", () => {
  const data = fixture();
  const [p] = mapCatalog([{ ...data, product_variants: data.product_variants.map(v => ({ ...v, stock_quantity: v.size === "M" ? 0 : 2 })) }]);
  assert.deepEqual(p.sizes, ["S", "L", "XL"]);
  assert.equal(p.variants?.find(v => v.size === "M")?.stockQuantity, 0);
});
test("empty products and products without permitted variants are represented honestly", () => {
  assert.deepEqual(mapCatalog([]), []);
  assert.deepEqual(mapCatalog([{ ...fixture(), product_variants: [] }])[0].sizes, []);
});
test("rejects malformed, missing, inactive and unsupported product data", () => {
  for (const patch of [
    { id: -1 }, { id: 9 }, { id: 10 }, { name: "" }, { description: undefined }, { slug: "../bad" },
    { price_minor: 1.1 }, { price_minor: -1 }, { price_minor: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "USD" }, { category: "Abaya" }, { category: "Unstitched" },
    { piece_count: 2 }, { active: false }, { is_demo: undefined },
    { image_slug: "missing" }, { image_slug: "amanah" }, { image_slug: "layal" }, { color: "bad" }, { card_zoom: 99 },
    { card_position: "url(bad)" }, { subcategory: "Other" },
    { created_at: "invalid" }, { product_variants: undefined },
  ]) assert.throws(() => mapCatalog([{ ...fixture(), ...patch }]));
  for (const input of [null, {}, [null], [fixture(), fixture()]]) assert.throws(() => mapCatalog(input));
});

test("unapplied seed contains only six retained demo products and 24 unknown-stock variants", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261030000200_approved_demo_catalog.sql", import.meta.url), "utf8");
  const [productSection, variantSection] = sql.split("insert into public.product_variants");
  const rows = [...productSection.matchAll(/^  \((\d+), '([^']+)'/gm)];
  assert.deepEqual(rows.map(row => Number(row[1])), [0, 2, 3, 8, 7, 11]);
  assert.deepEqual(rows.map(row => row[2]), products.map(product => product.slug));
  assert.doesNotMatch(productSection, /amanah|layal|velvet|silk|Stitched Shirt, Trouser & Dupatta/i);
  assert.equal((productSection.match(/true, true, \d+\)/g) ?? []).length, 6);
  assert.match(productSection, /Reused Meher sample portrait/);
  assert.match(productSection, /Reused Gulnaar sample portrait/);
  const variants = [...variantSection.matchAll(/^  \((\d+), '([^']+)', true, null\)/gm)];
  assert.equal(variants.length, 24);
  for (const product of products) {
    assert.deepEqual(variants.filter(row => Number(row[1]) === product.id).map(row => row[2]), ["S", "M", "L", "XL"]);
  }
  assert.doesNotMatch(variantSection, /^  \((9|10),/m);
});
test("rejects invalid, duplicate, foreign and inactive variants", () => {
  const p = fixture();
  for (const patch of [
    { size: "XS" }, { size: "XXL" }, { product_id: 2 }, { active: false },
    { stock_quantity: -1 }, { stock_quantity: 1.5 }, { stock_quantity: undefined },
    { updated_at: null },
  ]) assert.throws(() => mapCatalog([{ ...p, product_variants: [{ ...p.product_variants[0], ...patch }] }]));
  assert.throws(() => mapCatalog([{ ...p, product_variants: [p.product_variants[0], p.product_variants[0]] }]));
});
test("configuration fails closed, requires explicit demo mode, and rejects elevated keys", () => {
  assert.throws(() => catalogConfiguration({}), /configuration missing/);
  assert.deepEqual(catalogConfiguration({ CATALOG_SOURCE: "demo" }), { source: "demo" });
  assert.throws(() => catalogConfiguration({ CATALOG_SOURCE: "fallback" }));
  for (const key of ["sb_secret_test", "service_role", "eyJlegacy-token"]) {
    assert.throws(() => catalogConfiguration({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: key }), /publishable key/);
  }
  assert.throws(() => catalogConfiguration({ SUPABASE_URL: "https://user:password@example.com", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }));
  assert.equal(catalogConfiguration({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }).source, "supabase");
});
