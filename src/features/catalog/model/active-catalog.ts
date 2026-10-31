import { snapshot } from "./generated/catalog.ts";
import type { Product } from "./types.ts";

// Public, validated build snapshot. No SDK, credentials, or network code reaches clients.
export const products: readonly Product[] = snapshot.products;
export const catalogSource = snapshot.source;
export function getProductById(id: number): Product | undefined {
  return products.find((product) => product.id === id);
}
export function getProductBySlug(slug: string): Product | undefined {
  return products.find((product) => product.slug === slug);
}
