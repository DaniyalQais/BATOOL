import { shippingConfiguration, unconfiguredShipping, type ShippingConfiguration } from "./shipping.ts";
export type ApprovalState = "draft" | "approved";
export interface BusinessSettings {
  public_whatsapp: string | null;
  support_email: string | null;
  cod_enabled: boolean;
  easypaisa_enabled: boolean;
  easypaisa_account_title: string | null;
  easypaisa_account_number: string | null;
  jazzcash_enabled: boolean;
  jazzcash_account_title: string | null;
  jazzcash_account_number: string | null;
  shipping: ShippingConfiguration;
  payment_instructions: string;
  payment_instructions_state: ApprovalState;
  policy_text: string;
  policy_state: ApprovalState;
}
export interface NotificationSettings { emails: string[]; whatsapp_numbers: string[] }
export interface SettingsRecord<T> { revision: number; settings: T }

export function emptyBusinessSettings(): BusinessSettings {
  return {
    public_whatsapp: null, support_email: null, cod_enabled: false,
    easypaisa_enabled: false, easypaisa_account_title: null, easypaisa_account_number: null,
    jazzcash_enabled: false, jazzcash_account_title: null, jazzcash_account_number: null,
    shipping: unconfiguredShipping(),
    payment_instructions: "", payment_instructions_state: "draft", policy_text: "", policy_state: "draft",
  };
}
export const phonePattern = /^92[0-9]{10}$/;
const emailPattern = /^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f.]+(?:\.[^\s@\x00-\x1f\x7f.]+)+$/;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected settings object.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error("Unexpected or missing settings fields.");
}
function nullable(value: unknown, valid: (text: string) => boolean, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value !== value.trim() || !valid(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
function phone(value: unknown) { return nullable(value, text => phonePattern.test(text), "WhatsApp number; use 92 followed by 10 digits"); }
function email(value: unknown) { return nullable(value, text => text.length <= 254 && emailPattern.test(text), "email address"); }
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Explicit payment enabled status required.");
  return value;
}
function document(text: unknown, state: unknown): [string, ApprovalState] {
  if (typeof text !== "string" || text.length > 8000 || text !== text.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) ||
      (state !== "draft" && state !== "approved") || (state === "approved" && !text)) throw new Error("Text must be at most 8000 characters; approved text cannot be blank.");
  return [text, state];
}
export function businessSettings(value: unknown): BusinessSettings {
  const row = object(value);
  exactKeys(row, Object.keys(emptyBusinessSettings()));
  const result = emptyBusinessSettings();
  result.shipping = shippingConfiguration(row.shipping);
  result.public_whatsapp = phone(row.public_whatsapp);
  result.support_email = email(row.support_email);
  result.cod_enabled = boolean(row.cod_enabled);
  for (const provider of ["easypaisa", "jazzcash"] as const) {
    result[`${provider}_enabled`] = boolean(row[`${provider}_enabled`]);
    result[`${provider}_account_title`] = nullable(row[`${provider}_account_title`], text => text.length >= 1 && text.length <= 120 && !/[\x00-\x1f\x7f]/.test(text), "account title");
    result[`${provider}_account_number`] = nullable(row[`${provider}_account_number`], text => /^[0-9]{7,24}$/.test(text), "account number; use 7–24 digits");
    if (result[`${provider}_enabled`] && (!result[`${provider}_account_title`] || !result[`${provider}_account_number`])) throw new Error(`${provider} requires an account title and number before enabling.`);
  }
  [result.payment_instructions, result.payment_instructions_state] = document(row.payment_instructions, row.payment_instructions_state);
  [result.policy_text, result.policy_state] = document(row.policy_text, row.policy_state);
  return result;
}
export function notificationSettings(value: unknown): NotificationSettings {
  const row = object(value);
  exactKeys(row, ["emails", "whatsapp_numbers"]);
  function recipients(value: unknown, validate: (item: unknown) => string | null): string[] {
    if (!Array.isArray(value) || value.length > 10) throw new Error("Use at most 10 recipients per channel.");
    const items = value.map(item => { const result = validate(item); if (result === null) throw new Error("Recipient cannot be null."); return result; });
    if (new Set(items.map(item => item.toLowerCase())).size !== items.length) throw new Error("Duplicate recipients are not permitted.");
    return items;
  }
  return { emails: recipients(row.emails, email), whatsapp_numbers: recipients(row.whatsapp_numbers, phone) };
}
export function settingsRecord<T>(value: unknown, parse: (value: unknown) => T): SettingsRecord<T> {
  const row = object(value);
  if (!Number.isInteger(row.revision) || (row.revision as number) < 1 || (row.revision as number) > 2147483647) throw new Error("Invalid settings revision.");
  return { revision: row.revision as number, settings: parse(row.settings) };
}
export function settingsFailure(error: unknown): { message: string; reload: boolean } {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "PT409") return { message: "Settings changed. Reload before saving again; your edits are still shown.", reload: true };
  if (code === "42501" || code === "PGRST301" || code === "PGRST303") return { message: "Owner access is required. Check your session and reload.", reload: true };
  if (code === "22023" || code === "23514") return { message: "Settings were rejected by validation. Check the fields and approval states.", reload: false };
  return { message: "Save could not be confirmed. Reload before retrying; the save may have reached the database.", reload: true };
}
