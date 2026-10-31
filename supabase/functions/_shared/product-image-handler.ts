import type { SupabaseClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";
import type { DecodedImage } from "./decode-product-image.ts";
import { ImageDecoderUnavailable } from "./decode-product-image.ts";
import { assertUploadPath, IMAGE_BUCKET, IMAGE_UPLOAD_BUCKET, IMAGE_TYPES, MAX_UPLOAD_BYTES, ImageValidationError, type ImageMime } from "./image-policy.ts";

export interface ImageValidatorPorts {
  configured: boolean; allowedOrigins: string[];
  caller: (authorization: string) => SupabaseClient;
  trusted: () => SupabaseClient | undefined;
  decode: (bytes: Uint8Array, mime: ImageMime) => Promise<DecodedImage>;
}
export async function handleProductImage(request: Request, ports: ImageValidatorPorts): Promise<Response> {
  const origin = request.headers.get("Origin");
  const allowed = ports.allowedOrigins;
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = corsHeaders["Access-Control-Allow-Headers"];
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return reply(403, { code: "origin_denied", message: "Origin is not configured." });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { code: "method_not_allowed" });
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    if (!ports.configured) return reply(503, { code: "validator_unconfigured" });
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { code: "unauthenticated" });
    const caller = ports.caller(authorization);
    const identity = await caller.auth.getUser(authorization.replace(/^Bearer /i, ""));
    if (identity.error || !identity.data.user || identity.data.user.is_anonymous) return reply(401, { code: "unauthenticated" });
    const userId = identity.data.user.id;
    const role = await caller.from("dashboard_roles").select("role").eq("user_id", userId).maybeSingle();
    if (role.error) return reply(503, { code: "role_check_unavailable" });
    if (role.data?.role !== "owner") return reply(403, { code: "42501", message: "Owner access required" });

    // Only a small JSON pointer, never a user-provided URL or arbitrary binary body.
    if (Number(request.headers.get("Content-Length") ?? 0) > 1024) return reply(413, { code: "request_too_large" });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    if (!reader) return reply(400, { code: "invalid_request" });
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 1024) { await reader.cancel(); return reply(413, { code: "request_too_large" }); }
      chunks.push(value);
    }
    const buffer = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(buffer)); } catch { return reply(400, { code: "invalid_request" }); }
    if (!body || typeof body.productId !== "number" || typeof body.uploadPath !== "string") return reply(400, { code: "invalid_request" });
    assertUploadPath(body.uploadPath, body.productId, userId);

    const source = await caller.storage.from(IMAGE_UPLOAD_BUCKET).download(body.uploadPath);
    if (source.error || !source.data) return reply(400, { code: "upload_unavailable" });
    if (!source.data.size || source.data.size > MAX_UPLOAD_BYTES || !IMAGE_TYPES.some(type => type === source.data.type)) return reply(400, { code: "invalid_image" });
    const bytes = new Uint8Array(await source.data.arrayBuffer());
    let decoded;
    try { decoded = await ports.decode(bytes, source.data.type as ImageMime); }
    catch (error) {
      if (error instanceof ImageDecoderUnavailable) return reply(503, { code: "decoder_unavailable", message: "Trusted image decoder is not available. Check validator setup." });
      return reply(400, { code: "invalid_image", message: "Image decoding or dimensions failed validation." });
    }

    // The service key exists only inside the trusted Edge runtime, never the app.
    // Check Owner again immediately before publishing/registering outputs.
    const freshRole = await caller.from("dashboard_roles").select("role").eq("user_id", userId).maybeSingle();
    if (freshRole.error) return reply(503, { code: "role_check_unavailable" });
    if (freshRole.data?.role !== "owner") return reply(403, { code: "42501", message: "Owner access required" });
    const trusted = ports.trusted();
    if (!trusted) return reply(503, { code: "validator_unconfigured" });
    const base = `products/${body.productId}/${userId}/${crypto.randomUUID()}`;
    // No overwrite, move, or delete, including on partial failure.
    for (const file of decoded.files) {
      const uploaded = await trusted.storage.from(IMAGE_BUCKET).upload(`${base}/${file.name}`, file.bytes,
        { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (uploaded.error) return reply(503, { code: "image_publication_failed", message: "Upload retained for administrative review; no product image was changed." });
    }
    const main = decoded.files.find(file => file.name === "main.webp")!;
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(main.bytes)))).map(byte => byte.toString(16).padStart(2,"0")).join("");
    const path = `${base}/main.webp`;
    const registered = await trusted.rpc("register_product_image_asset", { p_product_id: body.productId, p_user_id: userId,
      p_image_path: path, p_width: decoded.width, p_height: decoded.height, p_byte_size: main.bytes.length, p_sha256: sha256 });
    if (registered.error) return reply(503, { code: "registration_failed", message: "Product unchanged; retained objects require administrative review." });
    return reply(200, { path, width: decoded.width, height: decoded.height });
  } catch (error) {
    if (error instanceof ImageValidationError) return reply(400, { code: "invalid_image" });
    // Never log request headers, keys, user credentials, or arbitrary provider errors.
    return reply(503, { code: "validation_unavailable", message: "Validation could not be confirmed. No product attachment was requested." });
  }
}
