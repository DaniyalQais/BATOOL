import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicAuthConfig } from "../src/features/auth/model/public-config.ts";
import type { Database } from "../src/features/catalog/model/database.types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class ProbeFailure extends Error {}

// Never substitute a real product ID, even when testing a suspected authorization bug.
export const denialProbe = Object.freeze({
  p_product_id: -1,
  p_expected_revision: 1,
  p_name: "Authorization probe",
  p_description: "Nonexistent negative-ID authorization probe.",
  p_price_minor: 0,
  p_active: false,
  p_stocks: Object.freeze({ S: null, M: null, L: null, XL: null }),
});

/** Uses only the caller's session. Does not provision users or mutate mappings. */
export async function verifyDenial(client: SupabaseClient<Database>, { userId, role, scope }: { userId: string; role: string; scope?: "image" }) {
  if (!uuid.test(userId) || !["partner", "unassigned"].includes(role)) {
    throw new ProbeFailure("Choose partner/unassigned and supply the temporary account's Auth UUID.");
  }
  const identity = await client.auth.getUser();
  if (identity.error || !identity.data?.user || identity.data.user.is_anonymous ||
      identity.data.user.id !== userId) {
    throw new ProbeFailure("Verified identity does not match the temporary Auth UUID. No RPC sent.");
  }

  const mapping = await client.from("dashboard_roles").select("user_id,role")
    .eq("user_id", userId).limit(2).abortSignal(AbortSignal.timeout(15_000));
  if (mapping.error || !Array.isArray(mapping.data)) {
    throw new ProbeFailure("Could not verify the role mapping. No RPC sent.");
  }
  const matches = role === "unassigned" ? mapping.data.length === 0 :
    mapping.data.length === 1 && mapping.data[0].user_id === userId && mapping.data[0].role === "partner";
  if (!matches) throw new ProbeFailure("Role mapping does not match this test; Owner is never accepted. No RPC sent.");

  const result = scope === "image"
    ? await client.rpc("owner_attach_product_image", { p_product_id: -1, p_expected_revision: 1,
      p_image_path: `products/0/${userId}/${crypto.randomUUID()}/main.webp`, p_alt: "Authorization probe" }).abortSignal(AbortSignal.timeout(15_000))
    : await client.rpc("owner_update_catalog_product", {
      ...denialProbe, p_stocks: { ...denialProbe.p_stocks },
    }).abortSignal(AbortSignal.timeout(15_000));
  if (result.status === 403 && result.error?.code === "42501" &&
      result.error.message === "Owner access required") {
    return { role, status: 403, code: "42501", message: "Owner access required" };
  }
  if (result.error?.code === "22023") {
    throw new ProbeFailure("NOT A PASS: validation error 22023, rather than Owner authorization denial.");
  }
  if (result.error?.code === "PT409") {
    throw new ProbeFailure("NOT A PASS: stale-revision error PT409, rather than Owner authorization denial.");
  }
  // Do not print arbitrary provider bodies, tokens, URLs, or returned product data.
  throw new ProbeFailure("NOT A PASS: unexpected response. Expected HTTP 403 / 42501 / Owner access required.");
}

export async function verifyImageValidatorDenial(client: SupabaseClient<Database>) {
  const result = await client.functions.invoke("validate-product-image", { body: { productId: -1, uploadPath: "invalid-authorization-probe" } });
  const context = result.error?.context;
  if (context instanceof Response && context.status === 403) {
    const body = await context.json();
    if (body.code === "42501" && body.message === "Owner access required") return;
  }
  throw new ProbeFailure("NOT A PASS: image validator did not return HTTP 403 / 42501 / Owner access required. Missing deployment, validation and network errors do not prove denial.");
}

async function credentials() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Use an interactive VS Code terminal; credentials must not be piped or passed as arguments.");
  }
  let hidden = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!hidden) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  const abort = new AbortController();
  input.on("SIGINT", () => abort.abort());
  try {
    const userId = (await input.question("Temporary account Auth UUID: ", { signal: abort.signal })).trim().toLowerCase();
    if (!uuid.test(userId)) throw new Error("Invalid Auth UUID. No login attempted.");
    const email = (await input.question("Temporary account email: ", { signal: abort.signal })).trim();
    process.stdout.write("Temporary account password (hidden): ");
    hidden = true;
    const password = await input.question("", { signal: abort.signal });
    process.stdout.write("\n");
    if (!email || !password) throw new Error("Email and password are required.");
    return { userId, email, password };
  } finally {
    hidden = false;
    input.close();
  }
}

async function main() {
  const role = process.argv[2];
  const imageScope = process.argv[3] === "--image";
  if (!(process.argv.length === 3 || process.argv.length === 4 && imageScope) || !role || !["partner", "unassigned"].includes(role)) {
    console.error("Usage: node --env-file=.env.local --experimental-strip-types scripts/verify-product-editing-denial.ts partner|unassigned [--image]");
    process.exitCode = 1;
    return;
  }
  let client: SupabaseClient<Database> | undefined;
  let signedIn = false;
  try {
    const config = publicAuthConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
    if (!config) throw new Error("Configure the existing project URL and publishable key in .env.local.");
    const account = await credentials();
    client = createClient<Database>(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) }) },
    });
    const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    account.password = "";
    if (login.error || !login.data.session) {
      console.error("NOT RUN: login failed. Check the temporary account's password/confirmation status and network; no RPC sent.");
      process.exitCode = 1;
      return;
    }
    signedIn = true;
    // Catch provider/network exceptions separately: never echo their raw bodies.
    let result;
    try {
      result = await verifyDenial(client, { userId: account.userId, role, scope: imageScope ? "image" : undefined });
      console.log(`PASS ${result.role}${imageScope ? " image attachment" : ""}: HTTP ${result.status}, ${result.code}, ${result.message}`);
      if (imageScope) {
        await verifyImageValidatorDenial(client);
        console.log(`PASS ${result.role} image validator: HTTP 403, 42501, Owner access required`);
      }
    } catch (error) {
      console.error(error instanceof ProbeFailure
        ? error.message : "NOT RUN / INCONCLUSIVE: network or session verification failed. No denial established.");
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error("NOT RUN: check public configuration and interactive terminal input. No denial established.");
    process.exitCode = 1;
  } finally {
    if (signedIn && client) {
      try {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
        console.log("Temporary CLI session signed out; browser sessions were not touched.");
      } catch {
        console.error("Temporary CLI session sign-out unconfirmed. Complete account cleanup through trusted administration.");
        process.exitCode = 1;
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
