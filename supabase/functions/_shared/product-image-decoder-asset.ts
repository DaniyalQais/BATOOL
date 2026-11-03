// Exact existing ImageMagick binary; transport changes, validation does not.
export const DECODER_BUCKET = "product-image-validator-assets";
export const DECODER_SHA256 = "54629cbcf06dd10db38b4d87fa6ab241b248c09c94f2d9689506e5f994ac5f0c";
export const DECODER_BYTES = 15_425_791;
export const DECODER_PATH = `magick-wasm/0.0.45/${DECODER_SHA256}/magick.wasm.gz`;

export async function verifiedDecoderAsset(compressed: Blob): Promise<Uint8Array> {
  if (!compressed.size || compressed.size > 8 * 1024 * 1024) throw new Error("Invalid decoder asset size");
  const reader = compressed.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > DECODER_BYTES) throw new Error("Decoder asset exceeds pinned length");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (length !== DECODER_BYTES) throw new Error("Decoder asset is truncated");
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(x => x.toString(16).padStart(2, "0")).join("");
  if (digest !== DECODER_SHA256 || !WebAssembly.validate(bytes)) throw new Error("Decoder asset integrity failed");
  return bytes;
}
