// Disposable PostgreSQL only. No Supabase CLI, network services, or remote credentials.
// Minimal Auth/Storage stubs exercise SQL behavior, not Supabase API/JWT verification.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url));
const option = process.argv.indexOf("--postgres-bin");
if (option < 0 || !process.argv[option + 1]) throw new Error("Pass --postgres-bin with the installed PostgreSQL bin directory.");
const bin = resolve(process.argv[option + 1]);
const pendingFoundations = process.argv.includes("--pending-foundations");
const draftsOnly = process.argv.includes("--drafts-only");
const reviewOnly = process.argv.includes("--review-only");
const checkoutOnly = process.argv.includes("--checkout");
const recoveryOnly = process.argv.includes("--recovery");
if (recoveryOnly && (checkoutOnly || reviewOnly || pendingFoundations || draftsOnly)) throw new Error("Recovery runs only its new suites.");
if (checkoutOnly && (reviewOnly || pendingFoundations || draftsOnly)) throw new Error("Checkout runs only its new suites.");
if (reviewOnly && pendingFoundations) throw new Error("Choose review-only or pending foundation tests.");
if (draftsOnly && !pendingFoundations) throw new Error("--drafts-only requires --pending-foundations.");
const directory = resolve(root, ".tmp", `${recoveryOnly ? "recovery" : checkoutOnly ? "checkout" : reviewOnly ? "settings-review" : pendingFoundations ? "foundations" : "settings"}-pg-${Date.now()}`);
await mkdir(directory, { recursive: true });
const data = join(directory, "data");
const extension = process.platform === "win32" ? ".exe" : "";
function run(name, args, input = "", allowFailure = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(bin, name + extension), args, { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    // pg_ctl's background server may retain pipe handles on Windows. Its own
    // exit status is authoritative; do not wait for the server to close them.
    child.on(name === "pg_ctl" ? "exit" : "close", async code => {
      if (name === "pg_ctl") { child.stdout.destroy(); child.stderr.destroy(); }
      if (code === 0 || allowFailure) resolvePromise({ code, output });
      else {
        // Local fixture diagnostics stay on disk; never print rows/settings.
        const log = join(directory, `failure-${name}.log`);
        try { await writeFile(log, output); } catch { /* Preserve the exit status. */ }
        reject(new Error(`${name} failed (${code}); local diagnostics: ${log}`));
      }
    });
    child.stdin.end(input);
  });
}
const server = createServer();
await new Promise(resolvePromise => server.listen(0, "127.0.0.1", resolvePromise));
const port = server.address().port;
await new Promise(resolvePromise => server.close(resolvePromise));
const psql = ["-X", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const bootstrap = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, aud text, role text, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub','')::uuid;
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner_id text, metadata jsonb);
alter table storage.objects enable row level security;
`;
let started = false;
async function cleanAfterRollback(label, draftsPresent) {
  const tables = ["auth.users", "public.products", "public.product_variants", "public.dashboard_roles", "public.product_image_assets", "storage.objects",
    "public.orders", "public.order_items", "public.order_customer_details", "public.order_creation_keys", "public.order_status_history",
    ...(draftsPresent ? ["batool_catalog_internal.creation_requests"] : [])];
  const checks = tables.map(table => `if exists(select 1 from ${table}) then raise exception 'Fixture rollback incomplete'; end if;`).join("\n");
  const result = await run("psql", psql, `begin read only; do $$ begin ${checks} end; $$; rollback; select 'PASS rollback: ${label}';`);
  await writeFile(join(directory, `${label}-rollback.log`), result.output);
  console.log(`PASS: ${label} rollback verified; all fixture tables empty.`);
}
async function fixtureSuite(file, marker, label) {
  const result = await run("psql", psql, `set batool.test_disposable='yes';\n\\i supabase/tests/${file}\n`);
  await writeFile(join(directory, `${label}.log`), result.output);
  if (!result.output.includes(marker) || !result.output.includes("ROLLBACK")) throw new Error(`${label} success/rollback marker missing; see local log.`);
  console.log(`PASS: ${file} (synthetic SQL roles/JWT claims, not actual Auth sessions).`);
}
try {
  await run("initdb", ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "-E", "UTF8"]);
  await run("pg_ctl", ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  await run("psql", psql, bootstrap);
  for (const migration of ["20261030000100_catalog.sql", "20261030000300_dashboard_roles.sql", "20261030000400_owner_product_editing.sql", "20261030000500_owner_product_images.sql", "20261031000600_order_foundation.sql"]) {
    await run("psql", [...psql, "-f", join(root, "supabase/migrations", migration)]);
  }
  if (pendingFoundations && !draftsOnly) {
    await fixtureSuite("orders.sql", "PASS: local disposable SQL order foundation assertions", "orders");
    await cleanAfterRollback("orders", false);
  }
  await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261101000700_product_drafts.sql")]);
  if (recoveryOnly) {
    // Fresh disposable dependencies only. Do not rerun 009's accepted
    // preflight/postflight, original checkout batch or foundation/draft suites.
    await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102000800_owner_business_settings.sql")]);
    await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102000900_secure_checkout.sql")]);
    const { recoveryDatabaseTests } = await import("./test-checkout-recovery-database.mjs");
    await recoveryDatabaseTests({ run, psql, root, directory });
  } else if (checkoutOnly) {
    await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102000800_owner_business_settings.sql")]);
    const { checkoutDatabaseTests } = await import("./test-checkout-database.mjs");
    await checkoutDatabaseTests({ run, psql, root, directory });
  } else if (pendingFoundations) {
    await fixtureSuite("product_drafts.sql", "PASS disposable product-draft assertions", "product-drafts");
    await cleanAfterRollback("product-drafts", true);
    // Stop here: do not repeat the already-passed business/shipping fixture suite.
    console.log(`Logs: ${directory}`);
  } else {
  const preflight = await run("psql", [...psql, "-A", "-t", "-F", "\t", "-f", join(root, "supabase/tests/business_settings_preflight.sql")]);
  await writeFile(join(directory, "preflight.log"), preflight.output);
  if (reviewOnly && /\t(?:STOP|REVIEW)\s*$/m.test(preflight.output)) throw new Error(`Preflight needs review; see ${join(directory, "preflight.log")}`);
  await run("psql", [...psql, "-f", join(root, "supabase/migrations/20261102000800_owner_business_settings.sql")]);
  if (reviewOnly) {
    const postflight = await run("psql", [...psql, "-A", "-t", "-F", "\t", "-f", join(root, "supabase/tests/business_settings_postflight.sql")]);
    await writeFile(join(directory, "postflight.log"), postflight.output);
    if (/\t(?:STOP|REVIEW)\s*$/m.test(postflight.output)) throw new Error(`Postflight needs review; see ${join(directory, "postflight.log")}`);
    console.log("PASS: new combined read-only preflight/postflight validated locally; no completed fixture suites repeated.");
  } else {
  const batch = await run("psql", psql, "set batool.test_disposable='yes';\n\\i supabase/tests/business_settings.sql\n");
  await writeFile(join(directory, "batch.log"), batch.output);
  if (!batch.output.includes("PASS: settings authorization")) throw new Error("Batch success marker missing.");
  console.log("PASS: local PostgreSQL preflight, migrations 001/003–008, and rollback SQL batch.");
  }
  console.log("Auth and Storage used local test stubs; Supabase integration remains unverified.");
  console.log(`Logs: ${directory}`);
  }
} finally {
  if (started) await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
}
