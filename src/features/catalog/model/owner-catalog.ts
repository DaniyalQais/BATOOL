"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { editorProduct, editorProducts, productUpdate, type EditorProduct, type ProductDraft } from "./product-editor.ts";
import type { Creation } from "./product-creation.ts";

/** One authenticated query for the editor. Never import the build-time snapshot here. */
export function ownerCatalog(client: SupabaseClient<Database>) {
  return {
    async approveMerchandise(product: EditorProduct): Promise<EditorProduct> {
      const { data, error } = await client.rpc("owner_approve_catalog_merchandise", {
        p_product_id: product.id, p_expected_revision: product.revision, p_confirmed: true,
      });
      if (error) throw error;
      const saved = editorProduct(data);
      if (saved.id !== product.id || saved.revision <= product.revision || saved.isDemo || !saved.uploadedImage) throw new Error("Merchandise approval confirmation uncertain; reload before retrying.");
      return saved;
    },
    async list(): Promise<EditorProduct[]> {
      const rows: unknown[] = [];
      for (let from = 0; ; from += 100) {
        const { data, error } = await client.from("products")
          .select("*,product_variants(product_id,size,stock_quantity)")
          .order("sort_order").order("id").range(from, from + 99).abortSignal(AbortSignal.timeout(20_000));
        if (error) throw error;
        if (!data) throw new Error("Missing catalog response.");
        rows.push(...data);
        if (data.length < 100) break;
      }
      return editorProducts(rows);
    },
    async create(payload: Creation): Promise<EditorProduct> {
      const { data, error } = await client.rpc("owner_create_product_draft", payload);
      if (error) throw error;
      try {
        const saved = editorProduct(data);
        // A replay can return a product edited since its initial creation.
        if (!saved.managedDraft || saved.id < 12) throw new Error("Unexpected product identity.");
        return saved;
      } catch {
        // An invalid success body may follow a committed create. Keep the same key.
        throw new Error("Draft confirmation invalid; retry only the same creation request.");
      }
    },
    async save(product: EditorProduct, draft: ProductDraft): Promise<EditorProduct> {
      const payload = productUpdate(product, draft);
      const { data, error } = product.draftSchemaReady
        ? await client.rpc("owner_save_catalog_product", { ...payload, p_subcategory: draft.subcategory?.trim() || null,
          p_color: draft.color?.trim() || null, p_tag: draft.tag?.trim() || null, p_archived: draft.archived ?? false })
        : await client.rpc("owner_update_catalog_product", payload);
      if (error) throw error;
      try {
        const result = editorProduct(data);
        if (result.id !== product.id || result.revision <= product.revision) throw new Error("Save confirmation invalid.");
        return result;
      } catch { throw new Error("Save confirmation invalid; outcome uncertain. Reload before retrying."); }
    },
  };
}
