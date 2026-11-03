import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import type { AccessPort } from "../src/features/auth/model/access.ts";
import { orderReader, reportColumns } from "../src/features/orders/model/order-reader.ts";
import { orderReport, orderCustomer, orderItem, orderHistory, formatPKR, minorUnits, resultPage, OrderAccessDenied, orderFailure } from "../src/features/orders/model/orders.ts";

const id = "00000000-0000-4000-8000-000000000611";
const userId = "00000000-0000-4000-8000-000000000601";
const timestamp = "2026-10-31T12:00:00Z";
function report() { return { id, created_at: timestamp, updated_at: timestamp, currency: "PKR", subtotal_minor: "20000", shipping_minor: "0", tax_minor: "0", discount_minor: "0", total_minor: "20000", fulfillment_status: "pending", payment_status: "unpaid", status_revision: "1" }; }
function customer() { return { order_id: id, recipient_name: "Synthetic recipient", phone: "0000000000", email: "fixture@example.invalid", address_line1: "Synthetic address", address_line2: null, city: "Fixture city", region: null, postal_code: null, country_code: "PK" }; }
function item() { return { order_id: id, line_number: 1, product_id: 0, selected_size: "M", product_name: "Original fixture", unit_price_minor: "10000", quantity: 2, line_total_minor: "20000" }; }
function history() { return { order_id: id, revision: "1", status_kind: "fulfillment", from_status: null, to_status: "pending", changed_at: timestamp, actor_user_id: null, actor_db_role: "postgres", actor_session_role: "postgres" }; }
function setup() {
  const requests: { url: URL; method: string; bearer: string | null }[] = [];
  const port: AccessPort = { identity: async () => ({ id: userId, email: "fixture@example.invalid", expiresAt: Date.now() + 60_000 }), role: async () => ({ user_id: userId, role: "owner" }), signOut: async () => {} };
  let respond = (url: URL): Response => {
    const table = url.pathname.split("/").at(-1);
    const rows = table === "orders" ? [report()] : table === "order_customer_details" ? [customer()] : table === "order_items" ? [item()] : [history()];
    return Response.json(rows);
  };
  const client = createClient<Database>("https://fixture.supabase.co", "sb_publishable_fixture", {
    accessToken: async () => "isolated-session-token",
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push({ url, method: init?.method ?? "GET", bearer: new Headers(init?.headers).get("authorization") }); return respond(url);
    } },
  });
  return { reader: orderReader(client, port), port, requests, respond: (fn: typeof respond) => { respond = fn; } };
}
test("report mapping drops unexpected private fields and formats exact bigint paisa", () => {
  const mapped = orderReport({ ...report(), phone: "PRIVATE CANARY", order_customer_details: customer() });
  assert.deepEqual(mapped, report()); assert.ok(!JSON.stringify(mapped).includes("PRIVATE"));
  assert.equal(formatPKR("9223372036854775807"), "PKR 92,233,720,368,547,758.07");
  assert.equal(formatPKR("29"), "PKR 0.29");
  for (const value of [29, 9007199254740993, "-1", "1.5", "01", "9223372036854775808", null]) assert.throws(() => minorUnits(value));
});
test("invalid report statuses, totals, dates and revisions fail closed", () => {
  for (const patch of [{ total_minor: "1" }, { currency: "USD" }, { fulfillment_status: "unknown" }, { payment_status: "settled" }, { created_at: "bad" }, { status_revision: "0" }, { discount_minor: "20001" }]) assert.throws(() => orderReport({ ...report(), ...patch }));
  assert.throws(() => resultPage(null, orderReport));
});
test("Owner private mappings validate the order identity, snapshots and initial history", () => {
  assert.deepEqual(orderCustomer(customer(), id), customer()); assert.deepEqual(orderItem(item(), id), item()); assert.deepEqual(orderHistory(history(), id), history());
  assert.throws(() => orderCustomer({ ...customer(), order_id: userId }, id));
  assert.throws(() => orderItem({ ...item(), line_total_minor: "1" }, id));
  assert.throws(() => orderItem({ ...item(), quantity: 0 }, id));
  assert.throws(() => orderHistory({ ...history(), from_status: "packing" }, id));
  assert.throws(() => orderHistory({ ...history(), status_kind: "payment", to_status: "packing" }, id));
});
test("Partner uses only the explicit orders projection and the session bearer, without private joins", async () => {
  const s = setup(); s.port.role = async () => ({ user_id: userId, role: "partner" });
  const result = await s.reader.list("partner", { fulfillment: "all", payment: "all" }, 0);
  assert.equal(result.rows.length, 1); assert.equal(result.hasNext, false); assert.equal(s.requests.length, 1);
  const request = s.requests[0]; assert.equal(request.method, "GET"); assert.equal(request.bearer, "Bearer isolated-session-token");
  assert.equal(request.url.pathname, "/rest/v1/orders"); assert.equal(request.url.searchParams.get("select"), reportColumns);
  assert.ok(!reportColumns.includes("*")); assert.ok(!reportColumns.includes("("));
  await assert.rejects(s.reader.details("partner", id), OrderAccessDenied); assert.equal(s.requests.length, 1);
});
test("status filters and deterministic pagination use 20 rows plus a lookahead", async () => {
  const s = setup(); s.respond(() => Response.json(Array.from({ length: 21 }, (_, n) => ({ ...report(), id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` }))));
  const result = await s.reader.list("owner", { fulfillment: "packing", payment: "paid" }, 2);
  assert.equal(result.rows.length, 20); assert.equal(result.hasNext, true);
  const params = s.requests[0].url.searchParams;
  assert.equal(params.get("offset"), "40"); assert.equal(params.get("limit"), "21");
  assert.equal(params.get("order"), "created_at.desc,id.desc"); assert.equal(params.get("fulfillment_status"), "eq.packing"); assert.equal(params.get("payment_status"), "eq.paid");
});
test("Owner detail reads are scoped, explicit and independently paginated", async () => {
  const s = setup(); const result = await s.reader.details("owner", id, 1, 2);
  assert.equal(result.customer.recipient_name, "Synthetic recipient"); assert.equal(s.requests.length, 4);
  for (const { url, method } of s.requests) { assert.equal(method, "GET"); assert.equal(url.searchParams.get(url.pathname.endsWith("/orders") ? "id" : "order_id"), `eq.${id}`); assert.ok(!url.searchParams.get("select")?.includes("*")); }
  const events = s.requests.find(r => r.url.pathname.endsWith("/order_status_history"))!.url.searchParams;
  assert.equal(events.get("offset"), "40"); assert.equal(events.get("order"), "revision.desc,status_kind.asc");
  const items = s.requests.find(r => r.url.pathname.endsWith("/order_items"))!.url.searchParams;
  assert.equal(items.get("offset"), "20"); assert.ok(items.get("select")?.includes("unit_price_minor::text"));
});
test("signed-out, unassigned, expired, and demoted identities cannot initiate private requests", async () => {
  for (const mode of ["signed-out", "unassigned", "expired", "demoted"] as const) {
    const s = setup();
    if (mode === "signed-out") s.port.identity = async () => null;
    if (mode === "unassigned") s.port.role = async () => null;
    if (mode === "expired") s.port.identity = async () => ({ id: userId, email: "fixture@example.invalid", expiresAt: 0 });
    if (mode === "demoted") s.port.role = async () => ({ user_id: userId, role: "partner" });
    await assert.rejects(s.reader.details("owner", id), OrderAccessDenied); assert.equal(s.requests.length, 0);
    if (mode !== "demoted") { await assert.rejects(s.reader.list("owner", { fulfillment: "all", payment: "all" }, 0), OrderAccessDenied); assert.equal(s.requests.length, 0); }
  }
});
test("role revocation and identity changes during reads discard completed data", async () => {
  for (const mode of ["demotion", "identity"] as const) {
    const s = setup(); let calls = 0;
    if (mode === "demotion") s.port.role = async () => ({ user_id: userId, role: ++calls === 1 ? "owner" : "partner" });
    else s.port.identity = async () => ({ id: ++calls === 1 ? userId : id, email: "fixture@example.invalid", expiresAt: Date.now() + 60_000 });
    await assert.rejects(s.reader.details("owner", id), OrderAccessDenied);
  }
});
test("successful empty responses stay distinct from provider, permission and malformed-data errors", async () => {
  const s = setup(); s.respond(() => Response.json([]));
  assert.deepEqual(await s.reader.list("owner", { fulfillment: "all", payment: "all" }, 0), { rows: [], hasNext: false });
  for (const [status, code] of [[403, "42501"], [500, "XX000"], [404, "42P01"]] as const) {
    s.respond(() => Response.json({ code, message: "private provider details" }, { status }));
    await assert.rejects(s.reader.list("owner", { fulfillment: "all", payment: "all" }, 0), error => {
      const result = orderFailure(error); assert.equal(result.denied, status === 403); assert.ok(!result.message.includes("private provider")); return true;
    });
  }
  s.respond(() => Response.json([{}])); await assert.rejects(s.reader.list("owner", { fulfillment: "all", payment: "all" }, 0));
});
test("missing or failed private data never becomes a partially successful detail view", async () => {
  const s = setup(); s.respond(url => Response.json(url.pathname.endsWith("/orders") ? [report()] : []));
  await assert.rejects(s.reader.details("owner", id), OrderAccessDenied);
  s.respond(() => Response.json({ code: "42501", message: "fixture denial" }, { status: 403 })); await assert.rejects(s.reader.details("owner", id));
});
test("invalid pagination, filters and order IDs cannot trigger requests", async () => {
  const s = setup();
  for (const page of [-1, 0.5, 100001, Infinity]) await assert.rejects(s.reader.list("owner", { fulfillment: "all", payment: "all" }, page));
  await assert.rejects(s.reader.list("owner", { fulfillment: "invented", payment: "all" } as never, 0));
  await assert.rejects(s.reader.details("owner", "invalid-id")); assert.equal(s.requests.length, 0);
});
test("cancelled requests do not fetch data or return obsolete results", async () => {
  const s = setup(); const cancel = new AbortController(); cancel.abort();
  await assert.rejects(s.reader.list("owner", { fulfillment: "all", payment: "all" }, 0, cancel.signal)); assert.equal(s.requests.length, 0);
});
