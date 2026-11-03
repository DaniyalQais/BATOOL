// Local source review only; never reads environment or connects to a database.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = await readFile(new URL("../supabase/migrations/20261102001000_checkout_intent_recovery.sql", import.meta.url), "utf8");
const previous = await readFile(new URL("../supabase/migrations/20261102000900_secure_checkout.sql", import.meta.url), "utf8");
const target = new URL("../supabase/tests/checkout_recovery_postflight.sql", import.meta.url);
const signatures = { "public.checkout_create": "uuid,uuid,uuid,jsonb", "public.checkout_resolution": "uuid,uuid,uuid",
  "public.checkout_resolve": "uuid,uuid,uuid", "public.checkout_replacement_quote": "uuid,uuid,jsonb,text" };
const md5 = value => createHash("md5").update(value.replace(/\s+/g, "")).digest("hex");
const values = [];
for (const match of source.matchAll(/create function ([a-z_.]+)\([\s\S]*?\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)) {
  if (!(match[1] in signatures)) throw new Error("Unknown recovery function");
  values.push(`('${match[1]}(${signatures[match[1]]})','${md5(match[2])}')`);
}
const original = previous.match(/create function public\.checkout_create\([\s\S]*?as \$\$([\s\S]*?)\$\$;/);
if (!original || values.length !== 4) throw new Error("Missing recovery/creator fingerprints");
values.push(`('batool_checkout_internal.create_order_v009(uuid,uuid,uuid,jsonb)','${md5(original[1])}')`);
const query = await readFile(target, "utf8");
await writeFile(target, query.replace(/-- BEGIN GENERATED SOURCES[\s\S]*?-- END GENERATED SOURCES/,
  `-- BEGIN GENERATED SOURCES\nsources(signature,body_md5) as (values\n ${values.join(",\n ")}),\n-- END GENERATED SOURCES`));
console.log(`Recovery review prepared; 010 SHA256 ${createHash("sha256").update(source).digest("hex")}`);
