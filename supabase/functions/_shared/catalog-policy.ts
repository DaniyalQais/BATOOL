// Existing IDs and local photography are permanent identities, not reusable slots.
export const legacyProductImages: Readonly<Record<number, string>> = {
  0: "gulnaar", 2: "meher", 3: "saba", 7: "mira", 8: "noor", 11: "zeenat",
};
export function catalogProductId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value <= 2_147_483_647 &&
    (Object.hasOwn(legacyProductImages, value) || value >= 12);
}
