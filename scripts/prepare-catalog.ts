import { mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { mapCatalog } from "../src/features/catalog/model/catalog-mapper.ts";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { products as demoProducts } from "../src/features/catalog/model/products.ts";
import type { Product } from "../src/features/catalog/model/types.ts";
import { verifyCatalogImages } from "./verify-catalog-images.ts";

const directory = new URL("../src/features/catalog/model/generated/", import.meta.url);
const target = new URL("catalog.ts", directory);
async function save(source: string, products: readonly Product[]) {
  await mkdir(directory, { recursive: true });
  await writeFile(target, `// Generated public snapshot; never edit or commit.\nimport type { Product } from "../types.ts";\nexport const snapshot: { source: string; products: readonly Product[] } = ${JSON.stringify({ source, products }, null, 2)};\n`);
}

export function catalogConfiguration(env: Record<string, string | undefined>) {
  const source = env.CATALOG_SOURCE ?? "supabase";
  if (source === "demo") return { source } as const;
  if (source !== "supabase") throw new Error("CATALOG_SOURCE must be supabase or demo.");
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Catalog configuration missing: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. For offline preview explicitly set CATALOG_SOURCE=demo.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid SUPABASE_URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") throw new Error("SUPABASE_URL must be the HTTPS project origin.");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error("Use a Supabase publishable key (sb_publishable_...), never an elevated key.");
  return { source, url, key } as const;
}

// Called by Next configuration for both direct next build and npm run build/dev.
export async function prepareCatalog(env: Record<string, string | undefined> = process.env) {
  // Invalidate any previous snapshot first: failures cannot reuse stale demo/live data.
  await save("unconfigured", []);
  const config = catalogConfiguration(env);
  if (config.source === "demo") {
    await save("demo", demoProducts.map((p) => ({ ...p, isDemo: true, currency: "PKR", variants: p.sizes.map((size) => ({ size, stockQuantity: null })) })));
    return;
  }
  const client = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    // Page explicitly: Supabase's default row cap must not silently truncate the catalog.
    const rows: unknown[] = [];
    for (let from = 0; ; from += 100) {
      const { data, error } = await client.from("products")
        .select("*, product_variants(*)").eq("active", true)
        .order("sort_order").order("id").range(from, from + 99)
        .abortSignal(AbortSignal.timeout(30_000));
      if (error || !data) throw new Error("read failed");
      rows.push(...data);
      if (data.length < 100) break;
    }
    const mapped = mapCatalog(rows);
    await verifyCatalogImages(mapped, config.url);
    await save("supabase", mapped);
  } catch {
    // Do not print SDK errors: URLs, headers or credentials may be attached.
    throw new Error("Supabase catalog load failed. Verify project, migrations, RLS, network and catalog data. No fallback was used.");
  }
}

async function main() {
  if (process.argv.includes("--test-demo")) await prepareCatalog({ CATALOG_SOURCE: "demo" });
  else if (process.argv.includes("--types")) {
    try { await access(target); } catch { await save("unconfigured", []); }
  } else await prepareCatalog();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Catalog preparation failed.");
    process.exitCode = 1;
  });
}
