import { type CartLine } from "./cart.ts";
import { getProductById } from "../../catalog/model/products.ts";
import { formatPrice } from "../../../lib/format.ts";

export const STORE_OWNER_WHATSAPP = process.env.NEXT_PUBLIC_STORE_WHATSAPP_NUMBER || "923008451024";

export interface OrderDataForWhatsApp {
  orderRef: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  notes?: string;
  paymentMethod: "cod" | "digital";
  items: readonly CartLine[];
  subtotal: number;
}

/**
 * Normalizes phone numbers to WhatsApp international format (e.g. 03424834128 -> 923424834128).
 */
export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

/**
 * Formats a clean order booking slip ready for TCS / courier dispatch.
 */
export function buildTcsSlipMessage(order: OrderDataForWhatsApp): string {
  const productLines = order.items
    .map((line) => {
      const prod = getProductById(line.id);
      const name = prod ? prod.name : `Product #${line.id}`;
      const linePrice = prod ? formatPrice(prod.price * line.quantity) : "";
      return `• ${name} (Size: ${line.size}, Qty: ${line.quantity}) ${linePrice ? `— ${linePrice}` : ""}`;
    })
    .join("\n");

  const paymentLabel = order.paymentMethod === "cod" ? "Cash on Delivery (COD)" : "Easypaisa / JazzCash";
  const today = new Date().toLocaleDateString("en-PK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return [
    "📦 *NEW ORDER - BATOOL ATELIER*",
    "-----------------------------------------",
    `*ORDER ID:* ${order.orderRef}`,
    `*DATE:* ${today}`,
    "",
    "👤 *CONSIGNEE & TCS SLIP DETAILS*",
    `*Customer Name:* ${order.name}`,
    `*Contact / WhatsApp:* ${order.phone}`,
    `*Destination City:* ${order.city}`,
    `*Delivery Address:* ${order.address}`,
    order.notes ? `*Landmark / Instructions:* ${order.notes}` : "",
    "",
    "👗 *ITEMS ORDERED*",
    productLines || "• Ensemble Details",
    "",
    "💰 *PAYMENT & BILLING*",
    `*Total Payable / COD:* ${formatPrice(order.subtotal)}`,
    `*Payment Method:* ${paymentLabel}`,
    "*Courier Service:* TCS Express Courier (Pakistan)",
    "-----------------------------------------",
    "_Auto-generated for TCS booking by Batool Checkout_",
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
}

/**
 * Builds a friendly Thank You message for the customer.
 */
export function buildCustomerThankYouMessage(order: OrderDataForWhatsApp): string {
  const paymentLabel = order.paymentMethod === "cod" ? "Cash on Delivery" : "Paid Online";
  return `Salam ${order.name}! Thank you for placing your order with BATOOL (Order #${order.orderRef}).
Total: ${formatPrice(order.subtotal)} (${paymentLabel}).
Your order has been received and is being prepared with utmost care. Our concierge will send your TCS tracking confirmation before dispatch.`;
}

/**
 * Generates the wa.me link for sending the TCS slip to the store owner.
 */
export function getStoreOwnerWhatsAppUrl(order: OrderDataForWhatsApp): string {
  const text = buildTcsSlipMessage(order);
  return `https://wa.me/${STORE_OWNER_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * Generates the wa.me link for the customer's thank you message.
 */
export function getCustomerWhatsAppUrl(order: OrderDataForWhatsApp): string {
  const text = buildCustomerThankYouMessage(order);
  const cleanPhone = formatWhatsAppPhone(order.phone);
  const targetNumber = cleanPhone || STORE_OWNER_WHATSAPP;
  return `https://wa.me/${targetNumber}?text=${encodeURIComponent(text)}`;
}
