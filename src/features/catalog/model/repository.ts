import { products, getProductBySlug } from "./active-catalog";
/** Shared build-time snapshot, also used by cart reconciliation. */
export const catalogRepository = {
  list: () => products,
  findBySlug: getProductBySlug,
};
