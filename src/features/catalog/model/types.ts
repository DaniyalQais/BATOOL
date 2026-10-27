export const categories = ["Stitched"] as const;
export type Category = (typeof categories)[number];
export const categoryLabels: Record<Category, string> = {
  Stitched: "Stitched",
};
export const stitchedCategories = ["All 3-Piece", "Daily Pret", "Festive Edit", "Luxury Formals"] as const;
export type StitchedCategory = (typeof stitchedCategories)[number];
export type SortOrder = "featured" | "low" | "high";
export const availableSizes = ["S", "M", "L", "XL"] as const;
export type Size = (typeof availableSizes)[number];
export interface Product {
  readonly id: number;
  readonly slug: string;
  readonly imageSlug: string;
  readonly imageNote?: string;
  readonly cardPosition?: string;
  readonly cardZoom?: number;
  readonly name: string;
  readonly category: Category;
  readonly subcategory: Exclude<StitchedCategory, "All 3-Piece">;
  readonly description: string;
  readonly price: number;
  readonly color: string;
  readonly tag: string;
  readonly sizes: readonly Size[];
}
