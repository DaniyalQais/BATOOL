import { createClient } from "@supabase/supabase-js";
import { ImageMagick, initializeImageMagick } from "@imagemagick/magick-wasm";
import { decodeProductImage, ImageDecoderUnavailable } from "../_shared/decode-product-image.ts";
import { handleProductImage } from "../_shared/product-image-handler.ts";

const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
let initialized: Promise<void> | undefined;
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
    decode: async (bytes, mime) => {
      try {
        initialized ??= Deno.readFile(new URL("./assets/magick.wasm", import.meta.url)).then(initializeImageMagick);
        await initialized;
      } catch {
        initialized = undefined;
        throw new ImageDecoderUnavailable("Image decoder asset or runtime unavailable.");
      }
      return decodeProductImage(bytes, mime, ImageMagick);
    },
  });
});
