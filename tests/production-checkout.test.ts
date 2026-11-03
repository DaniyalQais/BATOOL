import test from "node:test";
import assert from "node:assert/strict";
import { productionCheckoutConfig } from "../src/features/checkout/model/production-config.ts";
import { availability } from "../src/features/checkout/model/availability.ts";
import { checkoutClient } from "../src/features/checkout/model/checkout-client.ts";
import { checkoutHandler, scopeSigner } from "../supabase/functions/_shared/checkout-handler.ts";
const project = "https://abcdefghijklmnopqrst.supabase.co";
const origin = "https://store.example.invalid";
const id = "00000000-0000-4000-8000-000000000001";
const replacement = "00000000-0000-4000-8000-000000000002";
const resolution = { status: "retired", quote_id: id, resolution_id: replacement, replacement_key: replacement, replacement_quote: null };
test("production config requires exact project endpoint and explicit release flags", () => {
  assert.deepEqual(productionCheckoutConfig(undefined, project, "true"), { endpoint: "", checkout: false, recovery: false });
  const endpoint = project + "/functions/v1/secure-checkout";
  assert.deepEqual(productionCheckoutConfig(endpoint, project), { endpoint, checkout: false, recovery: false });
  assert.equal(productionCheckoutConfig(endpoint, project, "true", "true").recovery, true);
  for (const value of ["http://127.0.0.1:1234", "https://other.example.invalid/functions/v1/secure-checkout", endpoint + "?key=bad", endpoint + "/", "https://u:p@abcdefghijklmnopqrst.supabase.co/functions/v1/secure-checkout"]) assert.throws(() => productionCheckoutConfig(value, project, "true"));
});
test("runtime availability rejects incomplete, inconsistent or private payloads", () => {
  assert.deepEqual(availability({ enabled: false, methods: [] }), { enabled: false, methods: [] });
  assert.deepEqual(availability({ enabled: true, methods: ["cod"] }).methods, ["cod"]);
  for (const value of [{ enabled: true, methods: [] }, { enabled: false, methods: ["cod"] }, { enabled: true, methods: ["cod", "cod"] }, { enabled: true, methods: ["card"] }, { enabled: false, methods: [], recipients: [] }]) assert.throws(() => availability(value));
});
function request(body: unknown) { return new Request("https://function.invalid", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }); }
test("new intake fails closed before scope issuance when recovery or database readiness is missing", async () => {
  const signer = await scopeSigner("x".repeat(32)); let issued = 0;
  for (const recoveryEnabled of [false, true]) {
    const handler = checkoutHandler({ enabled: true, recoveryEnabled, signer, origins: new Set([origin]), rpc: async name => {
      if (name === "checkout_admit") return true;
      if (name === "checkout_availability") return { enabled: false, methods: [] };
      issued++; throw Error("Unexpected RPC");
    } });
    assert.equal((await handler(request({ action: "scope" }))).status, 503);
  }
  assert.equal(issued, 0);
});
test("support exchange checks durable outcome twice and explicitly projects safe response", async () => {
  const signer = await scopeSigner("x".repeat(32)); let reads = 0;
  const handler = checkoutHandler({ enabled: false, recoveryEnabled: true, signer, origins: new Set([origin]), rpc: async name => {
    if (name === "checkout_admit") return true;
    if (name === "checkout_support_result") { reads++; return { state: "retired", scope_id: id, resolution, private_canary: true }; }
    throw Error();
  } });
  const response = await handler(request({ action: "support_result", case_id: id, proof: "a".repeat(64) }));
  const result = await response.json(); assert.equal(response.status, 200); assert.equal(reads, 2);
  assert.deepEqual(Object.keys(result).sort(), ["resolution", "scope", "state"]); assert.equal(await signer.verify(result.scope), id);
});
test("unconfirmed, mismatched support result never reissues a capability", async () => {
  const signer = await scopeSigner("x".repeat(32)); let reads = 0;
  const handler = checkoutHandler({ enabled: false, recoveryEnabled: true, signer, origins: new Set([origin]), rpc: async name => {
    if (name === "checkout_admit") return true;
    return { state: "retired", scope_id: id, resolution: { ...resolution, resolution_id: ++reads === 1 ? id : replacement } };
  } });
  const response = await handler(request({ action: "support_result", case_id: id, proof: "a".repeat(64) }));
  assert.equal(response.status, 503); assert.equal("scope" in await response.json(), false);
});
test("support adoption persists before releasing intent and never consumes unrelated cart", () => {
  let raw = ""; let consumed = 0; let fail = false;
  const client = checkoutClient(async () => null, { read: () => raw, write: value => { if (fail) throw Error("storage"); raw = value; }, remove: () => { raw = ""; } }, () => consumed++);
  fail = true; assert.throws(() => client.adoptRecovery({ state: "retired", resolution, scope: "signed" })); assert.equal(client.restarting(), false);
  fail = false; assert.equal(client.adoptRecovery({ state: "retired", resolution, scope: "signed" }), null); assert.equal(client.restarting(), true); assert.equal(consumed, 0);
  assert.equal(JSON.parse(raw).replacement_key, replacement);
});
test("support committed receipt restores status without clearing an unbound bag", () => {
  let raw = ""; let consumed = 0;
  const storage = { read: () => raw, write: (value: string) => { raw = value; }, remove: () => { raw = ""; } };
  const receipt = { order_id: id, quote_id: id, currency: "PKR", subtotal_minor: "100", shipping_minor: "0", total_minor: "100", payment_status: "unpaid" };
  const client = checkoutClient(async () => null, storage, () => consumed++);
  assert.deepEqual(client.adoptRecovery({ resolution: { status: "committed", receipt } }), receipt);
  const restored = checkoutClient(async () => null, storage, () => consumed++); restored.restore();
  assert.deepEqual(restored.operationalReceipt(), receipt); assert.equal(consumed, 0);
});
test("unreadable saved identity blocks support replacement instead of overwriting recovery evidence", () => {
  const raw = "{corrupted"; let writes = 0;
  const client = checkoutClient(async () => null, { read: () => raw, write: () => { writes++; }, remove: () => {} }, () => {});
  assert.throws(() => client.restore());
  assert.throws(() => client.adoptRecovery({ resolution, scope: "signed" }), /unreadable/);
  assert.equal(writes, 0); assert.equal(client.restarting(), false);
});
test("new create path registers original intent before creation; escrow failure blocks creation", async () => {
  const signer = await scopeSigner("x".repeat(32)); const scope = await signer.issue(); let creates = 0;
  const handler = checkoutHandler({ enabled: true, recoveryEnabled: true, signer, origins: new Set([origin]), rpc: async name => {
    if (name === "checkout_admit") return true;
    if (name === "checkout_availability") return { enabled: true, methods: ["cod"] };
    if (name === "checkout_register_intent") return false;
    creates++; throw Error("Should never create");
  } });
  const response = await handler(request({ action: "create", scope, key: replacement, quote_id: id, customer: {} }));
  assert.equal(response.status, 503); assert.equal(creates, 0);
});
test("support envelope cannot relabel a retirement as a committed outcome", async () => {
  const signer = await scopeSigner("x".repeat(32));
  const handler = checkoutHandler({ enabled: false, recoveryEnabled: true, signer, origins: new Set([origin]), rpc: async name =>
    name === "checkout_admit" ? true : { state: "committed", scope_id: id, resolution } });
  const result = await handler(request({ action: "support_result", case_id: id, proof: "a".repeat(64) }));
  assert.equal(result.status, 503); assert.equal("scope" in await result.json(), false);
});
test("support cannot overwrite an unrelated saved replacement identity", () => {
  let raw = "";
  const client = checkoutClient(async () => null, { read: () => raw, write: value => { raw = value; }, remove: () => {} }, () => {});
  client.adoptRecovery({ resolution, scope: "signed" }); const saved = raw;
  assert.throws(() => client.adoptRecovery({ resolution: { ...resolution, resolution_id: id }, scope: "other" }), /unresolved/);
  assert.equal(raw, saved);
});
