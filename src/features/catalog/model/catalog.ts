import {
  categoryLabels,
  stitchedCategories,
  type StitchedCategory,
  type Product,
  type SortOrder,
} from "./types.ts";
export function parseStitchedCategory(value: string | null): StitchedCategory {
  return stitchedCategories.find(category => category === value) ?? "All 3-Piece";
}
// Shopping destinations remain within the stitched collection.
export function collectionHref(category: StitchedCategory = "All 3-Piece"): string {
  const params = new URLSearchParams();
  if (category !== "All 3-Piece") params.set("category", category);
  return `/${params.size ? `?${params}` : ""}#collection`;
}
export function categoryHref(currentHref: string, category: StitchedCategory): string {
  const url = new URL(currentHref);
  if (category === "All 3-Piece") url.searchParams.delete("category");
  else url.searchParams.set("category", category);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function selectProducts(
  products: readonly Product[],
  query: string,
  sort: SortOrder,
  category: StitchedCategory = "All 3-Piece",
): Product[] {
  const term = query.trim().toLowerCase();
  const result = products.filter(
    (p) =>
      (category === "All 3-Piece" || p.subcategory === category) &&
      `${p.name} ${p.description} ${p.category} ${categoryLabels[p.category]} ${p.subcategory} ${p.tag}`.toLowerCase().includes(term),
  );
  if (sort !== "featured")
    result.sort((a, b) =>
      sort === "low" ? a.price - b.price : b.price - a.price,
    );
  return result;
}
