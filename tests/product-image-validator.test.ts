import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleProductImage, type ImageValidatorPorts } from "../supabase/functions/_shared/product-image-handler.ts";
import { ImageDecoderUnavailable } from "../supabase/functions/_shared/decode-product-image.ts";

const userId = "00000000-0000-4000-8000-000000000201";
const uploadPath = `products/0/${userId}/00000000-0000-4000-8000-000000000301.webp`;
function setup(role: string | null, options: { expired?: boolean; demote?: boolean; corrupt?: boolean; uploadFailure?: boolean; registrationFailure?: boolean } = {}) {
  const calls: string[] = []; let reads = 0;
  const caller = {
    auth: { async getUser(token: string) {
      calls.push("identity"); assert.equal(token,"test-session");
      return { error: options.expired ? { status:401 } : null, data: { user: { id: userId,is_anonymous:false,user_metadata: { role:"owner" } } } };
    } },
    from(name: string) {
      assert.equal(name,"dashboard_roles");
      return { select() { return { eq(column: string, id: string) {
        assert.equal(column,"user_id"); assert.equal(id,userId);
        return { async maybeSingle() { reads++; calls.push("role"); return { data: role ? { role: options.demote && reads>1 ? "partner" : role } : null,error:null }; } };
      } }; } };
    },
    storage: { from(bucket: string) { assert.equal(bucket,"product-image-uploads"); return { async download(path: string) {
      assert.equal(path,uploadPath); calls.push("download"); return { data:new Blob([new Uint8Array([1])],{type:"image/webp"}),error:null };
    } }; } },
  } as unknown as SupabaseClient;
  const trusted = {
    storage: { from(bucket: string) { assert.equal(bucket,"product-images"); return { async upload(path: string,_bytes: Uint8Array,settings: { upsert: boolean }) {
      calls.push("publish"); assert.equal(settings.upsert,false); assert.match(path,new RegExp(`^products/0/${userId}/[0-9a-f-]{36}/`));
      return { error:options.uploadFailure ? new Error("NEVER ECHO PROVIDER BODY") : null };
    } }; } },
    async rpc(name: string,parameters: { p_user_id:string }) {
      calls.push("register"); assert.equal(name,"register_product_image_asset"); assert.equal(parameters.p_user_id,userId);
      return { error:options.registrationFailure ? new Error("NEVER ECHO PROVIDER BODY") : null };
    },
  } as unknown as SupabaseClient;
  const ports: ImageValidatorPorts = { configured:true,allowedOrigins:["http://localhost:3000"],
    caller: authorization => { assert.equal(authorization,"Bearer test-session"); calls.push("caller"); return caller; },
    trusted: () => { calls.push("trusted"); return trusted; },
    decode: async () => {
      calls.push("decode"); if (options.corrupt) throw new Error("NEVER ECHO PROVIDER BODY");
      return { width:384,height:512,files:["192.webp","384.webp","main.webp"].map(name=>({name,bytes:new Uint8Array([1,2,3])})) };
    },
  };
  return { ports,calls };
}
function request(body: unknown = { productId:0,uploadPath }, authorization = "Bearer test-session", origin = "http://localhost:3000") {
  return new Request("https://example.invalid/functions/v1/validate-product-image", { method:"POST",
    headers:{ Authorization:authorization,Origin:origin,"Content-Type":"application/json" },body:JSON.stringify(body) });
}
test("Partner and unassigned identities get the actual Owner denial before body validation or Storage access", async () => {
  for (const role of ["partner",null]) {
    const f = setup(role);
    const response = await handleProductImage(request({ productId:-1,uploadPath:"invalid" }),f.ports);
    assert.equal(response.status,403); assert.deepEqual(await response.json(),{code:"42501",message:"Owner access required"});
    assert.deepEqual(f.calls,["caller","identity","role"]);
  }
});
test("anonymous/missing/expired sessions fail without trusted access", async () => {
  const missing = setup("owner"); assert.equal((await handleProductImage(request({},""),missing.ports)).status,401); assert.equal(missing.calls.length,0);
  const expired = setup("owner",{expired:true}); assert.equal((await handleProductImage(request({},"Bearer test-session"),expired.ports)).status,401);
  assert.ok(!expired.calls.includes("trusted"));
});
test("Owner demotion while decoding blocks publication and registration", async () => {
  const f = setup("owner",{demote:true});
  const response = await handleProductImage(request(),f.ports);
  assert.equal(response.status,403); assert.deepEqual(await response.json(),{code:"42501",message:"Owner access required"});
  assert.ok(f.calls.includes("decode")); assert.ok(!f.calls.includes("trusted"));
});
test("foreign-user paths and corrupt image bytes never reach publication", async () => {
  const wrong = setup("owner");
  assert.equal((await handleProductImage(request({productId:0,uploadPath:uploadPath.replace(userId,"00000000-0000-4000-8000-000000000202")}),wrong.ports)).status,400);
  assert.ok(!wrong.calls.includes("download"));
  const corrupt = setup("owner",{corrupt:true}); const response = await handleProductImage(request(),corrupt.ports);
  assert.equal(response.status,400); assert.ok(!corrupt.calls.includes("trusted")); assert.ok(!(await response.text()).includes("NEVER ECHO"));
});
test("only a verified Owner gets three immutable outputs registered; validation never attaches a product", async () => {
  const f = setup("owner"); const response = await handleProductImage(request(),f.ports);
  assert.equal(response.status,200); assert.equal(f.calls.filter(c=>c==="publish").length,3);
  assert.equal(f.calls.filter(c=>c==="role").length,2); assert.equal(f.calls.at(-1),"register");
  const result = await response.json(); assert.match(result.path,/\/main\.webp$/); assert.equal(result.width,384);
});
test("publication/registration failures remain explicit, do not delete anything and never echo providers", async () => {
  for (const options of [{ uploadFailure:true },{ registrationFailure:true }]) {
    const f = setup("owner",options); const response = await handleProductImage(request(),f.ports);
    assert.equal(response.status,503); assert.ok(!(await response.text()).includes("NEVER ECHO"));
    if (options.uploadFailure) assert.ok(!f.calls.includes("register"));
  }
});
test("untrusted origins and oversized JSON cannot trigger image work", async () => {
  const f = setup("owner"); assert.equal((await handleProductImage(request({},"Bearer test-session","https://untrusted.invalid"),f.ports)).status,403); assert.equal(f.calls.length,0);
  const tooLarge = setup("owner"); assert.equal((await handleProductImage(request({uploadPath:"x".repeat(2000)}),tooLarge.ports)).status,413); assert.ok(!tooLarge.calls.includes("download"));
});

test("missing decoder infrastructure is a setup failure, not a claim that the image is corrupt", async () => {
  const f = setup("owner"); f.ports.decode = async () => { throw new ImageDecoderUnavailable("Missing WASM"); };
  const response = await handleProductImage(request(),f.ports);
  assert.equal(response.status,503); assert.equal((await response.json()).code,"decoder_unavailable");
  assert.ok(!f.calls.includes("trusted"));
});
