import { cartSubtotal, type CartLine } from "./cart.ts";
import { shippingConfiguration, unconfiguredShipping, type ShippingConfiguration } from "../../settings/model/shipping.ts";

// Display-only bag arithmetic. A future checkout must quote from trusted backend
// settings and snapshot the charge, never trust a browser/build-time total.
export function checkoutTotals(items: readonly CartLine[], privilegeDiscount = false, configuration: ShippingConfiguration = unconfiguredShipping()) {
  const settings = shippingConfiguration(configuration);
  const subtotal = cartSubtotal(items);
  const discount = privilegeDiscount ? Math.round(subtotal * 0.1) : 0;
  const shipping = settings.mode === "unconfigured" ? null : items.length ? settings.fee_minor! / 100 : 0;
  return { subtotal, discount, shipping, total: shipping === null ? null : Math.max(0, subtotal - discount + shipping) };
}
