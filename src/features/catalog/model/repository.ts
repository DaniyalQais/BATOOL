import { products, getProductBySlug } from "./products";
/** Build-time catalog boundary. A CMS/API adapter belongs here when commerce is added. */
export const catalogRepository = {
  list: () => products,
  findBySlug: getProductBySlug,
};
