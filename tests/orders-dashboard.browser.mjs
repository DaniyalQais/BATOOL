// Isolated UI fixtures only. All non-local requests are intercepted or aborted.
// Provide an installed Playwright module and serve out/ on a loopback address.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const base = new URL(process.env.BATOOL_UI_BASE_URL ?? "http://127.0.0.1:8765");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("UI fixture tests require a loopback server.");
if (!process.env.BATOOL_PLAYWRIGHT_MODULE) throw new Error("Set BATOOL_PLAYWRIGHT_MODULE to an installed Playwright index.mjs.");
const { chromium } = await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true });
const userId = "00000000-0000-4000-8000-000000000601";
const id = n => `00000000-0000-4000-8000-${String(1000 + n).padStart(12, "0")}`;
const timestamp = "2026-10-31T12:00:00Z";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "ui-fixture@example.invalid", email_confirmed_at: timestamp,
  created_at: timestamp, updated_at: timestamp, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, is_anonymous: false };
function report(n = 0) { return { id: id(n), created_at: timestamp, updated_at: timestamp, currency: "PKR", subtotal_minor: "20000", shipping_minor: "0", tax_minor: "0", discount_minor: "0", total_minor: "20000", fulfillment_status: "pending", payment_status: "unpaid", status_revision: "1" }; }
function products() { return [0, 2, 3, 7, 8, 11].map(n => ({ id: n, slug: `fixture-${n}`, name: `Fixture product ${n}`, description: "Synthetic product", price_minor: 10000, currency: "PKR", active: true, is_demo: true, image_note: null, edit_revision: 1,
  main_image_path: null, main_image_width: null, main_image_height: null, image_alt: null,
  product_variants: ["S", "M", "L", "XL"].map(size => ({ product_id: n, size, stock_quantity: null })) })); }
let passed = 0;
async function scenario(name, options, check) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const requests = []; const errors = [];
  const state = { role: "partner", mode: "rows", delay: 0, ...options };
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, exp: expiry, role: "authenticated" })).toString("base64url")}.isolated-fixture`;
  await context.addInitScript(({ token, expiry, user }) => {
    localStorage.setItem("batool-admin-auth", JSON.stringify({ access_token: token, refresh_token: "isolated-fixture-refresh", expires_at: expiry, expires_in: 3600, token_type: "bearer", user }));
  }, { token, expiry, user });
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === base.origin) return route.continue();
    const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/user") return respond(user);
    if (url.pathname === "/auth/v1/logout") return respond({});
    if (!url.pathname.startsWith("/rest/v1/")) return route.abort();
    assert.equal(request.method(), "GET", "All fixture Data API requests must be read-only");
    const table = url.pathname.split("/").at(-1); requests.push({ table, params: url.searchParams });
    if (table === "dashboard_roles") return respond(state.role ? [{ user_id: userId, role: state.role }] : []);
    if (table === "products") return respond(products());
    // This suite isolates orders; settings readiness has its own UI suite.
    if (["business_settings", "order_notification_settings"].includes(table)) return respond({ code: "PGRST205", message: "Settings not configured in order fixtures" }, 404);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.mode === "error") return respond({ code: "XX000", message: "PRIVATE PROVIDER ERROR" }, 500);
    if (state.mode === "denied") return respond({ code: "42501", message: "PRIVATE PROVIDER ERROR" }, 403);
    const orderId = url.searchParams.get("order_id")?.slice(3) ?? url.searchParams.get("id")?.slice(3) ?? id(0);
    if (table === "orders") {
      if (state.mode === "empty" || url.searchParams.get("payment_status") === "eq.paid") return respond([]);
      if (url.searchParams.has("id")) return respond([{ ...report(), id: orderId }]);
      return respond(url.searchParams.get("offset") === "20" ? [report(20)] : Array.from({ length: 21 }, (_, n) => report(n)));
    }
    if (table === "order_customer_details") return respond([{ order_id: orderId, recipient_name: "PRIVATE UI CANARY", phone: "0000000000", email: "fixture@example.invalid", address_line1: "Synthetic address", address_line2: null, city: "Fixture city", region: null, postal_code: null, country_code: "PK" }]);
    if (table === "order_items") return respond([{ order_id: orderId, line_number: 1, product_id: 0, selected_size: "M", product_name: "Snapshot fixture", unit_price_minor: "10000", quantity: 2, line_total_minor: "20000" }]);
    if (table === "order_status_history") return respond(["fulfillment", "payment"].map(kind => ({ order_id: orderId, revision: "1", status_kind: kind, from_status: null, to_status: kind === "payment" ? "unpaid" : "pending", changed_at: timestamp, actor_user_id: null, actor_db_role: "postgres", actor_session_role: "postgres" })));
    throw new Error(`Unexpected fixture table: ${table}`);
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(new URL("/admin/", base).href);
    await check({ page, requests, state });
    assert.deepEqual(errors, []); passed++; console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: ".tmp/orders-ui-failure.png", fullPage: true });
    throw error;
  } finally { await context.close(); }
}
try {
  await scenario("Partner report-only view, pagination, filter reset, mobile layout", {}, async ({ page, requests }) => {
    const orders = page.getByRole("region", { name: "Orders", exact: true });
    await orders.getByRole("heading", { name: `Order ${id(0)}`, exact: true }).waitFor();
    assert.equal(await orders.getByRole("button", { name: "View order details" }).count(), 0);
    await orders.getByRole("button", { name: "Next orders", exact: true }).click();
    await orders.getByRole("heading", { name: `Order ${id(20)}`, exact: true }).waitFor();
    await orders.getByLabel("Payment status", { exact: true }).selectOption("paid");
    await orders.getByText("No orders match these filters.", { exact: true }).waitFor();
    assert.equal(await orders.getByRole("button", { name: "Previous orders", exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(requests.every(r => ["orders", "dashboard_roles"].includes(r.table)));
    for (const r of requests.filter(r => r.table === "orders")) { assert.ok(!r.params.get("select").includes("*")); assert.ok(!r.params.get("select").includes("(")); }
  });
  await scenario("Owner details, saved items, audit history and logout clearing", { role: "owner" }, async ({ page, requests }) => {
    await page.getByRole("button", { name: "View order details" }).first().click();
    await page.getByText("PRIVATE UI CANARY", { exact: true }).waitFor();
    await page.getByText("Snapshot fixture", { exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Status history", exact: true }).count(), 1);
    for (const table of ["order_customer_details", "order_items", "order_status_history"]) assert.ok(requests.some(r => r.table === table));
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("heading", { name: "Sign in required", exact: true }).waitFor();
    assert.equal(await page.getByText("PRIVATE UI CANARY", { exact: true }).count(), 0);
  });
  for (const mode of ["empty", "error", "denied"]) await scenario(`${mode} remains an honest distinct state`, { mode }, async ({ page }) => {
    if (mode === "empty") await page.getByText("No orders are available to this account. Order intake has not been enabled.", { exact: true }).waitFor();
    else {
      await page.getByRole("heading", { name: mode === "denied" ? "Order access denied" : "Orders unavailable", exact: true }).waitFor();
      assert.equal(await page.getByText("No orders are available to this account. Order intake has not been enabled.", { exact: true }).count(), 0);
      assert.ok(!(await page.locator("body").innerText()).includes("PRIVATE PROVIDER ERROR"));
      assert.equal(await page.getByText("PKR 0.00", { exact: true }).count(), 0);
    }
  });
  await scenario("Loading state and response discard after role removal", { role: "owner", delay: 900 }, async ({ page, state }) => {
    await page.getByText("Loading orders…", { exact: true }).waitFor();
    state.role = null;
    await page.getByRole("button", { name: "Check access again", exact: true }).click();
    await page.getByRole("heading", { name: "Access not assigned", exact: true }).waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.getByRole("region", { name: "Orders", exact: true }).count(), 0);
  });
  await scenario("Owner detail failure clears private content and retry recovers", { role: "owner" }, async ({ page, state }) => {
    await page.getByRole("button", { name: "View order details" }).first().click();
    await page.getByText("PRIVATE UI CANARY", { exact: true }).waitFor();
    state.mode = "error";
    await page.getByRole("button", { name: "Refresh orders", exact: true }).click();
    await page.getByRole("heading", { name: "Orders unavailable", exact: true }).waitFor();
    assert.equal(await page.getByText("PRIVATE UI CANARY", { exact: true }).count(), 0);
    state.mode = "rows";
    await page.getByRole("button", { name: "Retry order request", exact: true }).click();
    await page.getByRole("button", { name: "View order details" }).first().waitFor();
    state.mode = "denied";
    await page.getByRole("button", { name: "View order details" }).first().click();
    await page.getByRole("heading", { name: "Order access denied", exact: true }).waitFor();
    assert.equal(await page.getByText("PRIVATE UI CANARY", { exact: true }).count(), 0);
  });
  await scenario("Pending Owner detail responses cannot appear after demotion", { role: "owner" }, async ({ page, state }) => {
    await page.getByRole("button", { name: "View order details" }).first().waitFor();
    state.delay = 900;
    await page.getByRole("button", { name: "View order details" }).first().click();
    await page.getByText("Loading permitted order details…", { exact: true }).waitFor();
    state.role = "partner";
    await page.getByRole("button", { name: "Check access again", exact: true }).click();
    await page.getByText("Read order references, dates, amounts and statuses below.", { exact: true }).waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.getByText("PRIVATE UI CANARY", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "View order details" }).count(), 0);
  });
  await scenario("Unassigned account never requests orders", { role: null }, async ({ page, requests }) => {
    await page.getByRole("heading", { name: "Access not assigned", exact: true }).waitFor();
    assert.ok(requests.every(r => r.table === "dashboard_roles"));
  });
  console.log(`PASS ${passed} isolated browser scenarios. Not actual Auth-session or database authorization tests.`);
} finally { await browser.close(); }
