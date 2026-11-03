import { createClient } from "@supabase/supabase-js";
import { ImageMagick, initializeImageMagick } from "@imagemagick/magick-wasm";
import { decodeProductImage, ImageDecoderUnavailable } from "../_shared/decode-product-image.ts";
import { handleProductImage } from "../_shared/product-image-handler.ts";
import { DECODER_BUCKET, DECODER_PATH, verifiedDecoderAsset } from "../_shared/product-image-decoder-asset.ts";

const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
let initialized: Promise<void> | undefined;
async function initializeDecoder(url: string) {
  try {
    initialized ??= (async () => {
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!secret) throw new Error("Missing trusted configuration");
      const client = createClient(url, secret, { auth, global: { fetch: timedFetch } });
      const asset = await client.storage.from(DECODER_BUCKET).download(DECODER_PATH);
      if (asset.error || !asset.data) throw new Error("Decoder asset unavailable");
      await initializeImageMagick(await verifiedDecoderAsset(asset.data));
    })();
    await initialized;
  } catch {
    initialized = undefined;
    throw new ImageDecoderUnavailable("Trusted pinned image decoder is unavailable.");
  }
}
Deno.serve(request => {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return handleProductImage(request, {
    configured: Boolean(url && key),
    allowedOrigins: (Deno.env.get("BATOOL_ALLOWED_ORIGINS") ?? "").split(",").map(value => value.trim()).filter(Boolean),
    caller: authorization => createClient(url, key, { auth, global: { headers: { Authorization: authorization }, fetch: timedFetch } }),
    trusted: () => {
      const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      return secret ? createClient(url, secret, { auth, global: { fetch: timedFetch } }) : undefined;
    },
    ready: () => initializeDecoder(url),
    decode: async (bytes, mime) => {
      await initializeDecoder(url);
      return decodeProductImage(bytes, mime, ImageMagick);
    },
  });
});
