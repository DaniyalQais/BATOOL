export const fulfillmentStatuses = ["pending", "confirmed", "packing", "shipped", "delivered", "cancelled"] as const;
export const paymentStatuses = ["unpaid", "failed", "paid", "refunded"] as const;
export type FulfillmentStatus = typeof fulfillmentStatuses[number];
export type PaymentStatus = typeof paymentStatuses[number];
export interface OrderReport {
  id: string; created_at: string; updated_at: string; currency: "PKR";
  subtotal_minor: string; shipping_minor: string; tax_minor: string; discount_minor: string; total_minor: string;
  fulfillment_status: FulfillmentStatus; payment_status: PaymentStatus; status_revision: string;
}
export interface OrderCustomer {
  order_id: string; recipient_name: string; phone: string; email: string | null;
  address_line1: string; address_line2: string | null; city: string;
  region: string | null; postal_code: string | null; country_code: string;
}
export interface OrderItem {
  order_id: string; line_number: number; product_id: number; selected_size: "S" | "M" | "L" | "XL";
  product_name: string; unit_price_minor: string; quantity: number; line_total_minor: string;
}
export interface OrderHistory {
  order_id: string; revision: string; status_kind: "fulfillment" | "payment";
  from_status: string | null; to_status: string; changed_at: string;
  actor_user_id: string | null; actor_db_role: string; actor_session_role: string;
}
export interface Page<T> { rows: T[]; hasNext: boolean }
export interface OrderFilters { fulfillment: "all" | FulfillmentStatus; payment: "all" | PaymentStatus }
export const pageSize = 20;
export class OrderAccessDenied extends Error {}
export class OrderDataError extends Error {}
function invalid(): never { throw new OrderDataError("Order data could not be verified. Ask the administrator to inspect the order configuration."); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) return invalid(); return value; }
function optional(value: unknown): string | null { return value === null ? null : text(value); }
export function uuid(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) return invalid();
  return result;
}
function date(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) return invalid(); return result; }
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > 2_147_483_647) return invalid();
  return value;
}
export function minorUnits(value: unknown): string {
  // Cast bigint columns to text in SELECT; never accept a rounded JS number.
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > 9_223_372_036_854_775_807n) return invalid();
  return value;
}
function revision(value: unknown): string { const result = minorUnits(value); if (result === "0") return invalid(); return result; }
export function formatPKR(value: string): string {
  const amount = BigInt(minorUnits(value));
  return `PKR ${(amount / 100n).toLocaleString("en-PK")}.${String(amount % 100n).padStart(2, "0")}`;
}
export function orderReport(value: unknown): OrderReport {
  const r = record(value);
  if (r.currency !== "PKR" || !fulfillmentStatuses.includes(r.fulfillment_status as FulfillmentStatus) || !paymentStatuses.includes(r.payment_status as PaymentStatus)) return invalid();
  const report: OrderReport = {
    id: uuid(r.id), created_at: date(r.created_at), updated_at: date(r.updated_at), currency: "PKR",
    subtotal_minor: minorUnits(r.subtotal_minor), shipping_minor: minorUnits(r.shipping_minor), tax_minor: minorUnits(r.tax_minor),
    discount_minor: minorUnits(r.discount_minor), total_minor: minorUnits(r.total_minor),
    fulfillment_status: r.fulfillment_status as FulfillmentStatus, payment_status: r.payment_status as PaymentStatus, status_revision: revision(r.status_revision),
  };
  if (BigInt(report.discount_minor) > BigInt(report.subtotal_minor) || BigInt(report.total_minor) !== BigInt(report.subtotal_minor) + BigInt(report.shipping_minor) + BigInt(report.tax_minor) - BigInt(report.discount_minor)) return invalid();
  return report;
}
export function orderCustomer(value: unknown, orderId: string): OrderCustomer {
  const r = record(value);
  if (r.order_id !== orderId || typeof r.country_code !== "string" || !/^[A-Z]{2}$/.test(r.country_code)) return invalid();
  return { order_id: uuid(r.order_id), recipient_name: text(r.recipient_name), phone: text(r.phone), email: optional(r.email),
    address_line1: text(r.address_line1), address_line2: optional(r.address_line2), city: text(r.city), region: optional(r.region), postal_code: optional(r.postal_code), country_code: r.country_code };
}
export function orderItem(value: unknown, orderId: string): OrderItem {
  const r = record(value);
  if (r.order_id !== orderId || !["S", "M", "L", "XL"].includes(String(r.selected_size))) return invalid();
  const item: OrderItem = { order_id: uuid(r.order_id), line_number: integer(r.line_number, 1), product_id: integer(r.product_id), selected_size: r.selected_size as OrderItem["selected_size"],
    product_name: text(r.product_name), unit_price_minor: minorUnits(r.unit_price_minor), quantity: integer(r.quantity, 1), line_total_minor: minorUnits(r.line_total_minor) };
  if (BigInt(item.line_total_minor) !== BigInt(item.unit_price_minor) * BigInt(item.quantity)) return invalid();
  return item;
}
export function orderHistory(value: unknown, orderId: string): OrderHistory {
  const r = record(value);
  if (r.order_id !== orderId || (r.status_kind !== "fulfillment" && r.status_kind !== "payment")) return invalid();
  const allowed: readonly string[] = r.status_kind === "fulfillment" ? fulfillmentStatuses : paymentStatuses;
  const from = optional(r.from_status); const to = text(r.to_status); const rev = revision(r.revision);
  if (!allowed.includes(to) || (from !== null && !allowed.includes(from)) ||
    (rev === "1" ? from !== null || to !== (r.status_kind === "fulfillment" ? "pending" : "unpaid") : from === null || from === to)) return invalid();
  return { order_id: uuid(r.order_id), revision: rev, status_kind: r.status_kind, from_status: from, to_status: to, changed_at: date(r.changed_at),
    actor_user_id: r.actor_user_id === null ? null : uuid(r.actor_user_id), actor_db_role: text(r.actor_db_role), actor_session_role: text(r.actor_session_role) };
}
export function resultPage<T>(value: unknown, map: (row: unknown) => T): Page<T> {
  if (!Array.isArray(value) || value.length > pageSize + 1) return invalid();
  const rows = value.map(map);
  return { rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize };
}
export function orderFailure(error: unknown): { denied: boolean; message: string } {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (error instanceof OrderAccessDenied || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(code))
    return { denied: true, message: "Order access is unavailable or your session changed. Check your dashboard access and sign in again if needed." };
  if (error instanceof OrderDataError) return { denied: false, message: error.message };
  return { denied: false, message: "Orders could not be loaded. Check your connection and retry. If this continues, ask the administrator to check the order configuration." };
}
