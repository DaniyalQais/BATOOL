// Source fingerprints only. No database or environment access.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const migration = new URL("../supabase/migrations/20261102000900_secure_checkout.sql", import.meta.url);
const postflight = new URL("../supabase/tests/secure_checkout_postflight.sql", import.meta.url);
const source = await readFile(migration, "utf8");
const signatures = {
  "batool_checkout_internal.cart": "jsonb", "batool_checkout_internal.customer": "jsonb", "batool_checkout_internal.snapshot": "jsonb,text",
  "public.checkout_admit": "text", "public.checkout_quote": "uuid,jsonb,text", "public.checkout_recover": "uuid,uuid", "public.checkout_create": "uuid,uuid,uuid,jsonb",
};
const values = [];
for (const match of source.matchAll(/create function ([a-z_.]+)\([\s\S]*?\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)) {
  if (!(match[1] in signatures)) throw new Error("Unrecognized checkout function");
  const hash = createHash("md5").update(match[2].replace(/\s+/g, "")).digest("hex");
  values.push(`('${match[1]}(${signatures[match[1]]})','${hash}')`);
}
if (values.length !== 7) throw new Error("Missing checkout source fingerprints");
const query = await readFile(postflight, "utf8");
await writeFile(postflight, query.replace(/-- BEGIN GENERATED SOURCES[\s\S]*?-- END GENERATED SOURCES/,
  `-- BEGIN GENERATED SOURCES\nsources(signature,body_md5) as (values\n ${values.join(",\n ")}),\n-- END GENERATED SOURCES`));
console.log(`Prepared checkout fingerprints; migration SHA256 ${createHash("sha256").update(source).digest("hex")}`);
