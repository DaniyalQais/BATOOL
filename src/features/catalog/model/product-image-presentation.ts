import type { Product } from "./types.ts";

// Actual dimensions of the current largest optimized variants. Asset tests check
// these against the decoded files; update this metadata when replacing a source.
const imageMetadata: Readonly<Record<string, {
  readonly width: number;
  readonly height: number;
}>> = {
  gulnaar: { width: 384, height: 1024 },
  meher: { width: 384, height: 1024 },
  saba: { width: 384, height: 1024 },
  mira: { width: 384, height: 1024 },
  noor: { width: 384, height: 1024 },
  zeenat: { width: 384, height: 1024 },
};

export function productImagePresentation(product: Pick<Product, "imageSlug" | "imageNote" | "uploadedImage">) {
  const image = product.uploadedImage ?? imageMetadata[product.imageSlug];
  if (!image) throw new Error(`Missing product image dimensions: ${product.imageSlug}`);

  const ratio = image.width / image.height;
  const desktopWidth = Math.min(image.width, 720 * ratio);
  // The whole photograph fits below the header without making mobile pages excessively tall.
  const mobileWidth = `min(${72 * ratio}svh, ${Math.min(image.width, 640 * ratio)}px)`;
  return {
    width: image.width,
    height: image.height,
    desktopWidth,
    mobileWidth,
    sizes: `(max-width: 900px) min(calc(100vw - 32px), ${72 * ratio}svh, ${Math.min(image.width, 640 * ratio)}px), ${desktopWidth}px`,
    caption: product.uploadedImage
      ? `Uploaded main image. Original demo fallback disclosure: ${product.imageNote ?? "Sample photography for design preview."}`
      : product.imageNote ?? "Sample photography for design preview.",
  };
}
