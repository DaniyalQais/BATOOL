import { businessSettings, emptyBusinessSettings } from "./settings.ts";
import type { ShippingConfiguration } from "./shipping.ts";

export interface PublicBusinessSettings {
  public_whatsapp: string | null;
  support_email: string | null;
  currency: "PKR";
  stock_model: "ready_stock";
  shipping: ShippingConfiguration;
  payment_instructions: string | null;
  policy_text: string | null;
  checkout_enabled: false;
  available_payment_methods: [];
}
// An explicit projection: never spread a database row into public snapshots.
export function publicSettings(value: unknown): PublicBusinessSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid public settings.");
  const row = value as Record<string, unknown>;
  if (row.currency !== "PKR" || row.stock_model !== "ready_stock" || row.checkout_enabled !== false ||
      !Array.isArray(row.available_payment_methods) || row.available_payment_methods.length !== 0 ||
      !(row.payment_instructions === null || typeof row.payment_instructions === "string") ||
      !(row.policy_text === null || typeof row.policy_text === "string")) throw new Error("Invalid public settings.");
  const checked = businessSettings({ ...emptyBusinessSettings(), public_whatsapp: row.public_whatsapp,
    support_email: row.support_email, shipping: row.shipping,
    payment_instructions: row.payment_instructions ?? "", payment_instructions_state: row.payment_instructions === null ? "draft" : "approved",
    policy_text: row.policy_text ?? "", policy_state: row.policy_text === null ? "draft" : "approved" });
  return {
    public_whatsapp: checked.public_whatsapp, support_email: checked.support_email,
    currency: "PKR", stock_model: "ready_stock", shipping: checked.shipping,
    payment_instructions: row.payment_instructions as string | null, policy_text: row.policy_text as string | null,
    checkout_enabled: false, available_payment_methods: [],
  };
}
export function unpublishedPublicSettings(): PublicBusinessSettings {
  return publicSettings({ ...emptyBusinessSettings(), currency: "PKR", stock_model: "ready_stock",
    payment_instructions: null, policy_text: null, checkout_enabled: false, available_payment_methods: [] });
}
