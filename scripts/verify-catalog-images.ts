import sharp from "sharp";
import { MAX_UPLOAD_BYTES, publicImageUrl } from "../supabase/functions/_shared/image-policy.ts";
import type { Product } from "../src/features/catalog/model/types.ts";

/** Fail a build for missing/corrupt uploaded assets; never publish a local fallback. */
export async function verifyCatalogImages(products: readonly Product[], origin: string, fetcher: typeof fetch = fetch) {
  for (const product of products) {
    const image = product.uploadedImage;
    if (!image) continue;
    const mainUrl = publicImageUrl(origin, image.path);
    for (const variant of ["192", "384", "main"]) {
      const width = variant === "main" ? image.width : Number(variant);
      const url = mainUrl.replace(/main\.webp$/, `${variant}.webp`);
      const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/webp" || !response.body) throw new Error("Uploaded image unavailable.");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new Error("Uploaded image exceeds limit."); }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      const decoded = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning" });
      const metadata = await decoded.metadata();
      if (metadata.format !== "webp" || metadata.width !== width || !metadata.height ||
        (variant === "main" && metadata.height !== image.height)) throw new Error("Uploaded image dimensions invalid.");
      await decoded.raw().toBuffer();
    }
  }
}
