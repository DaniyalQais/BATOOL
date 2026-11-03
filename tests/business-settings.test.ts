import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import type { AccessPort } from "../src/features/auth/model/access.ts";
import { businessSettings, emptyBusinessSettings, notificationSettings, settingsRecord, settingsFailure } from "../src/features/settings/model/settings.ts";
import { publicSettings, unpublishedPublicSettings } from "../src/features/settings/model/public-settings.ts";
import { ownerSettings } from "../src/features/settings/model/owner-settings.ts";
import { preparePublicSettings } from "../scripts/prepare-settings.ts";

const ownerId = "00000000-0000-4000-8000-000000000801";
const privateCanary = "PRIVATE-NOTIFICATION-CANARY@example.invalid";
const walletCanary = "PRIVATE WALLET CANARY";
function setup() {
  const requests: { url: URL; method: string; body: unknown; bearer: string | null }[] = [];
  const access: AccessPort = {
    identity: async () => ({ id: ownerId, email: "owner@example.invalid", expiresAt: Date.now() + 60_000 }),
    role: async () => ({ user_id: ownerId, role: "owner" }), signOut: async () => {},
  };
  let respond = (url: URL): Response => Response.json(url.pathname.endsWith("order_notification_settings")
    ? { revision: 1, settings: { emails: [privateCanary], whatsapp_numbers: [] } }
    : { revision: 1, settings: emptyBusinessSettings() });
  const client = createClient<Database>("https://fixture.supabase.co", "sb_publishable_fixture", {
    accessToken: async () => "isolated-owner-session",
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, bearer: new Headers(init?.headers).get("authorization") });
      return respond(url);
    } },
  });
  return { resources: ownerSettings(client, access), access, requests, respond(fn: typeof respond) { respond = fn; } };
}

test("business defaults contain unconfigured Pakistan shipping, no invented details, and explicit disabled flags", () => {
  const d = emptyBusinessSettings();
  assert.deepEqual(businessSettings(d), d);
  assert.equal(d.public_whatsapp, null); assert.equal(d.support_email, null);
  assert.equal(d.easypaisa_account_number, null); assert.equal(d.jazzcash_account_title, null);
  assert.equal(d.cod_enabled, false); assert.equal(d.easypaisa_enabled, false); assert.equal(d.jazzcash_enabled, false);
  assert.equal(d.policy_text, ""); assert.equal(d.policy_state, "draft"); assert.equal(d.payment_instructions_state, "draft");
  assert.deepEqual(d.shipping, { country_code: "PK", currency: "PKR", mode: "unconfigured", fee_minor: null });
});
test("business validation rejects missing/unknown keys, wrong types, contacts, invalid text and unsupported shipping", () => {
  for (const patch of [
    { extra: true }, { public_whatsapp: "03000000000" }, { public_whatsapp: "https://example.invalid" },
    { public_whatsapp: "920000000000\n" }, { support_email: "mailto:bad" }, { support_email: "a@example.invalid\nBcc:bad" },
    { cod_enabled: "true" }, { cod_enabled: null }, { easypaisa_enabled: true }, { jazzcash_enabled: true },
    { easypaisa_account_title: " " }, { jazzcash_account_title: "Bad\nTitle" }, { jazzcash_account_number: 3000000000 },
    { easypaisa_account_number: "PIN: 1234" }, { easypaisa_account_number: "123" },
    { policy_state: "approved" }, { payment_instructions_state: "approved" }, { policy_state: "published" },
    { policy_text: "x".repeat(8001) }, { policy_text: "Unsafe\x01" }, { payment_instructions: "   " },
    { shipping: { country_code: "PK", currency: "PKR", fee_minor: 1 } },
    { shipping: { country_code: "US", currency: "PKR", fee_minor: 0 } },
    { shipping: { country_code: "PK", currency: "USD", fee_minor: 0 } },
    { shipping: { country_code: "PK", currency: "PKR", fee_minor: 0, estimate: "tomorrow" } },
  ]) assert.throws(() => businessSettings({ ...emptyBusinessSettings(), ...patch }));
  const missing: Record<string, unknown> = { ...emptyBusinessSettings() }; delete missing.cod_enabled;
  for (const value of [missing, null, [], {}, "text"]) assert.throws(() => businessSettings(value));
});
test("wallet titles and digit strings are required when enabled, leading zeroes survive, and approval is explicit", () => {
  const d = businessSettings({ ...emptyBusinessSettings(), easypaisa_enabled: true, easypaisa_account_title: walletCanary,
    easypaisa_account_number: "00000000000", jazzcash_enabled: true, jazzcash_account_title: walletCanary,
    jazzcash_account_number: "00000000001", policy_text: "Synthetic approved text\nSecond line", policy_state: "approved" });
  assert.equal(d.easypaisa_account_number, "00000000000"); assert.equal(d.policy_state, "approved");
  assert.deepEqual(unpublishedPublicSettings().available_payment_methods, []);
});
test("private recipient validation bounds channels, rejects duplicates and never supplies a public-contact fallback", () => {
  assert.deepEqual(notificationSettings({ emails: [], whatsapp_numbers: [] }), { emails: [], whatsapp_numbers: [] });
  assert.deepEqual(notificationSettings({ emails: [privateCanary], whatsapp_numbers: ["920000000001"] }).emails, [privateCanary]);
  for (const value of [
    { emails: null, whatsapp_numbers: [] }, { emails: [null], whatsapp_numbers: [] },
    { emails: ["bad"], whatsapp_numbers: [] }, { emails: [], whatsapp_numbers: ["03000000000"] },
    { emails: ["a@example.invalid", "A@example.invalid"], whatsapp_numbers: [] },
    { emails: Array.from({ length: 11 }, (_, n) => `a${n}@example.invalid`), whatsapp_numbers: [] },
    { emails: [], whatsapp_numbers: ["920000000001", "920000000001"] },
    { emails: [], whatsapp_numbers: [], public: true },
  ]) assert.throws(() => notificationSettings(value));
});
test("public projection allowlists keys, strips nested notification/wallet/draft canaries, and fails closed on payment gates", () => {
  const mapped = publicSettings({ ...unpublishedPublicSettings(), support_email: "public@example.invalid",
    notifications: { emails: [privateCanary] }, easypaisa_account_title: walletCanary, policy_state: "DRAFT CANARY" });
  assert.equal(mapped.support_email, "public@example.invalid"); assert.equal(Object.keys(mapped).length, 9);
  assert.doesNotMatch(JSON.stringify(mapped), /PRIVATE|CANARY|notifications|account_title/);
  for (const patch of [{ checkout_enabled: true }, { available_payment_methods: ["cod"] }, { policy_text: "" }, { currency: "USD" }]) {
    assert.throws(() => publicSettings({ ...unpublishedPublicSettings(), ...patch }));
  }
});
test("Owner reads distinct tables with only revision/settings columns and authenticated bearer", async () => {
  const s = setup();
  await s.resources.business.load(); await s.resources.notifications.load();
  assert.equal(s.requests.length, 2);
  assert.ok(s.requests[0].url.pathname.endsWith("/business_settings"));
  assert.ok(s.requests[1].url.pathname.endsWith("/order_notification_settings"));
  for (const request of s.requests) {
    assert.equal(request.method, "GET"); assert.equal(request.url.searchParams.get("select"), "revision,settings");
    assert.equal(request.bearer, "Bearer isolated-owner-session");
  }
});
test("Partner, unassigned, missing/expired sessions cannot query or save settings through the adapter", async () => {
  for (const role of ["partner", null]) {
    const s = setup(); s.access.role = async () => role ? { user_id: ownerId, role } : null;
    await assert.rejects(() => s.resources.business.load());
    await assert.rejects(() => s.resources.notifications.load());
    await assert.rejects(() => s.resources.business.save({ revision: 1, settings: emptyBusinessSettings() }, emptyBusinessSettings()));
    await assert.rejects(() => s.resources.notifications.save({ revision: 1, settings: { emails: [], whatsapp_numbers: [] } }, { emails: [], whatsapp_numbers: [] }));
    assert.equal(s.requests.length, 0);
  }
  for (const identity of [null, { id: ownerId, email: "owner@example.invalid", expiresAt: 0 }]) {
    const s = setup(); s.access.identity = async () => identity;
    await assert.rejects(() => s.resources.business.load()); assert.equal(s.requests.length, 0);
  }
});
test("Owner save uses atomic RPC and expected revision; no private recipients in business payload", async () => {
  const s = setup(); const d = emptyBusinessSettings();
  s.respond(() => Response.json({ revision: 8, settings: d }));
  const saved = await s.resources.business.save({ revision: 7, settings: d }, d);
  assert.equal(saved.revision, 8);
  assert.equal(s.requests[0].url.pathname, "/rest/v1/rpc/owner_save_business_settings");
  assert.equal(s.requests[0].method, "POST");
  assert.deepEqual(s.requests[0].body, { p_expected_revision: 7, p_settings: d });
  assert.doesNotMatch(JSON.stringify(s.requests[0].body), /recipients|whatsapp_numbers|emails/);
  s.respond(() => Response.json({ revision: 2, settings: { emails: [privateCanary], whatsapp_numbers: [] } }));
  await s.resources.notifications.save({ revision: 1, settings: { emails: [], whatsapp_numbers: [] } }, { emails: [privateCanary], whatsapp_numbers: [] });
  assert.equal(s.requests[1].url.pathname, "/rest/v1/rpc/owner_save_notification_settings");
});
test("invalid drafts are blocked before requests, conflicts and invalid success bodies require reload", async () => {
  const s = setup(); const d = emptyBusinessSettings();
  await assert.rejects(() => s.resources.business.save({ revision: 1, settings: d }, { ...d, easypaisa_enabled: true }));
  assert.equal(s.requests.length, 0);
  s.respond(() => Response.json({ code: "PT409", message: "Synthetic conflict" }, { status: 409 }));
  await assert.rejects(() => s.resources.business.save({ revision: 1, settings: d }, d), (error: unknown) => settingsFailure(error).reload);
  for (const revision of [1, 3, 0, 1.5]) {
    s.respond(() => Response.json({ revision, settings: d }));
    await assert.rejects(() => s.resources.business.save({ revision: 1, settings: d }, d));
  }
  assert.equal(settingsFailure({ code: "PT409" }).reload, true);
  assert.equal(settingsFailure({ code: "42501" }).reload, true);
  assert.equal(settingsFailure(new Error(privateCanary)).message.includes(privateCanary), false);
  assert.equal(settingsFailure({ code: "22023" }).reload, false);
  assert.throws(() => settingsRecord({ revision: 0, settings: d }, businessSettings));
});
test("identity changes or demotion during a response cannot reveal loaded private data", async () => {
  const s = setup(); let count = 0;
  s.access.role = async () => ({ user_id: ownerId, role: ++count === 1 ? "owner" : "partner" });
  await assert.rejects(() => s.resources.notifications.load());
  assert.equal(s.requests.length, 1);
});
test("build preparation calls only public RPC, strips canaries and invalidates stale snapshots on failure", async () => {
  const original = globalThis.fetch;
  const file = new URL("../src/features/settings/model/generated/public-settings.ts", import.meta.url);
  const env = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
  const requests: string[] = [];
  try {
    globalThis.fetch = async input => {
      requests.push(String(input));
      return Response.json({ ...unpublishedPublicSettings(), support_email: "public@example.invalid", private_recipients: [privateCanary], wallet_title: walletCanary });
    };
    await preparePublicSettings(env);
    assert.equal(requests.length, 1); assert.ok(requests[0].endsWith("/rest/v1/rpc/get_public_business_settings"));
    assert.match(readFileSync(file, "utf8"), /public@example.invalid/);
    assert.doesNotMatch(readFileSync(file, "utf8"), /PRIVATE|CANARY|wallet_title|private_recipients/);
    globalThis.fetch = async () => Response.json({ message: privateCanary }, { status: 403 });
    await assert.rejects(() => preparePublicSettings(env), /Public settings load failed/);
    assert.doesNotMatch(readFileSync(file, "utf8"), /public@example.invalid|PRIVATE|CANARY/);
    await assert.rejects(() => preparePublicSettings({}), /configuration missing/);
  } finally { globalThis.fetch = original; await preparePublicSettings({ CATALOG_SOURCE: "demo" }); }
});
test("checkout source has no submission/payment/notification controls, including query-string preview or admin flags", () => {
  const source = readFileSync(new URL("../src/app/checkout/page.tsx", import.meta.url), "utf8");
  assert.match(source, /Checkout is unavailable/);
  assert.doesNotMatch(source, /window\.open|<form|type="submit"|\.rpc\(|getStoreOwnerWhatsAppUrl|\.get\("admin"\)/);
});
