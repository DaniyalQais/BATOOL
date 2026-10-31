import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { products } from "../src/features/catalog/model/products.ts";
import { productImagePresentation } from "../src/features/catalog/model/product-image-presentation.ts";

test("every product has decodable portrait variants and any reused photograph is disclosed", async () => {
  const slugs = new Set<string>();
  const pixels = new Map<string, string>();
  for (const product of products) {
    assert.ok(product.imageSlug.length > 0);
    assert.equal(slugs.has(product.imageSlug), false);
    slugs.add(product.imageSlug);
    for (const width of [192, 384]) {
      const file = new URL(`../public/images/${product.imageSlug}-${width}.webp`, import.meta.url);
      const image = sharp(fileURLToPath(file));
      const metadata = await image.metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, width);
      assert.equal(metadata.height, width * 8 / 3);
      if (width === 384) {
        const hash = createHash("sha256").update(await image.raw().toBuffer()).digest("hex");
        if (pixels.has(hash)) {
          const reusedSources: Record<string, string> = { mira: "meher", zeenat: "gulnaar" };
          assert.equal(pixels.get(hash), reusedSources[product.slug]);
          assert.ok("imageNote" in product);
          assert.match(product.imageNote, /Reused .* sample portrait/);
        } else {
          pixels.set(hash, product.slug);
        }
      }
    }
  }
});

test("product-detail frames match the decoded images without enlarging the source", async () => {
  for (const product of products) {
    const presentation = productImagePresentation(product);
    const file = new URL(`../public/images/${product.imageSlug}-384.webp`, import.meta.url);
    const metadata = await sharp(fileURLToPath(file)).metadata();
    assert.equal(presentation.width, metadata.width);
    assert.equal(presentation.height, metadata.height);
    assert.ok(presentation.desktopWidth <= metadata.width!);
  }
});

test("reused sample images retain their provenance disclosure", () => {
  for (const product of products) {
    const caption = productImagePresentation(product).caption;
    if ("imageNote" in product) {
      assert.equal(caption, product.imageNote);
      assert.match(caption, /Reused .* sample portrait.*not separate product photography/);
    } else {
      assert.equal(caption, "Sample photography for design preview.");
    }
  }
});

test("the public image directory contains only retained products and stitched campaign assets", async () => {
  const expected = products.flatMap(product => [192, 384].map(width => `${product.imageSlug}-${width}.webp`));
  expected.push(...[576, 864, 1152].map(width => `campaign-stitched-${width}.webp`));
  const actual = await readdir(new URL("../public/images/", import.meta.url));
  assert.deepEqual(actual.sort(), expected.sort());
  assert.deepEqual((await readdir(new URL("../assets/source/", import.meta.url))).sort(), ["README.md", "stitched-editorial.png"]);
  const source = await sharp(fileURLToPath(new URL("../assets/source/stitched-editorial.png", import.meta.url))).metadata();
  assert.equal(source.width, 1536);
  assert.equal(source.height, 1024);
});

test("six retained cards preserve their ordering and disclosed portrait reuse", async () => {
  assert.equal(products.length, 6);
  const hashes = await Promise.all(products.map(async product => createHash("sha256")
    .update(await sharp(fileURLToPath(new URL(`../public/images/${product.imageSlug}-384.webp`, import.meta.url))).raw().toBuffer())
    .digest("hex")));
  for (let start = 0; start < hashes.length; start += 4) {
    const row = hashes.slice(start, start + 4);
    assert.equal(new Set(row).size, row.length);
  }
  assert.deepEqual(products.slice(0, 4).map(product => product.slug), ["gulnaar", "meher", "saba", "noor"]);
  const meher = products.find(product => product.slug === "meher")!;
  const mira = products.find(product => product.slug === "mira")!;
  assert.ok("cardZoom" in mira);
  assert.ok(mira.cardZoom > ("cardZoom" in meher ? Number(meher.cardZoom) : 1));
});
