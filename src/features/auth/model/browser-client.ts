"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../catalog/model/database.types.ts";
import { publicAuthConfig } from "./public-config.ts";
import { expiredAuthFailure, SessionExpired, type AccessPort } from "./access.ts";

let client: SupabaseClient<Database> | undefined;
export function adminClient() {
  if (typeof window === "undefined") throw new Error("Authentication initializes in the browser only.");
  const config = publicAuthConfig(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!config) throw new Error("Authentication is not configured. Configure the Supabase build variables and rebuild.");
  return client ??= createClient<Database>(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "batool-admin-auth" },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) }) },
  });
}

export function accessPort(supabase: SupabaseClient<Database>): AccessPort {
  return {
    async identity() {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (expiredAuthFailure(error)) throw new SessionExpired();
        throw new Error("Session verification unavailable.");
      }
      if (!data.session) return null;
      const verified = await supabase.auth.getUser();
      if (verified.error) {
        if (expiredAuthFailure(verified.error)) throw new SessionExpired();
        throw new Error("Identity verification unavailable.");
      }
      if (!verified.data.user || verified.data.user.is_anonymous) throw new SessionExpired();
      return { id: verified.data.user.id, email: verified.data.user.email ?? "Provisioned account", expiresAt: (data.session.expires_at ?? 0) * 1000 };
    },
    async role(userId) {
      const { data, error } = await supabase.from("dashboard_roles").select("user_id, role").eq("user_id", userId).abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
      if (error) {
        if (error.code === "PGRST301" || error.code === "PGRST303") throw new SessionExpired();
        throw new Error("Role verification unavailable.");
      }
      return data;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error("Sign out unavailable.");
    },
  };
}
