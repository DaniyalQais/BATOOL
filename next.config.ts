import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
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
export default nextConfig;
