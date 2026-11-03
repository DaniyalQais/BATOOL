// Public endpoint/release flags only. Never read backend secrets in Next config.
export function productionCheckoutConfig(endpoint: string | undefined, project: string | undefined, release?: string, recovery?: string) {
  const closed = { endpoint: "", checkout: false, recovery: false };
  if (!endpoint) return closed;
  let url: URL; let base: URL;
  try { url = new URL(endpoint); base = new URL(project ?? ""); } catch { throw new Error("Invalid production checkout configuration"); }
  if (base.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(base.hostname)
    || base.origin !== project || url.origin !== base.origin || url.protocol !== "https:"
    || url.pathname !== "/functions/v1/secure-checkout" || url.username || url.password || url.search || url.hash) {
    throw new Error("Checkout endpoint must be the configured project's HTTPS secure-checkout function");
  }
  return { endpoint: url.href, checkout: release === "true", recovery: recovery === "true" };
}
