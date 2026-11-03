export interface ShippingConfiguration {
  country_code: "PK";
  currency: "PKR";
  mode: "unconfigured" | "free" | "flat_rate";
  // Integer paisa. Null is distinct from explicitly configured free delivery.
  fee_minor: number | null;
}
export const maxShippingFeeMinor = 2147483647;
export function unconfiguredShipping(): ShippingConfiguration {
  return { country_code: "PK", currency: "PKR", mode: "unconfigured", fee_minor: null };
}
export function shippingConfiguration(value: unknown): ShippingConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shipping configuration.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || !["country_code", "currency", "mode", "fee_minor"].every(key => Object.hasOwn(row, key)) ||
      row.country_code !== "PK" || row.currency !== "PKR") throw new Error("Shipping must cover Pakistan in PKR with an explicit mode and fee.");
  if (row.mode === "unconfigured" && row.fee_minor === null) return unconfiguredShipping();
  if ((row.mode === "free" && row.fee_minor === 0) ||
      (row.mode === "flat_rate" && typeof row.fee_minor === "number" && Number.isInteger(row.fee_minor) && row.fee_minor >= 0 && row.fee_minor <= maxShippingFeeMinor)) {
    return { country_code: "PK", currency: "PKR", mode: row.mode, fee_minor: row.fee_minor as number };
  }
  throw new Error("Choose unconfigured with no fee, free delivery with PKR 0, or a nonnegative flat fee up to PKR 21474836.47.");
}
/** Convert the Owner's decimal PKR input exactly, without rounding a partial fee. */
export function parseShippingFeePKR(input: string): number {
  const text = input.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(text)) throw new Error("Enter a nonnegative PKR shipping fee with at most two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > BigInt(maxShippingFeeMinor)) throw new Error("Shipping fee exceeds PKR 21474836.47.");
  return Number(minor);
}
export function shippingFeePKR(feeMinor: number): string {
  return `${Math.floor(feeMinor / 100)}.${String(feeMinor % 100).padStart(2, "0")}`;
}
/** Public build snapshot text, never an authoritative checkout quotation. */
export function shippingDescription(value: ShippingConfiguration): string {
  const shipping = shippingConfiguration(value);
  if (shipping.mode === "unconfigured") return "Delivery across Pakistan. Shipping is not configured yet.";
  if (shipping.mode === "free") return "Free delivery across Pakistan (PKR 0).";
  return `Delivery across Pakistan. Flat shipping fee: PKR ${shippingFeePKR(shipping.fee_minor!)}.`;
}
