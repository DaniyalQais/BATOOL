import type { NextConfig } from "next";
import path from "node:path";
import { prepareCatalog } from "./scripts/prepare-catalog.ts";
import { publicAuthConfig } from "./src/features/auth/model/public-config.ts";
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
  // Expose only these two validated PUBLIC values, not the build environment.
  const auth = publicAuthConfig(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  await prepareCatalog();
  return {
    ...nextConfig,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: auth?.url ?? "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: auth?.key ?? "",
    },
  };
}
