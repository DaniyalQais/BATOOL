import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutClient } from "../src/features/checkout/model/checkout-client.ts";
import { localCheckoutEndpoint } from "../src/features/checkout/model/local-config.ts";
import { isQuote, isReceipt, type Quote, type DeliveryDetails } from "../src/features/checkout/model/contracts.ts";
import { checkoutHandler, scopeSigner } from "../supabase/functions/_shared/checkout-handler.ts";
import { createCartStore } from "../src/features/cart/model/cart-store.ts";

const qid = "00000000-0000-4000-8000-000000000951";
const oid = "00000000-0000-4000-8000-000000000952";
const key = "00000000-0000-4000-8000-000000000953";
const cart = [{ id: 0, size: "M", quantity: 1 }] as const;
const quote: Quote = { quote_id: qid, expires_at: "2099-01-01T00:00:00Z", currency: "PKR", lines: [{ ...cart[0], name: "Synthetic", unit_price_minor: "100001" }],
  subtotal_minor: "100001", shipping_minor: "25001", total_minor: "125002", shipping_mode: "flat_rate", payment_method: "cod", settings_revision: 1,
  payment_instructions: "SYNTHETIC INSTRUCTIONS", policy_text: "SYNTHETIC POLICY" };
const receipt = { order_id: oid, quote_id: qid, currency: "PKR", subtotal_minor: "100001", shipping_minor: "25001", total_minor: "125002", payment_status: "unpaid" };
const customer: DeliveryDetails = { recipient_name: "Synthetic", phone: "923000000000", email: null, address_line1: "Synthetic", address_line2: null, city: "Synthetic", region: null, postal_code: null, country_code: "PK" };
function setup() {
  let raw: string | null = null, failWrite = false;
  const requests: Record<string, unknown>[] = []; let result: unknown = { confirmed: true, receipt }; let failure = false;
  const completed: unknown[] = [];
  const storage = { read: () => raw, write(value: string) { if (failWrite) throw new Error("storage blocked"); raw = value; }, remove() { raw = null; } };
  const transport = async (body: Record<string, unknown>) => {
    requests.push(body);
    if (body.action === "scope") return { scope: "synthetic-scope" };
    if (body.action === "quote") return { quote };
    if (failure) throw new Error("synthetic timeout");
    return result;
  };
  return { client: checkoutClient(transport, storage, items => completed.push(items)), requests, completed, storage, transport,
    raw: () => raw, setFailure(value: boolean) { failure = value; }, setResult(value: unknown) { result = value; }, failStorage() { failWrite = true; } };
}
test("quote/receipt arithmetic is exact and rejects tampered totals or unknown values", () => {
  assert.equal(isQuote(quote), true); assert.equal(isReceipt(receipt), true);
  for (const change of [{ total_minor: "1" }, { currency: "USD" }, { total_minor: 125002 }, { shipping_minor: "-1" }]) assert.equal(isReceipt({ ...receipt, ...change }), false);
  assert.equal(isQuote({ ...quote, lines: [...quote.lines, ...quote.lines] }), false);
  assert.equal(isQuote({ ...quote, shipping_mode: "free" }), false);
  assert.equal(isQuote({ ...quote, notification_recipients: ["PRIVATE CANARY"] }), false);
  assert.equal(isQuote({ ...quote, lines: quote.lines.map(line => ({ ...line, wallet_account_number: "PRIVATE CANARY" })) }), false);
  assert.equal(isReceipt({ ...receipt, recipient_name: "PRIVATE CANARY" }), false);
});
test("local endpoint accepts only explicit loopback origins; no live URL can activate checkout", () => {
  assert.equal(localCheckoutEndpoint(undefined), "");
  assert.equal(localCheckoutEndpoint("http://127.0.0.1:43123/"), "http://127.0.0.1:43123");
  for (const url of ["https://checkout.example.invalid", "http://127.0.0.1", "http://localhost:1234/path", "http://user:pass@localhost:1234", "http://localhost:1234?key=secret"]) assert.throws(() => localCheckoutEndpoint(url));
});
test("client preserves bag on ambiguous response and reuses durable key on every retry", async () => {
  const state = setup(); await state.client.quote(cart, "cod"); state.setFailure(true);
  await assert.rejects(state.client.place(quote, customer));
  assert.equal(state.completed.length, 0); assert.ok(state.raw());
  const first = state.requests.at(-1)!;
  await assert.rejects(state.client.place(quote, customer)); assert.equal(state.requests.at(-1)!.key, first.key);
  state.setFailure(false); await state.client.place(quote, customer);
  assert.equal(state.completed.length, 1);
  assert.equal(state.requests.at(-1)!.key, first.key);
  assert.ok(!state.raw()!.includes("923000000000")); assert.ok(!state.raw()!.includes("recipient_name"));
});
test("client refuses receipt mismatches and unconfirmed commits without consuming bag", async () => {
  for (const result of [{ confirmed: false }, { confirmed: true, receipt: { ...receipt, quote_id: oid } }, { confirmed: true, receipt: { ...receipt, total_minor: "0" } }, { receipt }]) {
    const state = setup(); await state.client.quote(cart, "cod"); state.setResult(result);
    await assert.rejects(state.client.place(quote, customer)); assert.equal(state.completed.length, 0);
  }
});
test("storage unavailable blocks submission before creating an order", async () => {
  const state = setup(); await state.client.quote(cart, "cod"); state.failStorage();
  await assert.rejects(state.client.place(quote, customer), /No order was sent/);
  assert.equal(state.requests.filter(request => request.action === "create").length, 0);
});
test("reload recovery uses original scope/key and consumes bag once after confirmed commit", async () => {
  const state = setup(); await state.client.quote(cart, "cod"); state.setFailure(true); await assert.rejects(state.client.place(quote, customer));
  const sent = state.requests.at(-1)!; state.setFailure(false);
  const recovered = checkoutClient(state.transport, state.storage, items => state.completed.push(items)); recovered.restore();
  assert.deepEqual(await recovered.recover(), receipt);
  assert.equal(state.requests.at(-1)!.scope, sent.scope); assert.equal(state.requests.at(-1)!.key, sent.key);
  assert.equal(state.completed.length, 1);
  const reloaded = checkoutClient(state.transport, state.storage, items => state.completed.push(items)); reloaded.restore();
  await reloaded.recover(); assert.equal(state.completed.length, 1);
});
test("not-found recovery preserves bag AND retry identity because another request may be committing", async () => {
  const state = setup(); await state.client.quote(cart, "cod"); state.setFailure(true); await assert.rejects(state.client.place(quote, customer));
  const pending = state.raw(); state.setFailure(false); state.setResult({ confirmed: false });
  assert.equal(await state.client.recover(), null); assert.equal(state.raw(), pending); assert.equal(state.completed.length, 0);
  await assert.rejects(state.client.quote(cart, "cod"), /Resolve/);
});
test("another purchase needs a confirmed receipt and explicitly removes the completed intent first", async () => {
  const state = setup(); await state.client.quote(cart, "cod");
  assert.throws(() => state.client.startAnother());
  await state.client.place(quote, customer); const firstKey = state.requests.at(-1)!.key;
  state.client.startAnother(); assert.equal(state.raw(), null);
  await state.client.quote(cart, "cod"); await state.client.place(quote, customer);
  assert.notEqual(state.requests.at(-1)!.key, firstKey); assert.equal(state.completed.length, 2);
});
test("double click is serialized and cart stays until a deferred commit confirmation arrives", async () => {
  let finish!: (value: unknown) => void; const waiting = new Promise(resolve => { finish = resolve; });
  const completed: unknown[] = [];
  const state = checkoutClient(async body => body.action === "scope" ? { scope: "s" } : body.action === "quote" ? { quote } : waiting,
    { read: () => null, write() {}, remove() {} }, value => completed.push(value));
  await state.quote(cart, "cod"); const pending = state.place(quote, customer);
  await assert.rejects(state.place(quote, customer), /already in progress/); assert.equal(completed.length, 0);
  finish({ confirmed: true, receipt }); await pending; assert.equal(completed.length, 1);
});
test("cart confirmation clears an unchanged purchased line and preserves changed/new selections", () => {
  let raw = JSON.stringify([{ ...cart[0] }, { id: 2, size: "S", quantity: 1 }]);
  const store = createCartStore({ read: () => raw, write: value => { raw = value; }, listen: () => () => {} });
  const stop = store.subscribe(() => {}); store.actions.completeCheckout(cart);
  assert.deepEqual(store.getSnapshot(), [{ id: 2, size: "S", quantity: 1 }]); stop();
  raw = JSON.stringify([{ ...cart[0], quantity: 2 }]); const stop2 = store.subscribe(() => {});
  store.actions.completeCheckout(cart); assert.equal(store.getCount(), 2); stop2();
});

async function backend(enabled = true, result: unknown = receipt) {
  const signer = await scopeSigner("synthetic-signing-secret-at-least-32-characters");
  const scope = await signer.issue(); const calls: string[] = []; let recovery = result;
  const handler = checkoutHandler({ enabled, origins: new Set(["http://localhost:43210"]), signer, rpc: async name => {
    calls.push(name);
    if (name === "checkout_admit") return true;
    if (name === "checkout_quote") return quote;
    if (name === "checkout_create") return receipt;
    if (name === "checkout_recover") return recovery;
    throw new Error("Unexpected RPC");
  } });
  const request = (body: unknown, headers: Record<string, string> = {}) => handler(new Request("http://localhost:43211", {
    method: "POST", headers: { Origin: "http://localhost:43210", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  }));
  return { signer, scope, calls, handler, request, setRecovery(value: unknown) { recovery = value; } };
}
test("capabilities reject forged, expired, malformed and unsigned scopes", async () => {
  let now = 1793610000000; const signer = await scopeSigner("synthetic-signing-secret-at-least-32-characters", () => now);
  const scope = await signer.issue(); assert.ok(await signer.verify(scope));
  for (const forged of [null, "owner", scope + ".extra", scope.replace(/.$/, scope.endsWith("0") ? "1" : "0")]) await assert.rejects(signer.verify(forged));
  now += 7 * 86400000 + 1; await assert.rejects(signer.verify(scope));
});
test("backend disabled rejects intake before RPC, while valid scoped recovery stays available", async () => {
  const state = await backend(false);
  assert.equal((await state.request({ action: "scope" })).status, 503); assert.equal(state.calls.length, 0);
  assert.equal((await state.request({ action: "recover", scope: state.scope, key })).status, 200);
});
test("backend rejects foreign origins, extra paid claims, wrong types and oversized bodies", async () => {
  const state = await backend();
  assert.equal((await state.request({ action: "scope" }, { Origin: "https://foreign.invalid" })).status, 403);
  assert.equal((await state.request({ action: "create", scope: state.scope, key, quote_id: qid, customer, payment_status: "paid" })).status, 400);
  assert.equal((await state.request({ action: "scope", padding: "x".repeat(18000) })).status, 413);
  assert.equal((await state.request({ action: "recover", scope: "unsigned", key })).status, 401);
  assert.equal(state.calls.length, 0);
});
test("backend confirms order with a separate recovery RPC before returning success", async () => {
  const state = await backend(); const result = await state.request({ action: "create", scope: state.scope, key, quote_id: qid, customer });
  assert.equal(result.status, 200); assert.deepEqual(state.calls, ["checkout_admit", "checkout_create", "checkout_recover"]);
  assert.deepEqual(await result.json(), { confirmed: true, receipt });
});
test("backend never reports success when independent commit recovery is missing or mismatched", async () => {
  for (const recovered of [null, { ...receipt, order_id: key }, { ...receipt, quote_id: key }]) {
    const state = await backend(true, recovered);
    const result = await state.request({ action: "create", scope: state.scope, key, quote_id: qid, customer });
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "commit_unconfirmed" });
  }
});
