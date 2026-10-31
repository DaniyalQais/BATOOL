"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { editorProduct, editorProducts, productUpdate, type EditorProduct, type ProductDraft } from "./product-editor.ts";

/** One authenticated query for the editor. Never import the build-time snapshot here. */
export function ownerCatalog(client: SupabaseClient<Database>) {
  return {
    async list(): Promise<EditorProduct[]> {
      const { data, error } = await client.from("products")
        .select("*,product_variants(product_id,size,stock_quantity)")
        .order("sort_order").order("id").limit(100).abortSignal(AbortSignal.timeout(20_000));
      if (error) throw error;
      return editorProducts(data);
    },
    async save(product: EditorProduct, draft: ProductDraft): Promise<EditorProduct> {
      const payload = productUpdate(product, draft);
      const { data, error } = await client.rpc("owner_update_catalog_product", payload);
      if (error) throw error;
      const result = editorProduct(data);
      if (result.id !== product.id || result.revision <= product.revision) throw new Error("Save confirmation invalid.");
      return result;
    },
  };
}
