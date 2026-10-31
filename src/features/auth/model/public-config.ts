export interface PublicAuthConfig { url: string; key: string }

/** Accept only the public key format. Never forward arbitrary environment values. */
export function publicAuthConfig(url: string | undefined, key: string | undefined): PublicAuthConfig | null {
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Supabase authentication configuration is incomplete.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid public Supabase project URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("Public Supabase URL must be an HTTPS project origin.");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("Authentication requires a publishable key, never a secret or service-role key.");
  }
  return { url: parsed.origin, key };
}
