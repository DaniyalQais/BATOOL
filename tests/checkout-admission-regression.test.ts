import test from "node:test";
import assert from "node:assert/strict";
import { checkoutHandler, scopeSigner } from "../supabase/functions/_shared/checkout-handler.ts";
const origin = "https://batool-lake.vercel.app";
function request(action: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("https://function.invalid", { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify({ action, ...extra }) });
}
test("availability is admitted before database readiness; denial/failure never exposes methods", async () => {
  const signer = await scopeSigner("x".repeat(32));
  for (const admission of [false, null, "true", "failure"]) {
    const calls: string[] = [];
    const handler = checkoutHandler({ enabled: true, recoveryEnabled: true, signer, origins: new Set([origin]), rpc: async name => {
      calls.push(name); if (admission === "failure") throw Error("private backend canary"); return admission;
    } });
    const response = await handler(request("availability")); assert.equal(response.status, admission === "failure" ? 503 : 429);
    assert.deepEqual(calls, ["checkout_admit"]); const body = await response.json(); assert.deepEqual(Object.keys(body), ["error"]);
  }
});
test("availability is limited even with intake off and never returns private backend fields", async () => {
  const signer = await scopeSigner("x".repeat(32)); const calls: string[] = [];
  const handler = checkoutHandler({ enabled: false, recoveryEnabled: false, signer, origins: new Set([origin]), rpc: async name => { calls.push(name); return true; } });
  const response = await handler(request("availability")); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, methods: [] }); assert.deepEqual(calls, ["checkout_admit"]);
});
test("spoofed/missing/malformed address headers cannot select new admission identities", async () => {
  const signer = await scopeSigner("x".repeat(32)); const buckets: unknown[] = [];
  const handler = checkoutHandler({ enabled: false, signer, origins: new Set([origin]), rpc: async (_name, args) => { buckets.push(args.p_bucket); return true; } });
  const variants: Record<string, string>[] = [{}, { "x-forwarded-for": "1.2.3.4" }, { "x-forwarded-for": "5.6.7.8, 9.0.0.1" }, { "x-real-ip": "::1", "cf-connecting-ip": "198.51.100.2", forwarded: "for=spoofed" }, { "x-forwarded-for": "malformed" }];
  for (const headers of variants) {
    assert.equal((await handler(request("availability", {}, headers))).status, 200);
  }
  assert.equal(new Set(buckets).size, 1); assert.match(String(buckets[0]), /^[0-9a-f]{64}$/);
  assert.equal(buckets[0], await signer.bucket("availability"));
});
test("availability cannot mint arbitrary buckets; recovery uses a separate fixed cohort", async () => {
  const signer = await scopeSigner("x".repeat(32)); const buckets: unknown[] = [];
  const handler = checkoutHandler({ enabled: false, signer, origins: new Set([origin]), rpc: async (name, args) => {
    if (name === "checkout_admit") { buckets.push(args.p_bucket); return true; } return null;
  } });
  const scope = await signer.issue();
  assert.equal((await handler(request("availability"))).status, 200);
  assert.equal((await handler(request("recover", { scope, key: "00000000-0000-4000-8000-000000000001" }, { "x-forwarded-for": "any" }))).status, 200);
  assert.notEqual(buckets[0], buckets[1]); assert.equal(buckets[1], await signer.bucket("checkout"));
  const before = buckets.length; assert.equal((await handler(request("availability", { bucket: "chosen" }))).status, 400); assert.equal(buckets.length, before);
});
test("new availability admission does not relax origin, body, scope or intake gates", async () => {
  const signer = await scopeSigner("x".repeat(32)); let calls = 0;
  const handler = checkoutHandler({ enabled: false, signer, origins: new Set([origin]), rpc: async () => { calls++; return true; } });
  assert.equal((await handler(request("availability", {}, { origin: "https://old.invalid" }))).status, 403);
  assert.equal((await handler(request("availability", { private: true }))).status, 400);
  assert.equal((await handler(request("recover", { scope: "invalid", key: "invalid" }))).status, 401);
  assert.equal((await handler(request("scope"))).status, 503); assert.equal(calls, 0);
});
