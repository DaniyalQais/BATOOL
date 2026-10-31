import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { assertImagePath, assertUploadPath, imageAlt, imageDimensions, imageFromRow, imageHeader, publicImageUrl } from "../supabase/functions/_shared/image-policy.ts";
import { decodeProductImage, type RasterDecoder } from "../supabase/functions/_shared/decode-product-image.ts";
import { attachProductImage, ImageFlowError, uploadProductImage, type PreparedImage } from "../src/features/catalog/model/product-image-upload.ts";
import type { EditorProduct } from "../src/features/catalog/model/product-editor.ts";
import { verifyCatalogImages } from "../scripts/verify-catalog-images.ts";
import { products } from "../src/features/catalog/model/products.ts";
import { productImagePresentation } from "../src/features/catalog/model/product-image-presentation.ts";

const userId = "00000000-0000-4000-8000-000000000201";
const nonce = "00000000-0000-4000-8000-000000000301";
const path = `products/0/${userId}/${nonce}/main.webp`;
const uploaded = { path, width: 384, height: 1024, alt: "Stitched outfit in plum" };
const product: EditorProduct = Object.freeze({ id: 0, slug: "gulnaar", name: "Gulnaar", description: "Demo", priceMinor: 895000,
  active: true, revision: 7, stock: { S: null, M: null, L: null, XL: null }, isDemo: true, imageNote: null });
function row(revision = 8) {
  return { id: 0, slug: "gulnaar", name: "Gulnaar", description: "Demo", price_minor: 895000, active: true, currency: "PKR", edit_revision: revision,
    is_demo: true, image_note: null, main_image_path: path, main_image_width: 384, main_image_height: 1024, image_alt: uploaded.alt,
    product_variants: ["S","M","L","XL"].map(size => ({ product_id: 0, size, stock_quantity: null })) };
}
function clientFixture(fail = "", rpcData: unknown = row()) {
  const calls: { name: string; payload?: unknown }[] = [];
  const client = {
    auth: { async getUser() { return { data: { user: { id: userId, is_anonymous: false } }, error: null }; } },
    storage: { from(bucket: string) { return { async upload(name: string, _file: File, options: unknown) {
      calls.push({ name: "upload", payload: { bucket, name, options } });
      return { error: fail === "upload" ? { code: "42501" } : null };
    } }; } },
    functions: { async invoke(name: string, payload: unknown) {
      calls.push({ name, payload });
      return { error: fail === "validate" ? new Error("private provider detail") : null, data: fail === "cross-product" ? { ...uploaded, path: path.replace("/0/","/2/") } : uploaded };
    } },
    async rpc(name: string, payload: unknown) {
      calls.push({ name, payload }); return { data: rpcData, error: fail === "attach" ? { code: "PT409" } : null };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
const prepared: PreparedImage = { file: new File([new Uint8Array([1,2,3])], "test.webp", { type: "image/webp" }),
  width: 384, height: 1024, originalWidth: 384, originalHeight: 1024, originalSize: 3 };

test("image paths bind bucket-relative immutable UUIDs to the intended product and identity", () => {
  assert.equal(assertImagePath(path, 0), path);
  assert.equal(assertUploadPath(`products/0/${userId}/${nonce}.webp`, 0, userId), `products/0/${userId}/${nonce}.webp`);
  assert.equal(publicImageUrl("https://example.supabase.co", path), `https://example.supabase.co/storage/v1/object/public/product-images/${path}`);
  for (const bad of [path.replace("/0/","/2/"), path.replace("/0/","/9/"), "https://evil.example/image.webp", `../${path}`, path + "?x=1", path.replace("main.webp","a.svg")]) assert.throws(() => assertImagePath(bad,0));
  assert.throws(() => assertUploadPath(`products/0/${nonce}/${nonce}.webp`,0,userId));
  assert.throws(() => publicImageUrl("http://example.supabase.co",path));
});
test("alt text, dimensions and missing/corrupt uploaded references fail closed", () => {
  assert.equal(imageAlt("  Plum outfit  "), "Plum outfit");
  for (const value of ["", " ", "x".repeat(241), "image\ntext", "image\u007ftext"]) assert.throws(() => imageAlt(value));
  for (const [w,h] of [[383,500],[9000,500],[8000,8000],[400,2000],[1000.1,1000]]) assert.throws(() => imageDimensions(w,h));
  assert.deepEqual(imageFromRow(row()),uploaded);
  assert.equal(imageFromRow({ id: 0 }),undefined);
  assert.equal(imageFromRow({ id: 0, main_image_path: null, main_image_width: null, main_image_height: null, image_alt: null }),undefined);
  for (const patch of [{ main_image_width: undefined }, { main_image_path: null }, { main_image_path: path.replace("/0/","/2/") }, { main_image_height: 20000 }]) assert.throws(() => imageFromRow({ ...row(),...patch }));
});
test("JPEG/PNG/WebP byte headers and dimension bounds are checked, not only extensions or MIME labels", async () => {
  for (const format of ["jpeg","png","webp"] as const) {
    const bytes = await sharp({ create: { width: 384, height: 512, channels: 3, background: "plum" } }).toFormat(format).toBuffer();
    assert.deepEqual(imageHeader(bytes, `image/${format}`), { mime: `image/${format}`, width: 384, height: 512 });
    assert.throws(() => imageHeader(bytes, format === "jpeg" ? "image/png" : "image/jpeg"));
  }
  assert.throws(() => imageHeader(new TextEncoder().encode("<svg>not a raster</svg>"), "image/png"));
});
test("upload is immutable, trusted validation precedes attachment, and the original revision is used once", async () => {
  const f = clientFixture();
  const saved = await uploadProductImage(f.client, product, prepared, uploaded.alt, () => true);
  assert.equal(saved.uploadedImage?.path,path);
  assert.deepEqual(f.calls.map(c => c.name), ["upload","validate-product-image","owner_attach_product_image"]);
  const upload = f.calls[0].payload as { name: string; options: { upsert: boolean }; bucket: string };
  assert.equal(upload.options.upsert,false); assert.equal(upload.bucket,"product-image-uploads");
  assertUploadPath(upload.name,0,userId);
  assert.deepEqual(f.calls[2].payload,{ p_product_id: 0,p_expected_revision: 7,p_image_path: path,p_alt: uploaded.alt });
  assert.equal(product.revision,7); assert.equal(product.uploadedImage,undefined);
});
test("denied upload, failed validation and cross-product receipts cannot attach or delete anything", async () => {
  for (const fail of ["upload","validate","cross-product"]) {
    const f = clientFixture(fail);
    await assert.rejects(uploadProductImage(f.client,product,prepared,uploaded.alt,()=>true), ImageFlowError);
    assert.ok(!f.calls.some(c => c.name === "owner_attach_product_image" || c.name === "remove"));
  }
});
test("conflicts retain uploads with no retry/deletion; session rechecks stop subsequent attachment", async () => {
  const f = clientFixture("attach");
  await assert.rejects(uploadProductImage(f.client,product,prepared,uploaded.alt,()=>true), error => error instanceof ImageFlowError && error.stage === "attach" && (error.original as { code: string }).code === "PT409");
  assert.equal(f.calls.filter(c=>c.name === "owner_attach_product_image").length,1);
  const interrupted = clientFixture(); let checks = 0;
  await assert.rejects(uploadProductImage(interrupted.client,product,prepared,uploaded.alt,()=>++checks < 3), error => error instanceof ImageFlowError && error.stage === "interrupted");
  assert.ok(!interrupted.calls.some(c => c.name === "owner_attach_product_image"));
});
test("stale or malformed attachment confirmations do not report success, including alt-only saves", async () => {
  for (const response of [null, row(7), { ...row(),image_alt: "Different alt" },{ ...row(),main_image_path: path.replace(nonce,userId) }]) {
    await assert.rejects(attachProductImage(clientFixture("",response).client,product,uploaded), /outcome uncertain/);
  }
  assert.equal((await attachProductImage(clientFixture().client,product,{ ...uploaded,alt: ` ${uploaded.alt} ` })).uploadedImage?.alt,uploaded.alt);
});
test("uploaded presentation uses validated dimensions and retains original demo disclosures", () => {
  const p = { ...products[0], uploadedImage: { ...uploaded,width: 800,height: 1200 } };
  const frame = productImagePresentation(p);
  assert.equal(frame.width,800); assert.equal(frame.height,1200);
  assert.match(frame.caption,/Original demo fallback disclosure/);
});
test("build validation checks all three uploaded variants and fails for missing or corrupt assets", async () => {
  const p = { ...products[0], uploadedImage: { ...uploaded,width: 384,height: 512 } };
  const requested: string[] = [];
  const fakeFetch = (async (url: string) => {
    requested.push(url);
    const width = url.endsWith("192.webp") ? 192 : 384;
    const buffer = await sharp({ create: { width,height: width*4/3,channels:3,background:"plum" } }).webp().toBuffer();
    return new Response(new Uint8Array(buffer),{ headers: { "content-type":"image/webp" } });
  }) as typeof fetch;
  await verifyCatalogImages([p],"https://example.supabase.co",fakeFetch);
  assert.equal(requested.length,3); assert.ok(requested.some(u=>u.endsWith("384.webp")));
  await assert.rejects(verifyCatalogImages([p],"https://example.supabase.co",(async()=>new Response(null,{status:404})) as typeof fetch));
  await assert.rejects(verifyCatalogImages([p],"https://example.supabase.co",(async()=>new Response("not an image",{headers:{"content-type":"image/webp"}})) as typeof fetch));
});

const magickPackage = new URL("../.tmp/magick-package/package/",import.meta.url);
test("pinned Edge WASM actually decodes JPEG/PNG/WebP, strips/re-encodes variants and rejects corrupt bodies", { skip: !existsSync(new URL("dist/index.js",magickPackage)) }, async () => {
  const packageInfo = JSON.parse(await readFile(new URL("package.json",magickPackage),"utf8"));
  assert.equal(packageInfo.version,"0.0.45");
  const magick = await import(new URL("dist/index.js",magickPackage).href);
  await magick.initializeImageMagick(new Uint8Array(await readFile(new URL("dist/x86/magick.wasm",magickPackage))));
  for (const format of ["jpeg","png","webp"] as const) {
    const bytes = await sharp({ create: { width: 2000,height: 1600,channels:3,background:"plum" } }).toFormat(format).toBuffer();
    const result = decodeProductImage(bytes,`image/${format}`,magick.ImageMagick as RasterDecoder);
    assert.equal(result.width,1600); assert.equal(result.height,1280);
    assert.equal(result.files.length,3);
    for (const file of result.files) {
      const decoded = sharp(file.bytes); const metadata = await decoded.metadata();
      assert.equal(metadata.format,"webp"); assert.equal(metadata.exif,undefined);
      assert.equal(metadata.width,file.name === "main.webp" ? 1600 : Number(file.name.split(".")[0]));
      await decoded.raw().toBuffer();
    }
  }
  const valid = await sharp({ create: { width:384,height:512,channels:3,background:"plum" } }).png().toBuffer();
  assert.throws(()=>decodeProductImage(valid.subarray(0,33),"image/png",magick.ImageMagick as RasterDecoder));
});
