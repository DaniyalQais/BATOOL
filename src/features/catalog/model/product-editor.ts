import { availableSizes, type Size } from "./types.ts";
import { imageFromRow, type UploadedProductImage } from "../../../../supabase/functions/_shared/image-policy.ts";
export const editableProductIds = [0, 2, 3, 8, 7, 11] as const;
export const MAX_INTEGER = 2_147_483_647;
export type Stock = Record<Size, number | null>;
export interface EditorProduct {
  uploadedImage?: UploadedProductImage; imageSchemaReady?: boolean;
  id: number; slug: string; name: string; description: string; priceMinor: number;
  active: boolean; revision: number; stock: Stock; isDemo: boolean; imageNote: string | null;
}
export interface ProductDraft {
  name: string; description: string; price: string; active: boolean; stock: Record<Size, string | null>;
}
export interface ProductUpdate {
  p_product_id: number; p_expected_revision: number; p_name: string; p_description: string;
  p_price_minor: number; p_active: boolean; p_stocks: Stock;
}
export class EditorValidationError extends Error {}
function invalid(message: string): never { throw new EditorValidationError(message); }
export function priceToMinor(value: string): number {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return invalid("Enter a PKR amount with at most two decimal places, without commas or exponents.");
  const minor = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt(MAX_INTEGER)) return invalid("Price must be between PKR 0 and 21,474,836.47.");
  return Number(minor);
}
export function minorToPrice(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INTEGER) return invalid("Invalid stored price.");
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
export function stockToInteger(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d{1,10}$/.test(value.trim())) return invalid("Stock must be Unknown or a nonnegative whole number.");
  const stock = Number(value.trim());
  if (stock > MAX_INTEGER) return invalid("Stock cannot exceed 2,147,483,647.");
  return stock;
}
export function productDraft(product: EditorProduct): ProductDraft {
  return { name: product.name, description: product.description, price: minorToPrice(product.priceMinor), active: product.active,
    stock: Object.fromEntries(availableSizes.map(size => [size, product.stock[size] === null ? null : String(product.stock[size])])) as ProductDraft["stock"] };
}
export function productUpdate(product: EditorProduct, draft: ProductDraft): ProductUpdate {
  if (!editableProductIds.some(id => id === product.id) || !Number.isInteger(product.revision) || product.revision < 1 || product.revision > MAX_INTEGER) return invalid("Reload this product before editing.");
  const name = draft.name.trim(); const description = draft.description.trim();
  if (!name || Array.from(name).length > 120) return invalid("Product name must contain 1–120 characters.");
  if (!description || Array.from(description).length > 2000) return invalid("Description must contain 1–2000 characters.");
  if (typeof draft.active !== "boolean") return invalid("Choose a valid active status.");
  const keys = Object.keys(draft.stock);
  if (keys.length !== 4 || !availableSizes.every(size => keys.includes(size))) return invalid("Provide stock for S, M, L and XL only.");
  return { p_product_id: product.id, p_expected_revision: product.revision, p_name: name, p_description: description,
    p_price_minor: priceToMinor(draft.price), p_active: draft.active,
    p_stocks: Object.fromEntries(availableSizes.map(size => [size, stockToInteger(draft.stock[size])])) as Stock };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Invalid product response. Check the product-editing migration.");
  return value as Record<string, unknown>;
}
function storedInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_INTEGER) return invalid("Invalid numeric catalog data.");
  return value;
}
export function editorProduct(value: unknown): EditorProduct {
  const p = object(value);
  if (!editableProductIds.some(id => id === p.id) || typeof p.slug !== "string" || !p.slug || typeof p.name !== "string" || typeof p.description !== "string" ||
    p.currency !== "PKR" || typeof p.active !== "boolean" || typeof p.is_demo !== "boolean" || !(p.image_note === null || typeof p.image_note === "string")) return invalid("Invalid product response.");
  const revision = storedInteger(p.edit_revision);
  if (!revision) return invalid("Product revision missing. Apply the reviewed product-editing migration first.");
  if (!Array.isArray(p.product_variants) || p.product_variants.length !== 4) return invalid("Expected four existing size variants.");
  const stock = {} as Stock;
  for (const value of p.product_variants) {
    const variant = object(value);
    if (variant.product_id !== p.id || !availableSizes.some(size => size === variant.size) || Object.hasOwn(stock, String(variant.size))) return invalid("Invalid or duplicate size variant.");
    stock[variant.size as Size] = variant.stock_quantity === null ? null : storedInteger(variant.stock_quantity);
  }
  const result: EditorProduct = { id: p.id as number, slug: p.slug, name: p.name, description: p.description,
    priceMinor: storedInteger(p.price_minor), active: p.active, revision, stock, isDemo: p.is_demo, imageNote: p.image_note };
  const image = imageFromRow(p);
  if (image) result.uploadedImage = image;
  if (Object.hasOwn(p, "main_image_path")) result.imageSchemaReady = true;
  productUpdate(result, productDraft(result));
  return result;
}
export function editorProducts(value: unknown): EditorProduct[] {
  if (!Array.isArray(value)) return invalid("Invalid catalog response.");
  const products = value.map(editorProduct);
  if (products.length !== 6 || new Set(products.map(p => p.id)).size !== 6) return invalid("Expected the six existing catalog products. Reload or ask the administrator to inspect the database.");
  return products;
}
export function editorFailure(error: unknown): { kind: "validation" | "conflict" | "denied" | "setup" | "uncertain"; message: string } {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (error instanceof EditorValidationError) return { kind: "validation", message: error.message };
  if (code === "PT409") return { kind: "conflict", message: "This product changed since you loaded it. Reload the products, review the latest values, and reapply your edits." };
  if (["42501", "PGRST301", "PGRST303"].includes(String(code))) return { kind: "denied", message: "Owner access is unavailable or your session expired. Check your access and sign in again if needed." };
  if (["PGRST202", "PGRST204", "42703"].includes(String(code))) return { kind: "setup", message: "Product editing is not configured yet. Ask the administrator to review and apply the pending product-editing migration." };
  if (["22023", "22P02", "22003", "23514"].includes(String(code))) return { kind: "validation", message: "The database rejected these values. Check the name, description, PKR price and all four stock quantities." };
  return { kind: "uncertain", message: "The save outcome could not be confirmed. Check your connection, then reload the latest products before retrying; the request may have reached the database." };
}
