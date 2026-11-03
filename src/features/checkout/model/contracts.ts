export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PaymentMethod = "cod" | "easypaisa" | "jazzcash";
export type DeliveryDetails = {
  recipient_name: string; phone: string; email: string | null;
  address_line1: string; address_line2: string | null; city: string;
  region: string | null; postal_code: string | null; country_code: "PK";
};
export type Quote = {
  quote_id: string; expires_at: string; currency: "PKR";
  lines: { id: number; size: "S" | "M" | "L" | "XL"; quantity: number; name: string; unit_price_minor: string }[];
  subtotal_minor: string; shipping_minor: string; total_minor: string;
  payment_method: PaymentMethod; shipping_mode: "free" | "flat_rate";
  settings_revision: number; payment_instructions: string; policy_text: string;
};
export type Receipt = {
  order_id: string; quote_id: string; currency: "PKR";
  subtotal_minor: string; shipping_minor: string; total_minor: string;
  payment_status: "unpaid" | "failed" | "paid" | "refunded";
};
export type IntentResolution = { status: "committed"; receipt: Receipt } | {
  status: "retired"; quote_id: string; resolution_id: string; replacement_key: string; replacement_quote: Quote | null;
};
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function isReceipt(value: unknown): value is Receipt {
  if (!object(value) || !exact(value, ["order_id", "quote_id", "currency", "subtotal_minor", "shipping_minor", "total_minor", "payment_status"])
    || !uuid.test(String(value.order_id)) || !uuid.test(String(value.quote_id)) || value.currency !== "PKR"
    || !["unpaid", "failed", "paid", "refunded"].includes(String(value.payment_status))) return false;
  for (const field of ["subtotal_minor", "shipping_minor", "total_minor"]) {
    if (typeof value[field] !== "string" || !/^(0|[1-9][0-9]{0,17})$/.test(value[field])) return false;
  }
  return BigInt(value.subtotal_minor as string) + BigInt(value.shipping_minor as string) === BigInt(value.total_minor as string);
}
export function isQuote(value: unknown): value is Quote {
  if (!object(value) || !exact(value, ["quote_id", "expires_at", "currency", "lines", "subtotal_minor", "shipping_minor", "total_minor",
    "payment_method", "shipping_mode", "settings_revision", "payment_instructions", "policy_text"])
    || !uuid.test(String(value.quote_id)) || value.currency !== "PKR"
    || typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at))
    || !["cod", "easypaisa", "jazzcash"].includes(String(value.payment_method))
    || !["free", "flat_rate"].includes(String(value.shipping_mode))
    || !Number.isInteger(value.settings_revision) || Number(value.settings_revision) < 1
    || typeof value.payment_instructions !== "string" || typeof value.policy_text !== "string"
    || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 30) return false;
  let subtotal = 0n;
  const seen = new Set();
  for (const line of value.lines) {
    if (!object(line) || !exact(line, ["id", "size", "quantity", "name", "unit_price_minor"])
      || !Number.isSafeInteger(line.id) || Number(line.id) < 0 || typeof line.name !== "string"
      || !["S", "M", "L", "XL"].includes(String(line.size)) || !Number.isInteger(line.quantity)
      || Number(line.quantity) < 1 || Number(line.quantity) > 99
      || typeof line.unit_price_minor !== "string" || !/^(0|[1-9][0-9]{0,9})$/.test(line.unit_price_minor)) return false;
    const key = `${line.id}:${line.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    subtotal += BigInt(line.unit_price_minor) * BigInt(line.quantity as number);
  }
  return isReceipt({ order_id: value.quote_id, quote_id: value.quote_id, currency: value.currency,
    subtotal_minor: value.subtotal_minor, shipping_minor: value.shipping_minor, total_minor: value.total_minor, payment_status: "unpaid" })
    && subtotal.toString() === value.subtotal_minor
    && (value.shipping_mode !== "free" || value.shipping_minor === "0");
}
export function matchesQuote(receipt: Receipt, quote: Pick<Quote, "quote_id" | "subtotal_minor" | "shipping_minor" | "total_minor">) {
  return receipt.quote_id === quote.quote_id && receipt.subtotal_minor === quote.subtotal_minor
    && receipt.shipping_minor === quote.shipping_minor && receipt.total_minor === quote.total_minor;
}
export function isIntentResolution(value: unknown): value is IntentResolution {
  if (!object(value)) return false;
  if (value.status === "committed") return exact(value, ["status", "receipt"]) && isReceipt(value.receipt);
  return value.status === "retired" && exact(value, ["status", "quote_id", "resolution_id", "replacement_key", "replacement_quote"])
    && typeof value.quote_id === "string" && uuid.test(value.quote_id)
    && typeof value.resolution_id === "string" && uuid.test(value.resolution_id)
    && typeof value.replacement_key === "string" && uuid.test(value.replacement_key)
    && (value.replacement_quote === null || (isQuote(value.replacement_quote) && value.replacement_quote.quote_id !== value.quote_id));
}
