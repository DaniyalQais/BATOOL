export const IMAGE_UPLOAD_BUCKET = "product-image-uploads";
export const IMAGE_BUCKET = "product-images";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_TYPES)[number];
export const imageProductIds = [0, 2, 3, 7, 8, 11] as const;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const mainPath = new RegExp(`^products/(0|2|3|7|8|11)/(${uuid})/(${uuid})/main\\.webp$`);
const rawPath = new RegExp(`^products/(0|2|3|7|8|11)/(${uuid})/(${uuid})\\.(jpg|png|webp)$`);
export class ImageValidationError extends Error {}
export function imageDimensions(width: number, height: number, published = false) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 384 || height < 384 ||
    width > (published ? 1600 : 8192) || height > (published ? 1600 : 8192) ||
    width * height > 24_000_000 || width / height < .25 || width / height > 4) {
    throw new ImageValidationError("Use an image at least 384 × 384, at most 8192 per side and 24 megapixels, with an aspect ratio between 1:4 and 4:1.");
  }
}
export function imageAlt(value: string) {
  const text = value.trim();
  if (!text || Array.from(text).length > 240 || /[\u0000-\u001f\u007f-\u009f]/u.test(text)) {
    throw new ImageValidationError("Describe the image in 1–240 characters, without control characters.");
  }
  return text;
}
export function assertImagePath(path: string, productId?: number) {
  const match = mainPath.exec(path);
  if (!match || (productId !== undefined && Number(match[1]) !== productId)) throw new ImageValidationError("Invalid product-specific image path.");
  return path;
}
export function assertUploadPath(path: string, productId: number, userId: string) {
  const match = rawPath.exec(path);
  if (!match || Number(match[1]) !== productId || match[2] !== userId) throw new ImageValidationError("Invalid upload path or identity.");
  return path;
}
export function newUploadPath(productId: number, userId: string, nonce: string, mime: ImageMime) {
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
  if (!extension) throw new ImageValidationError("Only JPEG, PNG and WebP are supported.");
  return assertUploadPath(`products/${productId}/${userId}/${nonce}.${extension}`, productId, userId);
}
export function publicImageUrl(origin: string, path: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new ImageValidationError("Image project origin is not configured.");
  return `${url.origin}/storage/v1/object/public/${IMAGE_BUCKET}/${assertImagePath(path)}`;
}
export interface UploadedProductImage { path: string; width: number; height: number; alt: string }
export function imageFromRow(row: Record<string, unknown>): UploadedProductImage | undefined {
  const fields = [row.main_image_path, row.main_image_width, row.main_image_height, row.image_alt];
  // Transitional compatibility: migration 005 is prepared, not remotely applied.
  const names = ["main_image_path", "main_image_width", "main_image_height", "image_alt"];
  if (names.every(name => !Object.hasOwn(row, name)) || fields.every(v => v === null)) return undefined;
  if (typeof row.id !== "number" || typeof fields[0] !== "string" || typeof fields[1] !== "number" || typeof fields[2] !== "number" || typeof fields[3] !== "string") throw new ImageValidationError("Incomplete uploaded image data; no fallback was used.");
  imageDimensions(fields[1], fields[2], true);
  return { path: assertImagePath(fields[0], row.id), width: fields[1], height: fields[2], alt: imageAlt(fields[3]) };
}

/** Header checks bound decode resources; they NEVER replace actual byte decoding. */
export function imageHeader(bytes: Uint8Array, declared: string): { mime: ImageMime; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  let result: { mime: ImageMime; width: number; height: number } | undefined;
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 && ascii(12,16) === "IHDR") {
    result = { mime: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  } else if (bytes.length >= 30 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") {
    const chunk = ascii(12,16);
    const u24 = (at: number) => bytes[at] | bytes[at+1] << 8 | bytes[at+2] << 16;
    if (chunk === "VP8X") result = { mime: "image/webp", width: 1 + u24(24), height: 1 + u24(27) };
    else if (chunk === "VP8 " && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) result = { mime: "image/webp", width: view.getUint16(26,true) & 0x3fff, height: view.getUint16(28,true) & 0x3fff };
    else if (chunk === "VP8L" && bytes[20] === 47) {
      const bits = view.getUint32(21,true);
      result = { mime: "image/webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
        result = { mime: "image/jpeg", width: view.getUint16(at+5), height: view.getUint16(at+3) }; break;
      }
      at += length;
    }
  }
  if (!result || result.mime !== declared) throw new ImageValidationError("File bytes must match a supported JPEG, PNG or WebP image.");
  imageDimensions(result.width, result.height);
  return result;
}
