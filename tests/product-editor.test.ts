import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { ownerCatalog } from "../src/features/catalog/model/owner-catalog.ts";
import { editorProduct, editorProducts, productDraft, productUpdate, priceToMinor, minorToPrice, stockToInteger, editorFailure, MAX_INTEGER, type EditorProduct, type ProductDraft } from "../src/features/catalog/model/product-editor.ts";

function product(): EditorProduct {
  return { id: 0, slug: "gulnaar", name: "Gulnaar", description: "Stitched demo concept.", priceMinor: 895000,
    active: false, revision: 7, stock: { S: null, M: 0, L: 2, XL: null }, isDemo: true, imageNote: "Sample concept disclosure." };
}
function row(p = product()) {
  return { id: p.id, slug: p.slug, name: p.name, description: p.description, price_minor: p.priceMinor, currency: "PKR",
    active: p.active, edit_revision: p.revision, is_demo: p.isDemo, image_note: p.imageNote,
    product_variants: Object.entries(p.stock).map(([size, stock_quantity]) => ({ product_id: p.id, size, stock_quantity })) };
}
test("PKR conversion is exact in integer minor units, including boundary and decimal cases", () => {
  for (const [input, minor] of [["8950", 895000], ["0.29", 29], ["1.01", 101], ["0.1", 10], ["0", 0], [" 12.34 ", 1234], ["21474836.47", MAX_INTEGER]] as const) {
    assert.equal(priceToMinor(input), minor);
    assert.equal(priceToMinor(minorToPrice(minor)), minor);
  }
  for (const input of ["", "-1", "+1", "1.001", "1e3", "8,950", "NaN", "Infinity", ".50", "21474836.48"]) assert.throws(() => priceToMinor(input));
});
test("Unknown is null, zero is zero, and invalid or fractional stock is rejected", () => {
  assert.equal(stockToInteger(null), null); assert.equal(stockToInteger("0"), 0); assert.equal(stockToInteger("12"), 12);
  for (const value of ["", " ", "-1", "1.5", "1e2", "2147483648", "Unknown"]) assert.throws(() => stockToInteger(value));
  assert.deepEqual(productDraft(product()).stock, { S: null, M: "0", L: "2", XL: null });
});
test("save payload contains only intended fields and the original optimistic revision", () => {
  const p = product();
  const draft = { ...productDraft(p), name: " Updated ", id: 9, role: "owner", slug: "tampered", is_demo: false, currency: "USD", image_slug: "changed", category: "Abaya" };
  const update = productUpdate(p, draft);
  assert.deepEqual(Object.keys(update).sort(), ["p_product_id", "p_expected_revision", "p_name", "p_description", "p_price_minor", "p_active", "p_stocks"].sort());
  assert.equal(update.p_product_id, 0); assert.equal(update.p_expected_revision, 7); assert.equal(update.p_name, "Updated");
  assert.equal(update.p_active, false); assert.deepEqual(update.p_stocks, p.stock);
});
test("blank/overlong copy, unsupported IDs, revisions, missing/extra sizes are rejected", () => {
  const p = product(); const d = productDraft(p);
  for (const patch of [{ name: " \n" }, { name: "x".repeat(121) }, { description: "" }, { description: "x".repeat(2001) },
    { stock: { S: null, M: "1", L: "2" } }, { stock: { ...d.stock, XXL: "0" } }, { active: "true" }]) {
    assert.throws(() => productUpdate(p, { ...d, ...patch } as ProductDraft));
  }
  for (const patch of [{ id: 9 }, { id: 10 }, { id: 12 }, { revision: 0 }, { revision: 1.5 }, { revision: MAX_INTEGER + 1 }]) assert.throws(() => productUpdate({ ...p, ...patch }, d));
});
test("current admin rows include inactive products and preserve provenance and Unknown stock", () => {
  assert.deepEqual(editorProduct(row()), product());
  const ids = [0, 2, 3, 8, 7, 11];
  const data = ids.map(id => row({ ...product(), id }));
  assert.equal(editorProducts(data).length, 6);
  assert.throws(() => editorProducts(data.slice(1)));
  assert.throws(() => editorProducts([data[0], data[0], ...data.slice(2)]));
});
test("malformed admin data, missing migration and unsupported variants fail closed", () => {
  const p = row();
  for (const patch of [{ edit_revision: undefined }, { edit_revision: 0 }, { price_minor: 12.5 }, { price_minor: -1 }, { currency: "USD" },
    { active: null }, { is_demo: undefined }, { image_note: undefined }, { product_variants: [] },
    { product_variants: [...p.product_variants.slice(1), p.product_variants[1]] },
    { product_variants: p.product_variants.map(v => ({ ...v, stock_quantity: undefined })) },
    { product_variants: p.product_variants.map(v => ({ ...v, product_id: 9 })) },
    { product_variants: p.product_variants.map(v => ({ ...v, size: "XS" })) }]) assert.throws(() => editorProduct({ ...p, ...patch }));
});
test("conflict, denied, missing-migration and uncertain failures remain distinct and safe", () => {
  assert.equal(editorFailure({ code: "PT409" }).kind, "conflict");
  assert.match(editorFailure({ code: "42501" }).message, /Owner access/);
  assert.match(editorFailure({ code: "PGRST204" }).message, /migration/);
  assert.match(editorFailure({ code: "22023" }).message, /rejected/);
  assert.match(editorFailure(new Error("secret server details")).message, /reload.*before retrying/);
  assert.ok(!editorFailure(new Error("secret server details")).message.includes("secret server details"));
});
test("saving sends one atomic RPC with the original revision and uses the confirmed server revision", async () => {
  const p = product(); const calls: unknown[] = [];
  const client = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: row({ ...p, revision: 12 }), error: null }; } } as unknown as SupabaseClient<Database>;
  const saved = await ownerCatalog(client).save(p, productDraft(p));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["owner_update_catalog_product", productUpdate(p, productDraft(p))]);
  assert.equal(saved.revision, 12);
});
test("conflicts and denied saves are propagated without automatic retries or direct table updates", async () => {
  for (const code of ["PT409", "42501"]) {
    let calls = 0;
    const client = { rpc: async () => { calls++; return { data: null, error: { code } }; } } as unknown as SupabaseClient<Database>;
    await assert.rejects(ownerCatalog(client).save(product(), productDraft(product())), error => (error as { code: string }).code === code);
    assert.equal(calls, 1);
  }
});
test("a malformed or stale save confirmation is never reported as success", async () => {
  const p = product();
  for (const data of [null, row(p), row({ ...p, id: 2, revision: 8 })]) {
    const client = { rpc: async () => ({ data, error: null }) } as unknown as SupabaseClient<Database>;
    await assert.rejects(ownerCatalog(client).save(p, productDraft(p)));
  }
});
