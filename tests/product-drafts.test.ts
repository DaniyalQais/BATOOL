import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { createDraftPayload, activationRequirements } from "../src/features/catalog/model/product-creation.ts";
import { editorProduct, editorProducts, productDraft, productUpdate, editorFailure } from "../src/features/catalog/model/product-editor.ts";
import { ownerCatalog } from "../src/features/catalog/model/owner-catalog.ts";
import { mapCatalog } from "../src/features/catalog/model/catalog-mapper.ts";
import { assertImagePath, assertUploadPath } from "../supabase/functions/_shared/image-policy.ts";
import { catalogProductId, legacyProductImages } from "../supabase/functions/_shared/catalog-policy.ts";

const key = "00000000-0000-4000-8000-000000000701";
function row(id = 12) {
  return { id, slug: id < 12 ? legacyProductImages[id] : `draft-${id}`, name: "New stitched product", description: "Draft concept awaiting garment confirmation.",
    price_minor: 12345, currency: "PKR", category: "Stitched", piece_count: 3, active: false, is_demo: true,
    draft_managed: id >= 12, archived: false, subcategory: null, color: null, tag: null,
    image_note: "Draft concept disclosure.", image_slug: null, main_image_path: null, main_image_width: null, main_image_height: null, image_alt: null,
    edit_revision: 5, card_position: null, card_zoom: null, sort_order: 0,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
    product_variants: ["S","M","L","XL"].map((size, i) => ({ product_id: id, size, stock_quantity: i === 0 ? null : i - 1,
      active: true, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" })) };
}
test("draft payload has no client ID/slug/activation/image or provenance controls and preserves exact quantities", () => {
  const draft = productDraft(editorProduct(row()));
  const payload = createDraftPayload({ ...draft, active: true }, key);
  assert.deepEqual(Object.keys(payload).sort(), ["p_request_key","p_name","p_description","p_price_minor","p_stocks"].sort());
  assert.equal(payload.p_price_minor, 12345); assert.deepEqual(payload.p_stocks, { S: null, M: 0, L: 1, XL: 2 });
  for (const patch of [{ name: " " }, { description: "" }, { price: "1e3" }, { stock: { S: null, M: "-1", L: "0", XL: "0" } },
    { stock: { ...draft.stock, XXL: "0" } }]) assert.throws(() => createDraftPayload({ ...draft, ...patch }, key));
  assert.throws(() => createDraftPayload(draft, "not-a-uuid"));
});
test("admin accepts legitimate image-less drafts alongside retained products and rejects spoofed identities", () => {
  const draft = editorProduct(row());
  assert.equal(draft.active, false); assert.equal(draft.uploadedImage, undefined); assert.equal(draft.managedDraft, true);
  assert.equal(productUpdate(draft, productDraft(draft)).p_product_id, 12);
  const legacy = Object.keys(legacyProductImages).map(id => row(Number(id)));
  assert.equal(editorProducts([...legacy, row(12), row(13)]).length, 8);
  for (const patch of [{ id: 9 }, { id: 10 }, { draft_managed: false }, { id: 1 }, { id: 2147483648 }, { slug: "../bad" }]) assert.throws(() => editorProduct({ ...row(), ...patch }));
  assert.throws(() => editorProducts([...legacy, row(), row()]));
});
test("draft activation requires trusted photo, explicit merchandise approval and known stock", () => {
  const product = editorProduct(row()); const draft = productDraft(product);
  assert.equal(activationRequirements(product,draft).length, 6);
  const fields = { ...draft, subcategory: "Daily Pret", color: "#51343f", tag: "New arrival" };
  assert.equal(activationRequirements(product,fields).length, 3);
  const withImage = { ...product, uploadedImage: { path: `products/12/${key}/${key}/main.webp`, width: 384, height: 512, alt: "Product-specific outfit" } };
  assert.equal(activationRequirements(withImage,fields).length, 2);
  const approved = { ...withImage, isDemo: false };
  const known = { ...fields, stock: { S: "0", M: "1", L: "0", XL: "0" } };
  assert.deepEqual(activationRequirements(approved,known), []);
  assert.match(activationRequirements(approved,{ ...known, archived: true })[0], /Unarchive/);
});
test("create retries reuse a request key and issue one atomic RPC per attempt, with no direct writes", async () => {
  const payload = createDraftPayload(productDraft(editorProduct(row())),key); const calls: unknown[] = [];
  const client = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { error: null, data: row() }; } } as unknown as SupabaseClient<Database>;
  const catalog = ownerCatalog(client);
  assert.equal((await catalog.create(payload)).id, (await catalog.create(payload)).id);
  assert.deepEqual(calls, [["owner_create_product_draft",payload],["owner_create_product_draft",payload]]);
  // Mock responses establish query composition only. Database idempotency remains a SQL test.
});
test("denied or uncertain creation is propagated, never turned into success or an automatic retry", async () => {
  const payload = createDraftPayload(productDraft(editorProduct(row())), key);
  for (const code of ["42501", "PT400", "PGRST202"]) {
    let calls = 0;
    const client = { rpc: async () => { calls++; return { error: { code }, data: null }; } } as unknown as SupabaseClient<Database>;
    await assert.rejects(ownerCatalog(client).create(payload), error => (error as { code: string }).code === code);
    assert.equal(calls, 1);
  }
});
test("new draft editing carries metadata and the original expected revision without accepting slug changes", async () => {
  const product = editorProduct(row()); const draft = { ...productDraft(product), subcategory: "Daily Pret", color: "#51343f", tag: "Concept", archived: true };
  let called: unknown;
  const client = { rpc: async (name: string, args: unknown) => { called = [name,args]; return { error: null, data: { ...row(), archived: true, edit_revision: 6 } }; } } as unknown as SupabaseClient<Database>;
  await ownerCatalog(client).save(product,draft);
  assert.deepEqual(called, ["owner_save_catalog_product", { ...productUpdate(product,draft), p_subcategory: "Daily Pret", p_color: "#51343f", p_tag: "Concept", p_archived: true }]);
});
test("malformed successful create confirmation is uncertain so retries retain their original key", async () => {
  const payload = createDraftPayload(productDraft(editorProduct(row())),key);
  for (const data of [null, { ...row(),product_variants: [] },row(0)]) {
    const client = { rpc: async () => ({error:null,data}) } as unknown as SupabaseClient<Database>;
    await assert.rejects(ownerCatalog(client).create(payload),error=>editorFailure(error).kind==='uncertain');
  }
});
test("new image paths retain exact ID/UUID binding and reject retired, unsupported and noncanonical IDs", () => {
  const path = `products/12/${key}/${key}/main.webp`;
  assert.equal(assertImagePath(path,12),path);
  assertUploadPath(`products/12/${key}/${key}.webp`,12,key);
  for (const id of [1,4,9,10,-1,2147483648]) {
    assert.equal(catalogProductId(id),false); assert.throws(() => assertImagePath(path.replace('/12/',`/${id}/`)));
  }
  assert.throws(() => assertImagePath(path,13));
  assert.throws(() => assertImagePath(path.replace('/12/','/012/')));
});
test("storefront refuses inactive/archive/new products without their own validated image, with no borrowed fallback", () => {
  const source = row(); assert.throws(() => mapCatalog([source]));
  const ready = { ...source, active: true, subcategory: "Daily Pret", color: "#51343f", tag: "Concept",
    main_image_path: `products/12/${key}/${key}/main.webp`, main_image_width: 384, main_image_height: 512, image_alt: "Outfit awaiting brand confirmation" };
  const product = mapCatalog([ready])[0]; assert.equal(product.imageSlug, ""); assert.equal(product.uploadedImage?.path,ready.main_image_path);
  for (const patch of [{ archived: true }, { main_image_path: null }, { image_slug: "gulnaar" }, { main_image_path: ready.main_image_path.replace('/12/','/0/') }, { subcategory: null }, { product_variants: [] }]) assert.throws(() => mapCatalog([{ ...ready,...patch }]));
});
