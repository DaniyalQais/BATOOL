import { getProductById } from "../../catalog/model/products.ts";
import type { Size } from "../../catalog/model/types.ts";
export interface CartLine {
  readonly id: number;
  readonly size: Size;
  readonly quantity: number;
}
export const MAX_QUANTITY = 99;
export function parseCart(raw: string | null): readonly CartLine[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return [];
    const clean: CartLine[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const product = getProductById(item.id);
      // Accept the previous preview's qty field once, preserving existing bags.
      const quantity = item.quantity ?? item.qty;
      if (
        !product ||
        !product.sizes.includes(item.size) ||
        !Number.isInteger(quantity) ||
        quantity < 1
      )
        continue;
      const existing = clean.find(
        (x) => x.id === item.id && x.size === item.size,
      );
      if (existing) continue;
      clean.push({
        id: product.id,
        size: item.size,
        quantity: Math.min(quantity, MAX_QUANTITY),
      });
    }
    return clean;
  } catch {
    return [];
  }
}
export function addLine(
  lines: readonly CartLine[],
  id: number,
  size: Size,
): readonly CartLine[] {
  const product = getProductById(id);
  if (!product || !product.sizes.includes(size)) return lines;
  const existing = lines.find((x) => x.id === id && x.size === size);
  if (existing?.quantity === MAX_QUANTITY) return lines;
  return existing
    ? lines.map((x) =>
        x === existing ? { ...x, quantity: x.quantity + 1 } : x,
      )
    : [...lines, { id, size, quantity: 1 }];
}
export function changeQuantity(
  lines: readonly CartLine[],
  id: number,
  size: Size,
  delta: number,
): readonly CartLine[] {
  if (!Number.isInteger(delta) || delta === 0) return lines;
  const target = lines.find((x) => x.id === id && x.size === size);
  if (!target || (target.quantity === MAX_QUANTITY && delta > 0)) return lines;
  return lines
    .map((x) =>
      x === target
        ? { ...x, quantity: Math.min(MAX_QUANTITY, x.quantity + delta) }
        : x,
    )
    .filter((x) => x.quantity > 0);
}
export const cartCount = (lines: readonly CartLine[]) =>
  lines.reduce((sum, x) => sum + x.quantity, 0);
export const cartSubtotal = (lines: readonly CartLine[]) =>
  lines.reduce(
    (sum, x) => sum + (getProductById(x.id)?.price ?? 0) * x.quantity,
    0,
  );
