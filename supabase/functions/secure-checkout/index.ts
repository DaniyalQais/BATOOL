// Prepared only; not deployed. No credentials belong in the export or source.
import { checkoutHandler, CheckoutError, scopeSigner } from "../_shared/checkout-handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const enabled = Deno.env.get("BATOOL_CHECKOUT_ENABLED") === "true";
const recoveryEnabled = Deno.env.get("BATOOL_RECOVERY_ENABLED") === "true";
const origins = new Set((Deno.env.get("BATOOL_CHECKOUT_ORIGINS") ?? "").split(",").map(value => value.trim()).filter(Boolean));
const scopeSecret = Deno.env.get("BATOOL_CHECKOUT_SCOPE_SECRET") ?? "";

// Missing configuration fails closed, including when the intake gate is false.
if (!/^https:\/\/[^/]+$/.test(url) || !secret || scopeSecret.length < 32 || !origins.size) {
  Deno.serve(() => new Response('{"error":"checkout_unavailable"}', { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
} else {
  const signer = await scopeSigner(scopeSecret);
  Deno.serve(checkoutHandler({ enabled, recoveryEnabled, origins, signer, async rpc(name, args) {
    const result = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", apikey: secret, Authorization: `Bearer ${secret}`, Prefer: "tx=commit" },
      body: JSON.stringify(args),
    });
    if (!result.ok) {
      // Do not return arbitrary DB messages, request bodies, settings, or PII.
      const categories: Record<number, string> = { 400: "invalid_request", 409: "quote_or_stock_changed", 429: "rate_limited", 503: "checkout_unavailable" };
      throw new CheckoutError(categories[result.status] ? result.status : 503, categories[result.status] ?? "checkout_unavailable");
    }
    return await result.json();
  } }));
}
