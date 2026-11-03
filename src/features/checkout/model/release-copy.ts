// Copy follows public build wiring, never claims runtime readiness or payment.
// Sample provenance is independent of release flags and must not be hidden.
export function checkoutIsWired(): boolean {
  return process.env.NEXT_PUBLIC_CHECKOUT_RELEASE === "true" && !!process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT;
}
export function isSampleItem(product?: { readonly isDemo?: boolean }): boolean {
  return product?.isDemo !== false;
}
export function releaseCopy(wired: boolean, sample: boolean) {
  return {
    availability: wired
      ? "Check checkout for current ordering and payment availability. Prices, stock and shipping are confirmed there."
      : "Orders and payments are not enabled.",
    item: sample
      ? "Sample product and illustrative price. This item is for preview and cannot be ordered."
      : wired
        ? "Prices and listed sizes are a catalog snapshot. Checkout confirms current prices, stock and shipping."
        : "Catalog preview. Orders and payments are not enabled.",
    addLabel: sample ? "Add to demo bag" : "Add to bag",
    bagName: sample ? "demo bag" : "bag",
    collection: sample
      ? "Pieces marked as samples have illustrative imagery and prices and cannot be ordered."
      : "Explore the catalog. Listed sizes and stock are a snapshot; checkout checks current availability.",
    bagNotice: wired
      ? "Adding to your bag does not place an order or confirm payment."
      : "No order or payment is submitted from this bag.",
  };
}
