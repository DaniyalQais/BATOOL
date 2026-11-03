import type { NextConfig } from "next";
import path from "node:path";
import { prepareCatalog } from "./scripts/prepare-catalog.ts";
import { preparePublicSettings } from "./scripts/prepare-settings.ts";
import { publicAuthConfig } from "./src/features/auth/model/public-config.ts";
import { localCheckoutEndpoint } from "./src/features/checkout/model/local-config.ts";
import { productionCheckoutConfig } from "./src/features/checkout/model/production-config.ts";
const nextConfig: NextConfig = {
  output: "export",
  // This standalone app owns its dependencies; the parent lockfile is unrelated.
  turbopack: { root: path.resolve(__dirname) },
  trailingSlash: true,
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    deviceSizes: [384],
    imageSizes: [192],
  },
};
export default async function config() {
  // Expose validated public Auth and the optional loopback test URL only.
  const auth = publicAuthConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  await prepareCatalog();
  await preparePublicSettings();
  const checkout = productionCheckoutConfig(process.env.BATOOL_CHECKOUT_ENDPOINT, process.env.SUPABASE_URL,
    process.env.BATOOL_CHECKOUT_RELEASE, process.env.BATOOL_RECOVERY_RELEASE);
  return {
    ...nextConfig,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: auth?.url ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: auth?.key ?? "",
      NEXT_PUBLIC_LOCAL_CHECKOUT_URL: localCheckoutEndpoint(process.env.BATOOL_LOCAL_CHECKOUT_URL),
      NEXT_PUBLIC_CHECKOUT_ENDPOINT: checkout.endpoint,
      NEXT_PUBLIC_CHECKOUT_RELEASE: String(checkout.checkout),
      NEXT_PUBLIC_RECOVERY_RELEASE: String(checkout.recovery),
      NEXT_PUBLIC_PRODUCT_MEDIA_RELEASE: String(!!auth && process.env.BATOOL_PRODUCT_MEDIA_RELEASE === "true"),
    },
  };
}
