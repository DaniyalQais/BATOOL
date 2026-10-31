import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/features/catalog/model/database.types.ts";
import { denialProbe, verifyDenial, verifyImageValidatorDenial } from "../scripts/verify-product-editing-denial.ts";

const userId = "00000000-0000-4000-8000-000000000201";
function fixture(role: string | null, response: { status: number; error: { code: string; message: string } | null } = { status: 403, error: { code: "42501", message: "Owner access required" } }) {
  let calls = 0;
  const client = {
    auth: { async getUser() { return { data: { user: { id: userId, is_anonymous: false } }, error: null }; } },
    from(table: string) {
      assert.equal(table, "dashboard_roles");
      return { select(columns: string) {
        assert.equal(columns, "user_id,role");
        return { eq(column: string, id: string) {
          assert.equal(column, "user_id"); assert.equal(id, userId);
          return { limit() { return { async abortSignal() {
            return { data: role === null ? [] : [{ user_id: userId, role }], error: null };
          } }; } };
        } };
      } };
    },
    rpc(name: string, payload: unknown) {
      calls++;
      assert.equal(name, "owner_update_catalog_product");
      assert.deepEqual(payload, denialProbe);
      assert.equal((payload as typeof denialProbe).p_product_id, -1);
      return { async abortSignal() { return response; } };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls: () => calls };
}

test("negative-ID probe never targets a legitimate product; all other arguments are well formed", () => {
  assert.equal(denialProbe.p_product_id, -1);
  assert.equal(denialProbe.p_expected_revision, 1);
  assert.deepEqual(denialProbe.p_stocks, { S: null, M: null, L: null, XL: null });
  assert.ok(Object.isFrozen(denialProbe));
  assert.ok(Object.isFrozen(denialProbe.p_stocks));
});

test("Partner and unassigned sessions pass only with the RPC's actual Owner denial", async () => {
  for (const role of ["partner", "unassigned"]) {
    const f = fixture(role === "partner" ? role : null);
    assert.deepEqual(await verifyDenial(f.client, { userId, role }), {
      role, status: 403, code: "42501", message: "Owner access required",
    });
    assert.equal(f.calls(), 1);
  }
});

test("wrong identity, Owner mapping, wrong expected role, and expired session never send an RPC", async () => {
  const owner = fixture("owner");
  await assert.rejects(verifyDenial(owner.client, { userId, role: "partner" }));
  assert.equal(owner.calls(), 0);
  const wrong = fixture(null);
  await assert.rejects(verifyDenial(wrong.client, { userId: "00000000-0000-4000-8000-000000000202", role: "unassigned" }));
  await assert.rejects(verifyDenial(wrong.client, { userId, role: "partner" }));
  await assert.rejects(verifyDenial(wrong.client, { userId, role: "owner" }));
  wrong.client.auth.getUser = async () => ({ data: { user: null }, error: { status: 401 } }) as never;
  await assert.rejects(verifyDenial(wrong.client, { userId, role: "unassigned" }));
  assert.equal(wrong.calls(), 0);
});

test("validation, stale revisions, missing functions, transport failures and generic permission errors never pass", async () => {
  for (const response of [
    { status: 400, error: { code: "22023", message: "Invalid product fields" } },
    { status: 409, error: { code: "PT409", message: "Product changed; reload before saving" } },
    { status: 403, error: { code: "42501", message: "permission denied for function" } },
    { status: 401, error: { code: "42501", message: "Owner access required" } },
    { status: 404, error: { code: "PGRST202", message: "Missing function" } },
    { status: 0, error: { code: "", message: "Network failure" } },
    { status: 200, error: null },
  ]) {
    const f = fixture("partner", response);
    await assert.rejects(verifyDenial(f.client, { userId, role: "partner" }));
    assert.equal(f.calls(), 1);
  }
});

test("image denial probe also uses a nonexistent negative product ID and requires the exact Owner guard", async () => {
  const f = fixture("partner"); let calls = 0;
  f.client.rpc = ((_name: string, args: { p_product_id: number; p_expected_revision: number; p_image_path: string }) => {
    calls++; assert.equal(_name,"owner_attach_product_image"); assert.equal(args.p_product_id,-1); assert.equal(args.p_expected_revision,1);
    assert.match(args.p_image_path,/^products\/0\//);
    return { abortSignal: async () => ({ status:403,error:{code:"42501",message:"Owner access required"} }) };
  }) as never;
  await verifyDenial(f.client,{ userId,role:"partner",scope:"image" }); assert.equal(calls,1);
});

test("image validator verification requires its actual Owner denial, not a generic 403 or validation failure", async () => {
  for (const [status,body,passes] of [
    [403,{code:"42501",message:"Owner access required"},true],
    [403,{code:"origin_denied"},false],
    [400,{code:"invalid_image"},false],
    [404,{code:"NOT_FOUND"},false],
  ] as const) {
    const client = { functions: { invoke: async (_name: string, options: { body: { productId: number } }) => {
      assert.equal(_name,"validate-product-image"); assert.equal(options.body.productId,-1);
      return { error:{ context:new Response(JSON.stringify(body),{status}) } };
    } } } as unknown as SupabaseClient<Database>;
    if (passes) await verifyImageValidatorDenial(client); else await assert.rejects(verifyImageValidatorDenial(client));
  }
});
