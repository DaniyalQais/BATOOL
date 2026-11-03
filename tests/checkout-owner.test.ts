import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import type { AccessPort } from "../src/features/auth/model/access.ts";
import { orderReader } from "../src/features/orders/model/order-reader.ts";
const id = "00000000-0000-4000-8000-000000000981";
const subject = "00000000-0000-4000-8000-000000000982";
function setup() {
  const requests: URL[] = [];
  const port: AccessPort = { identity: async () => ({ id: subject, email: "fixture@example.invalid", expiresAt: Date.now() + 60000 }),
    role: async () => ({ user_id: subject, role: "owner" }), signOut: async () => {} };
  let after: (() => void) | undefined;
  const row = { order_id: id, payment_method: "cod", verification_mode: "cash_on_delivery", shipping_mode: "flat_rate", settings_revision: 2,
    payment_instructions: "Synthetic instructions", policy_text: "Synthetic policy", wallet_account_title: null, wallet_account_number: null };
  const client = createClient<Database>("https://fixture.supabase.co", "sb_publishable_fixture", {
    accessToken: async () => "synthetic-token", global: { fetch: async input => { requests.push(new URL(String(input))); after?.(); return Response.json([row]); } },
  });
  return { reader: orderReader(client, port), requests, port, row, after(value: () => void) { after = value; } };
}
test("Owner checkout-context read is explicit, order-scoped and checked again after response", async () => {
  const state = setup(); const result = await state.reader.checkoutContext("owner", id);
  assert.deepEqual(result, state.row); assert.equal(state.requests.length, 1);
  const url = state.requests[0]; assert.equal(url.pathname, "/rest/v1/order_checkout_details");
  assert.equal(url.searchParams.get("order_id"), `eq.${id}`); assert.ok(!url.searchParams.get("select")!.includes("*"));
  assert.ok(!url.search.includes("notification"));
});
test("Partner, unassigned, anonymous and demoted mock sessions cannot retrieve checkout context", async () => {
  const partner = setup(); await assert.rejects(partner.reader.checkoutContext("partner", id)); assert.equal(partner.requests.length, 0);
  for (const role of [null, "partner"] as const) {
    const state = setup(); state.port.role = async () => role ? { user_id: subject, role } : null;
    await assert.rejects(state.reader.checkoutContext("owner", id)); assert.equal(state.requests.length, 0);
  }
  const signedOut = setup(); signedOut.port.identity = async () => null;
  await assert.rejects(signedOut.reader.checkoutContext("owner", id)); assert.equal(signedOut.requests.length, 0);
  const demoted = setup(); demoted.after(() => { demoted.port.role = async () => ({ user_id: subject, role: "partner" }); });
  await assert.rejects(demoted.reader.checkoutContext("owner", id));
});
