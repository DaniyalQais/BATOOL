import { object, type PaymentMethod } from "./contracts.ts";
export type Availability = { enabled: boolean; methods: PaymentMethod[] };
export const closedAvailability = (): Availability => ({ enabled: false, methods: [] });
export function availability(value: unknown): Availability {
  if (!object(value) || Object.keys(value).sort().join() !== "enabled,methods" || typeof value.enabled !== "boolean"
    || !Array.isArray(value.methods) || value.methods.some(m => !["cod", "easypaisa", "jazzcash"].includes(m))
    || new Set(value.methods).size !== value.methods.length || value.enabled !== (value.methods.length > 0)) throw new Error("Invalid checkout availability");
  return { enabled: value.enabled, methods: value.methods as PaymentMethod[] };
}
