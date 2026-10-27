// Preserve the Quick Add interface while sharing its policy with product pages.
export {
  initialPurchaseOption as initialQuickOption,
  validPurchaseOption as validQuickOption,
  submitPurchase as submitQuickAdd,
} from "./purchase.ts";
