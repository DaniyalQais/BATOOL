// Isolated UI test. Every non-loopback request is intercepted; no real accounts.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
if (!process.env.BATOOL_PLAYWRIGHT_MODULE) throw new Error("Set BATOOL_PLAYWRIGHT_MODULE to an installed Playwright index.mjs.");
const { chromium } = await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
const root = path.resolve("out");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webp": "image/webp", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = path.resolve(root, `.${pathname}`, ...(pathname.endsWith("/") ? ["index.html"] : []));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    response.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const userId = "00000000-0000-4000-8000-000000000801";
const timestamp = "2026-11-02T12:00:00Z";
const user = { id: userId, email: "settings-ui@example.invalid", is_anonymous: false, app_metadata: { provider: "email" }, user_metadata: {}, aud: "authenticated", created_at: timestamp };
const empty = () => ({ public_whatsapp: null, support_email: null, cod_enabled: false,
  easypaisa_enabled: false, easypaisa_account_title: null, easypaisa_account_number: null,
  jazzcash_enabled: false, jazzcash_account_title: null, jazzcash_account_number: null,
  shipping: { country_code: "PK", currency: "PKR", mode: "unconfigured", fee_minor: null },
  payment_instructions: "", payment_instructions_state: "draft", policy_text: "", policy_state: "draft" });
const errors = []; const unexpected = []; const saves = []; const settingsReads = [];
let business = { revision: 1, settings: empty() };
let notifications = { revision: 1, settings: { emails: ["PRIVATE-UI-CANARY@example.invalid"], whatsapp_numbers: [] } };
let role = "owner"; let conflict = false; let holdSave;
let browser;
let inspectedPage;
try {
  browser = await chromium.launch({ headless: true });
  async function context(signedIn) {
    const result = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (signedIn) {
      const expires_at = Math.floor(Date.now() / 1000) + 3600;
      const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: expires_at })).toString("base64url")}.synthetic-settings-ui`;
      await result.addInitScript(({ token, user, expires_at }) => localStorage.setItem("batool-admin-auth", JSON.stringify({ access_token: token, refresh_token: "synthetic-settings-refresh", expires_at, token_type: "bearer", user })), { token, user, expires_at });
    }
    await result.route("**/*", async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === base) return route.continue();
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/auth/v1/user") return json(user);
      if (url.pathname === "/auth/v1/logout") return json({});
      if (url.pathname === "/rest/v1/dashboard_roles") return json([{ user_id: userId, role }]);
      if (url.pathname === "/rest/v1/orders" || url.pathname === "/rest/v1/products") return json([]);
      if (["/rest/v1/business_settings", "/rest/v1/order_notification_settings"].includes(url.pathname)) {
        settingsReads.push(url.pathname);
        return json(url.pathname.endsWith("/business_settings") ? business : notifications);
      }
      if (["/rest/v1/rpc/owner_save_business_settings", "/rest/v1/rpc/owner_save_notification_settings"].includes(url.pathname)) {
        const payload = request.postDataJSON(); saves.push({ path: url.pathname, payload });
        if (holdSave) await holdSave;
        if (conflict) { conflict = false; return json({ code: "PT409", message: "Synthetic revision conflict" }, 409); }
        if (url.pathname.endsWith("owner_save_business_settings")) {
          assert.equal(payload.p_expected_revision, business.revision);
          business = { revision: business.revision + 1, settings: payload.p_settings };
          return json(business);
        }
        assert.equal(payload.p_expected_revision, notifications.revision);
        notifications = { revision: notifications.revision + 1, settings: payload.p_settings };
        return json(notifications);
      }
      unexpected.push(`${request.method()} ${url.pathname}`); return route.abort();
    });
    return result;
  }
  const ownerContext = await context(true); const page = await ownerContext.newPage();
  inspectedPage = page;
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin/`);
  await page.getByLabel("Public support email").waitFor();
  await page.getByLabel("Email recipients", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Email recipients", { exact: true }).inputValue(), "PRIVATE-UI-CANARY@example.invalid");
  assert.equal(await page.getByLabel("Shipping mode", { exact: true }).inputValue(), "unconfigured");
  assert.equal(await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).count(), 0);
  await page.getByLabel("Public support email").fill("public-ui@example.invalid");
  const ep = page.getByRole("group", { name: "Easypaisa", exact: true });
  await ep.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.getByText("easypaisa requires an account title and number before enabling.").waitFor();
  assert.equal(saves.length, 0);
  await ep.getByLabel("Account title", { exact: true }).fill("SYNTHETIC UI WALLET");
  await ep.getByLabel("Account number (7–24 digits)", { exact: true }).fill("00000000000");
  const policy = page.getByRole("group", { name: "Policy text", exact: true });
  await policy.getByLabel("Text", { exact: true }).fill("Synthetic draft policy");
  await policy.getByLabel("Publication state").selectOption("approved");
  await policy.getByLabel("Text", { exact: true }).fill("Synthetic amended draft");
  assert.equal(await policy.getByLabel("Publication state").inputValue(), "draft");
  conflict = true;
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.getByText(/Settings changed\. Reload before saving again/).waitFor();
  assert.equal(await page.getByRole("button", { name: /Save business settings/ }).isDisabled(), true);
  assert.equal(await page.getByLabel("Public support email").inputValue(), "public-ui@example.invalid");
  await page.getByRole("button", { name: /Reload business settings/ }).click();
  await page.waitForFunction(() => document.querySelector('input[type="email"]')?.value === "");
  await page.getByLabel("Public support email").fill("public-ui@example.invalid");
  await page.getByLabel("Shipping mode", { exact: true }).selectOption("flat_rate");
  const shippingSaves = saves.length;
  for (const invalidFee of ["", "-1", "1.001", "1e2"]) {
    await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).fill(invalidFee);
    await page.getByRole("button", { name: /Save business settings/ }).click();
    await page.getByText(/Choose unconfigured with no fee/).waitFor();
    assert.equal(saves.length, shippingSaves);
  }
  await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).fill("250.50");
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.getByRole("button", { name: "Save business settings (revision 2)", exact: true }).waitFor();
  assert.equal(business.settings.support_email, "public-ui@example.invalid");
  assert.deepEqual(business.settings.shipping, { country_code: "PK", currency: "PKR", mode: "flat_rate", fee_minor: 25050 });
  await page.getByRole("button", { name: /Reload business settings/ }).click();
  await page.getByRole("button", { name: "Save business settings (revision 2)", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).inputValue(), "250.50");
  await page.getByLabel("Shipping mode", { exact: true }).selectOption("free");
  assert.equal(await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).count(), 0);
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.getByRole("button", { name: "Save business settings (revision 3)", exact: true }).waitFor();
  assert.deepEqual(business.settings.shipping, { country_code: "PK", currency: "PKR", mode: "free", fee_minor: 0 });
  await page.getByLabel("Shipping mode", { exact: true }).selectOption("flat_rate");
  assert.equal(await page.getByLabel("Flat shipping fee (PKR)", { exact: true }).inputValue(), "");
  await page.getByLabel("Shipping mode", { exact: true }).selectOption("unconfigured");
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.getByRole("button", { name: "Save business settings (revision 4)", exact: true }).waitFor();
  assert.deepEqual(business.settings.shipping, { country_code: "PK", currency: "PKR", mode: "unconfigured", fee_minor: null });
  assert.equal(JSON.stringify(business).includes("PRIVATE-UI-CANARY"), false);
  await page.getByLabel("Email recipients", { exact: true }).fill("updated-private@example.invalid");
  await page.getByRole("button", { name: /Save private recipients/ }).click();
  await page.getByRole("button", { name: "Save private recipients (revision 2)", exact: true }).waitFor();
  assert.deepEqual(notifications.settings.emails, ["updated-private@example.invalid"]);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  role = "partner";
  const before = settingsReads.length;
  await page.getByRole("button", { name: "Check access again", exact: true }).click();
  await page.getByText("Partner", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Public support email").count(), 0);
  assert.equal(await page.getByLabel("Email recipients", { exact: true }).count(), 0);
  assert.equal(settingsReads.length, before);
  role = "owner";
  await page.getByRole("button", { name: "Check access again", exact: true }).click();
  await page.getByLabel("Public support email").waitFor();
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  const beforeSave = saves.length;
  await page.getByLabel("Public support email").fill("delayed@example.invalid");
  await page.getByRole("button", { name: /Save business settings/ }).click();
  await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]') !== null);
  // Ensure the synthetic RPC has started before revoking the visible session.
  for (let attempt = 0; saves.length === beforeSave && attempt < 50; attempt++) await page.waitForTimeout(20);
  assert.equal(saves.length, beforeSave + 1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in required" }).waitFor();
  release(); holdSave = undefined;
  await page.waitForTimeout(150);
  assert.equal(await page.getByLabel("Public support email").count(), 0);
  await ownerContext.close();

  const anonymous = await context(false); const publicPage = await anonymous.newPage();
  publicPage.on("pageerror", error => errors.push(error.message));
  const reads = settingsReads.length;
  await publicPage.goto(`${base}/admin/`);
  await publicPage.getByRole("heading", { name: "Sign in required" }).waitFor();
  assert.equal(settingsReads.length, reads);
  for (const query of ["", "?admin=true", "?preview=1", "?preview=1&admin=true"]) {
    await publicPage.goto(`${base}/checkout/${query}`);
    await publicPage.getByText(/Orders and payments are not enabled/).waitFor();
    await publicPage.locator("main").getByText(/Shipping is not configured yet/).waitFor();
    assert.equal(await publicPage.locator("main").locator("form, input, select, textarea").count(), 0);
    assert.equal(await publicPage.getByRole("button", { name: /Place Order|Pay|Complete/ }).count(), 0);
  }
  for (const route of ["/", "/help/contact/", "/help/delivery/", "/products/gulnaar/"]) {
    await publicPage.goto(base + route);
    if (route === "/products/gulnaar/") await publicPage.locator("summary").filter({ hasText: "Delivery & returns" }).click();
    if (route !== "/help/contact/") await publicPage.locator("main").getByText(/Shipping is not configured yet/).waitFor();
    assert.doesNotMatch(await publicPage.locator("body").innerText(), /Free delivery across Pakistan|zero shipping charge|Complimentary/);
    assert.doesNotMatch(await publicPage.locator("body").innerText(), /PRIVATE-UI-CANARY|updated-private|SYNTHETIC UI WALLET|48 hours|7.day size exchange|4323811/);
  }
  assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  await anonymous.close();
  console.log("PASS: Owner shipping modes/fee validation/persistence, forms, draft reset, conflicts/reload, separate saves, mobile width, demotion, delayed-save logout, anonymous denial, public unconfigured shipping, and closed checkout query variants.");
  console.log("Synthetic Auth/REST only; not live Supabase authorization evidence.");
} catch (error) {
  if (inspectedPage && !inspectedPage.isClosed()) console.error(await inspectedPage.locator("body").innerText());
  console.error({ errors, unexpected, settingsReads });
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
