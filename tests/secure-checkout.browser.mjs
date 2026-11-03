// New local checkout UI only; synthetic HTTP responses, not real sessions or DB.
import { createServer } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = resolve(fileURLToPath(new URL("../out/", import.meta.url)));
if (!process.env.BATOOL_PLAYWRIGHT_MODULE) throw new Error("Set BATOOL_PLAYWRIGHT_MODULE to installed Playwright");
const { chromium } = await import(pathToFileURL(process.env.BATOOL_PLAYWRIGHT_MODULE).href);
const recovery = process.argv.includes("--recovery");
const preview = process.argv.includes("--preview") || recovery;
const endpoint = "http://127.0.0.1:43179";
const qid = "00000000-0000-4000-8000-000000000971", oid = "00000000-0000-4000-8000-000000000972";
const quote = { quote_id: qid, expires_at: "2099-01-01T00:00:00Z", currency: "PKR", lines: [{ id: 0, size: "M", quantity: 1, name: "Synthetic garment", unit_price_minor: "100001" }],
  subtotal_minor: "100001", shipping_minor: "25001", total_minor: "125002", shipping_mode: "flat_rate", payment_method: "cod", settings_revision: 1,
  payment_instructions: "SYNTHETIC COD INSTRUCTIONS", policy_text: "SYNTHETIC POLICY" };
const receipt = { order_id: oid, quote_id: qid, currency: "PKR", subtotal_minor: "100001", shipping_minor: "25001", total_minor: "125002", payment_status: "unpaid" };
const nextQuote = { ...quote, quote_id: "00000000-0000-4000-8000-000000000973" };
const nextReceipt = { ...receipt, quote_id: nextQuote.quote_id };
const retired = { status: "retired", quote_id: qid, resolution_id: "00000000-0000-4000-8000-000000000974", replacement_key: "00000000-0000-4000-8000-000000000975", replacement_quote: null };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = resolve(root, "." + path);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp", ".ico": "image/x-icon" };
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext(); let creates = []; let release; let mode = "hold";
  let releaseResolution, resolutionMode = "hold", resolutionCalls = 0, savedReplacement = false;
  const errors = []; const external = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (preview && url.origin === endpoint) {
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const body = route.request().postDataJSON();
      if (body.action === "scope") return route.fulfill({ json: { scope: "synthetic-capability" }, headers });
      if (body.action === "quote") return route.fulfill({ json: { quote }, headers });
      if (body.action === "replacement_quote") return route.fulfill({ json: { quote: nextQuote }, headers });
      if (body.action === "resolve") {
        resolutionCalls++;
        if (resolutionMode === "hold") await new Promise(resolve => { releaseResolution = resolve; });
        return route.fulfill({ status: resolutionMode === "success" ? 200 : 503,
          json: resolutionMode === "success" ? { resolution: retired, scope: "renewed-synthetic-capability" } : { error: "resolution_unconfirmed" }, headers });
      }
      if (body.action === "recover") return route.fulfill({ json: recovery
        ? (savedReplacement ? { confirmed: true, receipt: nextReceipt } : { confirmed: false }) : { confirmed: true, receipt }, headers });
      if (body.action === "create") {
        creates.push(body);
        if (mode === "hold") await new Promise(resolve => { release = resolve; });
        if (mode === "lost" && body.quote_id === nextQuote.quote_id) { savedReplacement = true; return route.fulfill({ status: 503, json: { error: "commit_unconfirmed" }, headers }); }
        return route.fulfill({ status: mode === "success" ? 200 : 409, json: mode === "success" ? { confirmed: true, receipt } : { error: "quote_or_stock_changed" }, headers });
      }
    }
    external.push(url.origin); return route.abort();
  });
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { if (localStorage.getItem("batool-bag") === null) localStorage.setItem("batool-bag", '[{"id":0,"size":"M","quantity":1}]'); });
  await page.goto(origin + "/checkout/?preview=1");
  if (!preview) {
    await page.getByRole("heading", { name: "Your bag preview" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Place order" }).count(), 0);
    await page.goto(origin + "/checkout/?admin=true");
    await page.getByRole("heading", { name: "Checkout is unavailable" }).waitFor();
    assert.equal(await page.locator("input[name='phone']").count(), 0);
    assert.equal(external.length, 0); assert.equal(errors.length, 0);
    let artifacts = 0;
    async function inspect(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name);
        if (entry.isDirectory()) await inspect(file);
        else if (/\.(?:html|js|json|txt|map)$/.test(entry.name)) {
          const source = await readFile(file, "utf8"); artifacts++;
          assert.ok(!source.includes(endpoint), "Preview endpoint leaked into default export");
          for (const canary of ["PRIVATE CANARY", "SYNTHETIC WALLET", "SYNTHETIC COD INSTRUCTIONS", "923000000000"]) assert.ok(!source.includes(canary), "Private fixture canary found in export");
          assert.ok(!/sb_secret_[A-Za-z0-9_-]{12,}/.test(source), "Elevated key literal found in export");
        }
      }
    }
    await inspect(root);
    console.log("PASS: final default static export keeps checkout closed, has no customer form and attempts no external checkout requests.");
    console.log(`PASS: bounded scan of ${artifacts} exported text artifacts; no checkout preview URL, private fixture canaries or elevated-key-prefix literals.`);
  } else {
    await page.getByRole("heading", { name: "Local checkout test" }).waitFor();
    await page.getByRole("button", { name: "Check current prices and shipping" }).click();
    await page.getByText("Subtotal: PKR 1000.01", { exact: false }).waitFor();
    for (const [name, value] of Object.entries({ recipient_name: "Synthetic customer", phone: "923000000000", address_line1: "Synthetic address", city: "Synthetic city" })) await page.locator(`input[name='${name}']`).fill(value);
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Place order", exact: true }).click();
    await page.waitForFunction(() => !!sessionStorage.getItem("batool-local-checkout-intent-v1"));
    for (let i = 0; !release && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(release); assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))).length, 1);
    assert.equal(await page.getByRole("heading", { name: "Order saved" }).count(), 0);
    mode = "failure"; release(); await page.getByRole("alert").waitFor();
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))).length, 1);
    if (recovery) {
      const before = await page.evaluate(() => sessionStorage.getItem("batool-local-checkout-intent-v1"));
      await page.getByRole("button", { name: "Resolve saved checkout", exact: true }).click();
      for (let i = 0; !releaseResolution && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(releaseResolution); assert.equal(await page.getByRole("button", { name: "Review replacement quote" }).count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem("batool-local-checkout-intent-v1")), before);
      resolutionMode = "failure"; releaseResolution(); await page.getByRole("alert").waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem("batool-local-checkout-intent-v1")), before);
      resolutionMode = "success"; await page.getByRole("button", { name: "Resolve saved checkout", exact: true }).click();
      await page.getByRole("button", { name: "Review replacement quote" }).waitFor();
      assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))).length, 1);
      assert.equal(JSON.parse(await page.evaluate(() => sessionStorage.getItem("batool-local-checkout-intent-v1"))).replacement_key, retired.replacement_key);
      await page.reload(); await page.getByRole("button", { name: "Review replacement quote" }).click();
      await page.getByRole("button", { name: "Retry saved request" }).waitFor();
      for (const [name, value] of Object.entries({ recipient_name: "Synthetic customer", phone: "923000000000", address_line1: "Synthetic address", city: "Synthetic city" })) await page.locator(`input[name='${name}']`).fill(value);
      await page.getByRole("checkbox").check(); mode = "lost"; await page.getByRole("button", { name: "Retry saved request" }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))).length, 1);
      assert.equal(creates.length, 2); assert.equal(creates[1].key, retired.replacement_key); assert.notEqual(creates[0].key, creates[1].key);
      await page.getByRole("button", { name: "Check saved order", exact: true }).click();
      await page.getByRole("heading", { name: "Order saved" }).waitFor();
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))), []);
      await page.reload(); await page.getByRole("heading", { name: "Order saved" }).waitFor();
      assert.equal(creates.length, 2); assert.equal(resolutionCalls, 2); assert.equal(external.length, 0); assert.equal(errors.length, 0);
      console.log("PASS: recovery UI preserves bag/request while waiting and after failure; durable restart survives reload; pinned replacement lost response recovers without resubmission (mock HTTP only).");
    } else {
    mode = "success"; await page.getByRole("button", { name: "Retry saved request" }).click();
    await page.getByRole("heading", { name: "Order saved" }).waitFor();
    assert.equal(creates.length, 2); assert.equal(creates[0].key, creates[1].key);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))), []);
    assert.ok(!(await page.evaluate(() => sessionStorage.getItem("batool-local-checkout-intent-v1"))).includes("recipient_name"));
    await page.reload(); await page.getByRole("heading", { name: "Order saved" }).waitFor();
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("batool-bag"))), []);
    assert.equal(creates.length, 2); assert.equal(external.length, 0); assert.equal(errors.length, 0);
    console.log("PASS: local static-export checkout uses quoted totals, keeps bag pending/failure, retries one key, clears after confirmed success and restores receipt without resubmitting (mock HTTP only).");
    }
  }
  await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
