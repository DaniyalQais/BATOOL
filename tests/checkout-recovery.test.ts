import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutClient } from "../src/features/checkout/model/checkout-client.ts";
import { isIntentResolution, type DeliveryDetails, type Quote } from "../src/features/checkout/model/contracts.ts";
import { checkoutHandler, scopeSigner } from "../supabase/functions/_shared/checkout-handler.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cart = [{ id: 0, size: "M", quantity: 1 }] as const;
const quote: Quote = { quote_id: id(1201), expires_at: "2099-01-01T00:00:00Z", currency: "PKR", lines: [{ ...cart[0], name: "Synthetic", unit_price_minor: "100001" }],
  subtotal_minor: "100001", shipping_minor: "25001", total_minor: "125002", shipping_mode: "flat_rate", payment_method: "cod", settings_revision: 1,
  payment_instructions: "Synthetic instructions", policy_text: "Synthetic policy" };
const nextQuote = { ...quote, quote_id: id(1202) };
const receipt = { order_id: id(1203), quote_id: quote.quote_id, currency: "PKR", subtotal_minor: quote.subtotal_minor, shipping_minor: quote.shipping_minor, total_minor: quote.total_minor, payment_status: "unpaid" };
const closed = { status: "retired", quote_id: quote.quote_id, resolution_id: id(1204), replacement_key: id(1205), replacement_quote: null };
const customer: DeliveryDetails = { recipient_name: "Synthetic", phone: "923000000000", email: null, address_line1: "Synthetic", address_line2: null, city: "Synthetic", region: null, postal_code: null, country_code: "PK" };
function setup() {
  let raw: string | null = null; let failWrite = false;
  const requests: Record<string, unknown>[] = []; const consumed: unknown[] = [];
  let resolveResult: unknown = { resolution: closed, scope: "renewed-synthetic-scope" };
  let quoteFailure = false, resolveFailure = false, committed = false;
  const storage = { read: () => raw, write(value: string) { if (failWrite) throw new Error("Storage blocked"); raw = value; }, remove() { raw = null; } };
  const transport = async (body: Record<string, unknown>): Promise<unknown> => {
    requests.push(body);
    if (body.action === "scope") return { scope: "original-synthetic-scope" };
    if (body.action === "quote") return { quote };
    if (body.action === "resolve") { if (resolveFailure) throw new Error("Lost resolve response"); return resolveResult; }
    if (body.action === "replacement_quote") { if (quoteFailure) throw new Error("Lost replacement quote response"); return { quote: nextQuote }; }
    if (body.action === "recover") return committed ? { confirmed: true, receipt: { ...receipt, quote_id: nextQuote.quote_id } } : { confirmed: false };
    throw new Error("Lost create response");
  };
  const client = checkoutClient(transport, storage, value => consumed.push(value));
  return { client, storage, transport, requests, consumed, raw: () => raw,
    configure(options: { failWrite?: boolean; quoteFailure?: boolean; resolveFailure?: boolean; committed?: boolean; resolveResult?: unknown }) {
      if (options.failWrite !== undefined) failWrite = options.failWrite;
      if (options.quoteFailure !== undefined) quoteFailure = options.quoteFailure;
      if (options.resolveFailure !== undefined) resolveFailure = options.resolveFailure;
      if (options.committed !== undefined) committed = options.committed;
      if (options.resolveResult !== undefined) resolveResult = options.resolveResult;
    } };
}
async function uncertain(state: ReturnType<typeof setup>) {
  await state.client.quote(cart, "cod"); await assert.rejects(state.client.place(quote, customer));
}
test("committed resolution recovers original scope/key and clears only after confirmed receipt", async () => {
  const state = setup(); await uncertain(state); const key = state.client.pending()!.key;
  state.configure({ resolveResult: { resolution: { status: "committed", receipt } } });
  const result = await state.client.resolve(); assert.equal(result.status, "committed"); assert.equal(state.consumed.length, 1);
  assert.deepEqual(state.requests.at(-1), { action: "resolve", scope: "original-synthetic-scope", key, quote_id: quote.quote_id });
  await state.client.resolve(); assert.equal(state.consumed.length, 1);
  state.client.startAnother(); await state.client.quote(cart, "cod");
  assert.equal(state.requests.filter(body => body.action === "scope").length, 2);
});
test("confirmed retirement preserves cart, durably saves server replacement identity and survives reload", async () => {
  const state = setup(); await uncertain(state); await state.client.resolve();
  assert.equal(state.consumed.length, 0); assert.equal(state.client.pending(), undefined); assert.equal(state.client.restarting(), true);
  assert.ok(!state.raw()!.includes("recipient_name"));
  const reloaded = checkoutClient(state.transport, state.storage, value => state.consumed.push(value)); reloaded.restore();
  assert.equal(reloaded.restarting(), true); await reloaded.quote(cart, "cod");
  assert.equal(reloaded.pending()!.key, closed.replacement_key);
  assert.equal(reloaded.pending()!.scope, "renewed-synthetic-scope");
  await assert.rejects(reloaded.place(nextQuote, customer));
  assert.equal(state.requests.at(-1)!.key, closed.replacement_key);
  state.configure({ committed: true }); await reloaded.recover(); assert.equal(state.consumed.length, 1);
});
test("lost resolution response keeps old identity; repeated resolution never invents replacement keys", async () => {
  const state = setup(); await uncertain(state); const saved = state.raw();
  state.configure({ resolveFailure: true }); await assert.rejects(state.client.resolve());
  assert.equal(state.raw(), saved); assert.equal(state.consumed.length, 0);
  await assert.rejects(state.client.quote(cart, "cod"));
  state.configure({ resolveFailure: false }); await state.client.resolve();
  await state.client.quote(cart, "cod"); assert.equal(state.client.pending()!.key, closed.replacement_key);
});
test("failed durable write after retirement keeps saved original request and blocks a new quote", async () => {
  const state = setup(); await uncertain(state); const saved = state.raw();
  state.configure({ failWrite: true }); await assert.rejects(state.client.resolve());
  assert.equal(state.raw(), saved); assert.ok(state.client.pending()); assert.equal(state.client.restarting(), false);
  await assert.rejects(state.client.quote(cart, "cod")); assert.equal(state.consumed.length, 0);
  state.configure({ failWrite: false }); await state.client.resolve(); assert.equal(state.client.restarting(), true);
});
test("malformed, wrong-quote, reused-key and private-field resolutions never release saved intent", async () => {
  for (const invalid of [null, { confirmed: false }, { ...closed, quote_id: id(1290) }, { ...closed, notification_recipients: ["PRIVATE CANARY"] }, { status: "committed", receipt: { ...receipt, quote_id: id(1290) } }]) {
    const state = setup(); await uncertain(state); const saved = state.raw();
    state.configure({ resolveResult: { resolution: invalid, scope: "s" } });
    await assert.rejects(state.client.resolve()); assert.equal(state.raw(), saved); assert.equal(state.consumed.length, 0);
  }
  const reused = setup(); await uncertain(reused);
  reused.configure({ resolveResult: { resolution: { ...closed, replacement_key: reused.client.pending()!.key }, scope: "s" } });
  await assert.rejects(reused.client.resolve()); assert.ok(reused.client.pending());
});
test("lost replacement-quote response keeps durable restart and reuses its binding after reload", async () => {
  const state = setup(); await uncertain(state); await state.client.resolve(); state.configure({ quoteFailure: true });
  await assert.rejects(state.client.quote(cart, "cod")); const saved = state.raw(); assert.equal(state.consumed.length, 0);
  const reloaded = checkoutClient(state.transport, state.storage, () => {}); reloaded.restore(); state.configure({ quoteFailure: false });
  await reloaded.quote(cart, "cod");
  const requests = state.requests.filter(body => body.action === "replacement_quote");
  assert.equal(requests.length, 2); assert.equal(requests[0].resolution_id, requests[1].resolution_id);
  assert.ok(saved!.includes(closed.replacement_key)); assert.equal(reloaded.pending()!.key, closed.replacement_key);
});
test("an in-flight resolution cannot release identity or allow a second action before its confirmed result", async () => {
  const state = setup(); let finish!: (value: unknown) => void;
  const held = new Promise(resolve => { finish = resolve; });
  const client = checkoutClient(body => body.action === "resolve" ? held : state.transport(body), state.storage, value => state.consumed.push(value));
  await client.quote(cart, "cod"); await assert.rejects(client.place(quote, customer)); const saved = state.raw();
  const resolving = client.resolve();
  await assert.rejects(client.quote(cart, "cod"), /already in progress/); await assert.rejects(client.resolve(), /already in progress/);
  assert.equal(state.raw(), saved); assert.equal(client.restarting(), false); assert.equal(state.consumed.length, 0);
  finish({ resolution: closed, scope: "renewed" }); await resolving; assert.equal(client.restarting(), true); assert.equal(state.consumed.length, 0);
});
test("another-tab quote mismatch stays recoverable and cannot submit the wrong bag", async () => {
  const state = setup(); await uncertain(state); await state.client.resolve();
  await assert.rejects(state.client.quote([{ id: 2, size: "S", quantity: 2 }], "cod"), /different bag/);
  assert.equal(state.client.pending()!.quoteMismatch, true);
  await assert.rejects(state.client.place(nextQuote, customer), /Resolve/);
  const restored = checkoutClient(state.transport, state.storage, () => {}); restored.restore();
  assert.equal(restored.pending()!.quoteMismatch, true); assert.equal(state.consumed.length, 0);
});
test("resolution DTO rejects accidental customer/private payloads and malformed replacements", () => {
  assert.equal(isIntentResolution(closed), true); assert.equal(isIntentResolution({ status: "committed", receipt }), true);
  for (const invalid of [{ ...closed, customer }, { ...closed, replacement_quote: { ...nextQuote, wallet_account_number: "PRIVATE CANARY" } },
    { ...closed, replacement_quote: quote }, { ...closed, replacement_key: "invalid" }]) assert.equal(isIntentResolution(invalid), false);
});
async function backend(enabled = false, time?: { now: number }) {
  const signer = await scopeSigner("synthetic-scope-secret-at-least-thirty-two-characters", () => time?.now ?? Date.now());
  const token = await signer.issue(); const calls: { name: string; args: Record<string, unknown> }[] = [];
  let resolved: unknown = closed, proof: unknown = closed;
  const handler = checkoutHandler({ enabled, origins: new Set(["http://localhost:43210"]), signer, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "checkout_admit") return true;
    if (name === "checkout_resolve") return resolved;
    if (name === "checkout_resolution") return proof;
    if (name === "checkout_recover") return receipt;
    if (name === "checkout_replacement_quote") return nextQuote;
    throw new Error("Unexpected RPC");
  } });
  const request = (body: Record<string, unknown>) => handler(new Request("http://localhost:43211", { method: "POST", headers: { Origin: "http://localhost:43210", "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { signer, token, calls, request, setResult(value: unknown, confirmed: unknown = value) { resolved = value; proof = confirmed; } };
}
test("backend allows recovery with intake off, confirms retirement in a separate transaction and renews same scope", async () => {
  const state = await backend(); const response = await state.request({ action: "resolve", scope: state.token, key: id(1210), quote_id: quote.quote_id });
  assert.equal(response.status, 200); const body = await response.json();
  assert.deepEqual(body.resolution, closed); assert.equal(await state.signer.verify(body.scope), await state.signer.verify(state.token));
  assert.deepEqual(state.calls.map(value => value.name), ["checkout_admit", "checkout_resolve", "checkout_resolution"]);
  assert.equal((await state.request({ action: "replacement_quote", scope: body.scope, resolution_id: closed.resolution_id, cart, method: "cod" })).status, 503);
});
test("backend never authorizes restart from an absent, rolled-back or mismatched retirement proof", async () => {
  for (const proof of [null, { ...closed, resolution_id: id(1298) }, { ...closed, replacement_key: id(1297) }, { status: "committed", receipt }]) {
    const state = await backend(); state.setResult(closed, proof);
    const response = await state.request({ action: "resolve", scope: state.token, key: id(1210), quote_id: quote.quote_id });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "resolution_unconfirmed" });
  }
});
test("backend committed resolution returns receipt without issuing a restart capability", async () => {
  const state = await backend(); state.setResult({ status: "committed", receipt });
  const response = await state.request({ action: "resolve", scope: state.token, key: id(1210), quote_id: quote.quote_id });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { resolution: { status: "committed", receipt } });
});
test("expired signed scope has a bounded recovery-only window and cannot place orders or quote", async () => {
  const time = { now: 1793610000000 }; const state = await backend(true, time);
  const originalScope = await state.signer.verify(state.token); time.now += 8 * 86400000;
  await assert.rejects(state.signer.verify(state.token)); assert.equal(await state.signer.verify(state.token, true), originalScope);
  assert.equal((await state.request({ action: "quote", scope: state.token, cart, method: "cod" })).status, 401);
  const resolved = await state.request({ action: "resolve", scope: state.token, key: id(1210), quote_id: quote.quote_id });
  assert.equal(resolved.status, 200); const body = await resolved.json(); assert.equal(await state.signer.verify(body.scope), originalScope);
  assert.equal((await state.request({ action: "recover", scope: state.token, key: id(1210) })).status, 200);
  const forged = state.token.slice(0, -1) + (state.token.endsWith("0") ? "1" : "0"); await assert.rejects(state.signer.verify(forged, true));
  time.now += 23 * 86400000; await assert.rejects(state.signer.verify(state.token, true));
});
test("backend replacement quote uses a scoped resolution and rejects extra claim fields", async () => {
  const state = await backend(true);
  const body = { action: "replacement_quote", scope: state.token, resolution_id: closed.resolution_id, cart, method: "cod" };
  const response = await state.request(body); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { quote: nextQuote });
  assert.equal((await state.request({ ...body, payment_status: "paid" })).status, 400);
});
