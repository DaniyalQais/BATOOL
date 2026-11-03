import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { catalogConfiguration } from "./prepare-catalog.ts";
import { publicSettings, unpublishedPublicSettings, type PublicBusinessSettings } from "../src/features/settings/model/public-settings.ts";

const directory = new URL("../src/features/settings/model/generated/", import.meta.url);
const target = new URL("public-settings.ts", directory);
async function save(value: PublicBusinessSettings) {
  // Revalidate and project even offline values; unknown keys never reach disk.
  const snapshot = publicSettings(value);
  await mkdir(directory, { recursive: true });
  await writeFile(target, `// Generated public settings only; never edit or commit.\nimport type { PublicBusinessSettings } from "../public-settings.ts";\nexport const publicBusinessSettings: PublicBusinessSettings = ${JSON.stringify(snapshot, null, 2)};\n`);
}
export async function preparePublicSettings(env: Record<string, string | undefined> = process.env) {
  // Erase a previous snapshot before configuration/network work. No stale fallback.
  await save(unpublishedPublicSettings());
  const config = catalogConfiguration(env);
  if (config.source === "demo") return;
  const client = createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    // Publishable key only; never query either Owner table or notification data.
    const { data, error } = await client.rpc("get_public_business_settings").abortSignal(AbortSignal.timeout(20_000));
    if (error) throw error;
    await save(publicSettings(data));
  } catch {
    throw new Error("Public settings load failed. Verify the settings migration, public RPC and configuration before rebuilding. No private query or fallback was used.");
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    if (process.argv.includes("--test-demo")) await preparePublicSettings({ CATALOG_SOURCE: "demo" });
    else if (process.argv.includes("--types")) { try { await access(target); } catch { await save(unpublishedPublicSettings()); } }
    else await preparePublicSettings();
  })().catch(error => { console.error(error instanceof Error ? error.message : "Settings preparation failed."); process.exitCode = 1; });
}
