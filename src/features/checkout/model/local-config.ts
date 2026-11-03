// A local testing seam only. No production checkout URL is accepted in this task.
export function localCheckoutEndpoint(value: string | undefined): string {
  if (!value) return "";
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid local checkout endpoint"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Local checkout endpoint must be an explicit loopback HTTP origin");
  }
  return url.origin;
}
