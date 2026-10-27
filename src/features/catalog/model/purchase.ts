import type { Product, Size } from "./types.ts";

/** Every stitched piece requires an explicit size selection. */
export function initialPurchaseOption(_product: Product): Size | null {
  return null;
}

export function validPurchaseOption(product: Product, option: string | null): Size | undefined {
  return product.sizes.find((size) => size === option);
}

// Both purchase surfaces supply the existing cart action; no cart state is duplicated.
export function submitPurchase(
  product: Product,
  option: string | null,
  add: (id: number, size: Size) => boolean,
): { success: boolean; message: string } {
  const size = validPurchaseOption(product, option);
  if (!size) return { success: false, message: "Choose a valid size before adding this piece." };
  const success = add(product.id, size);
  return {
    success,
    message: success
      ? `${product.name} (${size}) added to your demo bag.`
      : `The maximum quantity for ${product.name} (${size}) is already in your bag.`,
  };
}
