import type { CartLine } from "./cart.ts";

export const cartLineKey = (line: Pick<CartLine, "id" | "size">) => `${line.id}:${line.size}`;

/** Follow the former order: next surviving line, previous line, then a newly added line. */
export function removalFocusTarget(before: readonly CartLine[], after: readonly CartLine[], removed: string): string | null {
  if (!after.length) return null;
  const index = before.findIndex((line) => cartLineKey(line) === removed);
  const remaining = new Set(after.map(cartLineKey));
  for (const line of before.slice(index + 1)) {
    if (remaining.has(cartLineKey(line))) return cartLineKey(line);
  }
  for (let n = index - 1; n >= 0; n--) {
    if (remaining.has(cartLineKey(before[n]))) return cartLineKey(before[n]);
  }
  return cartLineKey(after[0]);
}
