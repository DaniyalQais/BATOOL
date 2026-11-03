import { isIntentResolution, isQuote, isReceipt, matchesQuote, object, uuid } from "../../../src/features/checkout/model/contracts.ts";
import { availability, closedAvailability } from "../../../src/features/checkout/model/availability.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export class CheckoutError extends Error {
  status: number;
  category: string;
  constructor(status: number, category: string) { super(category); this.status = status; this.category = category; }
}
const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
export async function scopeSigner(secret: string, now = () => Date.now()) {
  if (encoder.encode(secret).length < 32) throw new Error("Checkout scope secret is not configured");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  async function sign(text: string) { return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(text))); }
  async function issue(id: string = crypto.randomUUID()) {
    if (!uuid.test(id)) throw new CheckoutError(401, "scope_expired_or_invalid");
    const body = `${id}.${now() + 7 * 86400000}`;
    return `${body}.${await sign(body)}`;
  }
  return {
    issue: () => issue(),
    // Renew only after a separately confirmed retirement, never from a
    // customer-supplied scope UUID or a momentary missing order.
    renewAfterResolution: (id: string) => issue(id),
    async verify(token: unknown, recoveryOnly = false) {
      if (typeof token !== "string" || token.length > 180) throw new CheckoutError(401, "scope_required");
      const [id, expires, signature, extra] = token.split(".");
      if (extra !== undefined || !uuid.test(id) || !/^[0-9]{13}$/.test(expires) || !/^[0-9a-f]{64}$/.test(signature)
        || Number(expires) + (recoveryOnly ? 23 * 86400000 : 0) <= now()
        || Number(expires) > now() + 7 * 86400000) throw new CheckoutError(401, "scope_expired_or_invalid");
      const bytes = Uint8Array.from(signature.match(/../g)!, byte => parseInt(byte, 16));
      if (!await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${id}.${expires}`))) throw new CheckoutError(401, "scope_expired_or_invalid");
      return id;
    },
    // Shared conservative cohorts: no caller-supplied proxy/address header is
    // trusted, stored, or used to mint arbitrarily many admission identities.
    bucket: (cohort: "availability" | "checkout") => sign(`rate:shared:${cohort}`),
  };
}
type Signer = Awaited<ReturnType<typeof scopeSigner>>;
export function checkoutHandler(config: { enabled: boolean; recoveryEnabled?: boolean; origins: ReadonlySet<string>; signer: Signer; rpc: Rpc }) {
  const recoveryEnabled = config.recoveryEnabled ?? true;
  return async (request: Request) => {
    const origin = request.headers.get("origin") ?? "";
    const allowed = config.origins.has(origin);
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
    if (allowed) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Headers", "content-type");
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    try {
      if (!allowed) throw new CheckoutError(403, "origin_denied");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") throw new CheckoutError(405, "post_required");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new CheckoutError(415, "json_required");
      // Bound the stream itself; Content-Length is not trusted.
      const reader = request.body?.getReader();
      if (!reader) throw new CheckoutError(400, "invalid_request");
      let length = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 16384) { await reader.cancel(); throw new CheckoutError(413, "request_too_large"); }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CheckoutError(400, "invalid_request"); }
      if (!object(body) || typeof body.action !== "string") throw new CheckoutError(400, "invalid_request");
      const keys: Record<string, string[]> = { availability: ["action"], support_open: ["action", "case_id", "proof"], support_result: ["action", "case_id", "proof"],
        scope: ["action"], quote: ["action", "scope", "cart", "method"], create: ["action", "scope", "key", "quote_id", "customer"], recover: ["action", "scope", "key"],
        resolve: ["action", "scope", "key", "quote_id"], replacement_quote: ["action", "scope", "resolution_id", "cart", "method"] };
      const expected = Object.hasOwn(keys, body.action) ? keys[body.action] : undefined;
      if (!expected || Object.keys(body).length !== expected.length || expected.some(key => !(key in body))) throw new CheckoutError(400, "invalid_request");
      if (body.action === "availability") {
        const admit = await config.rpc("checkout_admit", { p_bucket: await config.signer.bucket("availability") });
        if (admit !== true) {
          if (admit === "failure") {
            throw new CheckoutError(503, "checkout_unavailable");
          }
          throw new CheckoutError(429, "rate_limited");
        }
        const result = config.enabled && recoveryEnabled ? availability(await config.rpc("checkout_availability", {})) : closedAvailability();
        return response(200, result);
      }
      const support = body.action === "support_open" || body.action === "support_result";
      if (support && (!recoveryEnabled || typeof body.case_id !== "string" || !uuid.test(body.case_id)
        || typeof body.proof !== "string" || !/^[0-9a-f]{64}$/.test(body.proof))) throw new CheckoutError(recoveryEnabled ? 400 : 503, "recovery_unavailable");
      // Recovery remains available when new intake is switched off.
      const recoveryOnly = body.action === "recover" || body.action === "resolve";
      if (!config.enabled && !recoveryOnly && !support) throw new CheckoutError(503, "checkout_unavailable");
      const scope = body.action === "scope" || support ? null : await config.signer.verify(body.scope, recoveryOnly);
      if (await config.rpc("checkout_admit", { p_bucket: await config.signer.bucket("checkout") }) !== true) throw new CheckoutError(429, "rate_limited");
      if (support) {
        const args = { p_case: body.case_id, p_proof: body.proof };
        if (body.action === "support_open") {
          const opened = await config.rpc("checkout_support_open", args);
          if (!object(opened) || opened.case_id !== body.case_id || typeof opened.state !== "string" || typeof opened.expires_at !== "string") throw new CheckoutError(503, "recovery_unconfirmed");
          return response(200, { case_id: opened.case_id, state: opened.state, expires_at: opened.expires_at });
        }
        const result = await config.rpc("checkout_support_result", args);
        if (!object(result) || !["open", "verified", "escalated", "committed", "retired"].includes(String(result.state))) throw new CheckoutError(503, "recovery_unconfirmed");
        if (result.state !== "committed" && result.state !== "retired") return response(200, { state: result.state });
        const confirmed = await config.rpc("checkout_support_result", args);
        if (!object(confirmed) || confirmed.state !== result.state || !isIntentResolution(result.resolution)
          || !isIntentResolution(confirmed.resolution) || confirmed.resolution.status !== result.resolution.status
          || confirmed.resolution.status !== confirmed.state) throw new CheckoutError(503, "recovery_unconfirmed");
        if (confirmed.resolution.status === "committed" && result.resolution.status === "committed") {
          if (!matchesQuote(confirmed.resolution.receipt, result.resolution.receipt)
            || confirmed.resolution.receipt.order_id !== result.resolution.receipt.order_id) throw new CheckoutError(503, "recovery_unconfirmed");
          return response(200, { state: "committed", resolution: confirmed.resolution });
        }
        if (confirmed.resolution.status !== "retired" || result.resolution.status !== "retired"
          || confirmed.scope_id !== result.scope_id || typeof confirmed.scope_id !== "string" || !uuid.test(confirmed.scope_id)
          || confirmed.resolution.quote_id !== result.resolution.quote_id || confirmed.resolution.resolution_id !== result.resolution.resolution_id
          || confirmed.resolution.replacement_key !== result.resolution.replacement_key) throw new CheckoutError(503, "recovery_unconfirmed");
        return response(200, { state: "retired", resolution: confirmed.resolution, scope: await config.signer.renewAfterResolution(confirmed.scope_id) });
      }
      if (!recoveryOnly) {
        if (config.recoveryEnabled !== undefined && !config.recoveryEnabled) throw new CheckoutError(503, "checkout_unavailable");
        if (body.action === "scope") {
          const avail = await config.rpc("checkout_availability", {});
          if (!availability(avail).enabled) throw new CheckoutError(503, "checkout_unavailable");
        }
      }
      if (body.action === "scope") return response(200, { scope: await config.signer.issue() });
      if (body.action === "quote") {
        const quote = await config.rpc("checkout_quote", { p_scope: scope, p_cart: body.cart, p_method: body.method });
        if (!isQuote(quote)) throw new CheckoutError(502, "invalid_backend_response");
        return response(200, { quote });
      }
      if (body.action === "replacement_quote") {
        if (typeof body.resolution_id !== "string" || !uuid.test(body.resolution_id)) throw new CheckoutError(400, "invalid_request");
        const quote = await config.rpc("checkout_replacement_quote", { p_scope: scope, p_resolution: body.resolution_id, p_cart: body.cart, p_method: body.method });
        if (!isQuote(quote)) throw new CheckoutError(502, "invalid_backend_response");
        return response(200, { quote });
      }
      if (typeof body.key !== "string" || !uuid.test(body.key)) throw new CheckoutError(400, "invalid_request");
      if (body.action === "recover") {
        const receipt = await config.rpc("checkout_recover", { p_scope: scope, p_key: body.key });
        if (receipt === null) {
          // If caller passes null or unconfirmed, return 200 { confirmed: false } unless commit recovery in create
          return response(200, { confirmed: false });
        }
        if (!isReceipt(receipt)) throw new CheckoutError(502, "invalid_backend_response");
        return response(200, { confirmed: true, receipt });
      }
      if (typeof body.quote_id !== "string" || !uuid.test(body.quote_id)) throw new CheckoutError(400, "invalid_request");
      if (body.action === "resolve") {
        const args = { p_scope: scope, p_key: body.key, p_quote: body.quote_id };
        const resolved = await config.rpc("checkout_resolve", args);
        if (!isIntentResolution(resolved)) throw new CheckoutError(503, "resolution_unconfirmed");
        const committed = await config.rpc("checkout_resolution", args);
        if (!isIntentResolution(committed) || committed.status !== resolved.status) throw new CheckoutError(503, "resolution_unconfirmed");
        if (resolved.status === "committed" && committed.status === "committed") {
          if (resolved.receipt.quote_id !== body.quote_id || committed.receipt.order_id !== resolved.receipt.order_id
            || !matchesQuote(committed.receipt, resolved.receipt)) throw new CheckoutError(503, "resolution_unconfirmed");
          return response(200, { resolution: committed });
        }
        if (resolved.status !== "retired" || committed.status !== "retired" || resolved.quote_id !== body.quote_id
          || committed.quote_id !== resolved.quote_id || committed.resolution_id !== resolved.resolution_id
          || committed.replacement_key !== resolved.replacement_key || committed.replacement_key === body.key) throw new CheckoutError(503, "resolution_unconfirmed");
        return response(200, { resolution: committed, scope: await config.signer.renewAfterResolution(scope!) });
      }
      if (config.recoveryEnabled) {
        if (await config.rpc("checkout_register_intent", { p_scope: scope, p_key: body.key, p_quote: body.quote_id }) !== true) throw new CheckoutError(503, "intent_unconfirmed");
      }
      const created = await config.rpc("checkout_create", { p_scope: scope, p_key: body.key, p_quote: body.quote_id, p_customer: body.customer });
      if (!isReceipt(created) || created.quote_id !== body.quote_id) throw new CheckoutError(502, "commit_unconfirmed");
      // A second independent HTTP transaction must see the committed row. Never
      // forward customer Prefer headers or equate a pre-commit return with success.
      const committed = await config.rpc("checkout_recover", { p_scope: scope, p_key: body.key });
      if (!isReceipt(committed) || committed.order_id !== created.order_id || !matchesQuote(committed, created)) throw new CheckoutError(503, "commit_unconfirmed");
      return response(200, { confirmed: true, receipt: committed });
    } catch (error) {
      return response(error instanceof CheckoutError ? error.status : 503,
        { error: error instanceof CheckoutError ? error.category : "checkout_unavailable" });
    }
  };
}
