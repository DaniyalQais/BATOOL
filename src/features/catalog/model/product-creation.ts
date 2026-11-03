import { productUpdate, type EditorProduct, type ProductDraft } from "./product-editor.ts";
import type { Database } from "./database.types.ts";
export type Creation = Database["public"]["Functions"]["owner_create_product_draft"]["Args"];
export function createDraftPayload(draft: ProductDraft, requestKey: string): Creation {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) throw new Error("A valid creation request key is required.");
  const values = productUpdate({ id: 12, managedDraft: true, revision: 1 } as EditorProduct, { ...draft, active: false });
  return { p_request_key: requestKey, p_name: values.p_name, p_description: values.p_description,
    p_price_minor: values.p_price_minor, p_stocks: values.p_stocks };
}
export function activationRequirements(product: EditorProduct, draft: ProductDraft): string[] {
  if (!product.draftSchemaReady) return [];
  const missing = [];
  if (!draft.subcategory) missing.push("Choose a collection.");
  if (!draft.tag?.trim()) missing.push("Enter a card label.");
  if (!draft.color || !/^#[0-9a-f]{6}$/i.test(draft.color)) missing.push("Enter a card accent color as #RRGGBB.");
  if (product.managedDraft && !product.uploadedImage) missing.push("Attach a validated photo for this product with image alt text.");
  if (product.managedDraft && product.isDemo) missing.push("Approve this product and its validated photo as genuine merchandise.");
  if (product.managedDraft && Object.values(draft.stock).some(value => value === null)) missing.push("Enter known quantities for S, M, L and XL; use zero for out-of-stock sizes.");
  if (draft.archived) missing.push("Unarchive this product before activation.");
  return missing;
}
