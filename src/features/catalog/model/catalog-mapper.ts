import { availableSizes, reservedProductIds, stitchedCategories, type Product, type Size } from "./types.ts";
import { imageFromRow } from "../../../../supabase/functions/_shared/image-policy.ts";

function fail(): never { throw new Error("Invalid catalog response; check catalog schema and data."); }
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return fail();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail();
  return value;
}
function nullableText(value: unknown): string | undefined {
  return value === null ? undefined : text(value);
}
function timestamp(value: unknown) {
  if (!Number.isFinite(Date.parse(text(value)))) fail();
}
const imageSlugs = ["gulnaar", "meher", "saba", "noor", "mira", "zeenat"];

/** Runtime validation stays mandatory even with the typed Supabase schema. */
export function mapCatalog(input: unknown): readonly Product[] {
  if (!Array.isArray(input)) return fail();
  const ids = new Set<number>();
  const slugs = new Set<string>();
  return input.map((value): Product => {
    const p = row(value);
    const id = integer(p.id);
    if (reservedProductIds.some((reserved) => reserved === id)) fail();
    const slug = text(p.slug);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ids.has(id) || slugs.has(slug)) fail();
    ids.add(id); slugs.add(slug);
    if (p.active !== true || typeof p.is_demo !== "boolean" || p.category !== "Stitched" || p.piece_count !== 3 || p.currency !== "PKR") fail();
    if (!stitchedCategories.slice(1).some((category) => category === p.subcategory)) fail();
    if (!imageSlugs.includes(text(p.image_slug))) fail();
    if (!/^#[0-9a-f]{6}$/i.test(text(p.color))) fail();
    if (p.card_position !== null && !/^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(text(p.card_position))) fail();
    if (p.card_zoom !== null && (typeof p.card_zoom !== "number" || !Number.isFinite(p.card_zoom) || p.card_zoom < 1 || p.card_zoom > 3)) fail();
    integer(p.sort_order); timestamp(p.created_at); timestamp(p.updated_at);
    if (!Array.isArray(p.product_variants)) fail();
    const seen = new Set<string>();
    const variants = p.product_variants.map((value) => {
      const v = row(value);
      if (v.product_id !== id || v.active !== true || !availableSizes.some((size) => size === v.size) || seen.has(String(v.size))) fail();
      seen.add(String(v.size));
      timestamp(v.created_at); timestamp(v.updated_at);
      return { size: v.size as Size, stockQuantity: v.stock_quantity === null ? null : integer(v.stock_quantity) };
    }).sort((a, b) => availableSizes.indexOf(a.size) - availableSizes.indexOf(b.size));
    return {
      id, slug, name: text(p.name), description: text(p.description),
      price: integer(p.price_minor) / 100, currency: "PKR", isDemo: p.is_demo,
      imageSlug: text(p.image_slug), imageNote: nullableText(p.image_note), uploadedImage: imageFromRow(p),
      cardPosition: nullableText(p.card_position), cardZoom: p.card_zoom === null ? undefined : p.card_zoom as number,
      category: "Stitched", subcategory: p.subcategory as Product["subcategory"],
      color: text(p.color), tag: text(p.tag), variants,
      // Unknown stock permits the existing demo flow; explicit zero does not.
      sizes: variants.filter((v) => v.stockQuantity !== 0).map((v) => v.size),
    };
  });
}
