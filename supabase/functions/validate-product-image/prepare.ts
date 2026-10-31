// Local packaging only. No Supabase connection or credentials.
import "@imagemagick/magick-wasm";
const bytes = await Deno.readFile(new URL(import.meta.resolve("@imagemagick/magick-wasm/magick.wasm")));
await Deno.mkdir(new URL("./assets/", import.meta.url), { recursive: true });
await Deno.writeFile(new URL("./assets/magick.wasm", import.meta.url), bytes);
console.log("Prepared pinned WASM asset locally; nothing deployed.");
