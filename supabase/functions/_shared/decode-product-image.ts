import { imageHeader, imageDimensions, MAX_UPLOAD_BYTES, ImageValidationError, type ImageMime } from "./image-policy.ts";
export interface RasterImage {
  width: number; height: number; quality: number;
  autoOrient(): void; strip(): void; resize(width: number, height: number): void;
  clone<T>(callback: (image: RasterImage) => T): T;
  write<T>(format: "WEBP", callback: (bytes: Uint8Array) => T): T;
}
export interface RasterDecoder {
  read<T>(bytes: Uint8Array, format: "JPEG" | "PNG" | "WEBP", callback: (image: RasterImage) => T): T;
}
export interface DecodedImage { width: number; height: number; files: { name: string; bytes: Uint8Array }[] }
export class ImageDecoderUnavailable extends Error {}

/** Executed by the trusted WASM decoder, also exercised locally with that decoder. */
export function decodeProductImage(bytes: Uint8Array, mime: ImageMime, decoder: RasterDecoder): DecodedImage {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new ImageValidationError("Upload must be at most 5 MiB.");
  const header = imageHeader(bytes, mime);
  const format = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP" } as const;
  return decoder.read(bytes, format[mime], image => {
    if (image.width !== header.width || image.height !== header.height) throw new ImageValidationError("Decoded dimensions do not match the image header.");
    imageDimensions(image.width, image.height);
    image.autoOrient();
    image.strip();
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    if (scale < 1) image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
    imageDimensions(image.width, image.height, true);
    image.quality = 82;
    const main = image.write("WEBP", bytes => new Uint8Array(bytes));
    const files = [{ name: "main.webp", bytes: main }];
    for (const width of [192, 384]) files.push(image.clone(copy => {
      copy.resize(width, 0); copy.quality = 82;
      return { name: `${width}.webp`, bytes: copy.write("WEBP", bytes => new Uint8Array(bytes)) };
    }));
    if (files.some(file => !file.bytes.length || file.bytes.length > MAX_UPLOAD_BYTES)) throw new ImageValidationError("Encoded image exceeds the bucket limit.");
    return { width: image.width, height: image.height, files };
  });
}
