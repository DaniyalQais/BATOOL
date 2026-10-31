export type DashboardRole = "owner" | "partner";
export interface Identity { id: string; email: string; expiresAt: number }
export type AccessState =
  | { status: "loading" }
  | { status: "signed-out"; message?: string }
  | { status: "denied"; email: string }
  | { status: "error"; message: string }
  | { status: "ready"; email: string; role: DashboardRole };

export function assignedRole(value: unknown, userId: string): DashboardRole | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("user_id" in value) || value.user_id !== userId || !("role" in value)) {
    throw new Error("Invalid dashboard role response.");
  }
  if (value.role !== "owner" && value.role !== "partner") throw new Error("Invalid dashboard role response.");
  return value.role;
}

export class SessionExpired extends Error {}
export function expiredAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; status?: number; code?: string };
  return value.name === "AuthSessionMissingError" || value.status === 401 || value.status === 403 ||
    ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired", "invalid_grant", "user_not_found"].includes(value.code ?? "");
}
export interface AccessPort {
  identity(): Promise<Identity | null>;
  role(userId: string): Promise<unknown>;
  signOut(): Promise<void>;
}
export interface AccessClock {
  now(): number;
  later(callback: () => void, delay: number): unknown;
  cancel(timer: unknown): void;
}
const clock: AccessClock = {
  now: Date.now,
  later: (callback, delay) => setTimeout(callback, delay),
  cancel: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Never authorize from cached role claims. Stale async results cannot restore access. */
export function createAccessController(port: AccessPort, change: (state: AccessState) => void, time = clock) {
  let revision = 0;
  let stopped = false;
  let loggingOut = false;
  let timer: unknown;
  function invalidate() {
    revision++;
    if (timer !== undefined) time.cancel(timer);
    timer = undefined;
    return revision;
  }
  function signedOut(message = "Your session ended. Sign in again.") {
    invalidate();
    if (!stopped) change({ status: "signed-out", message });
  }
  async function refresh() {
    if (stopped || loggingOut) return;
    const current = invalidate();
    const fresh = () => !stopped && current === revision;
    change({ status: "loading" });
    try {
      const user = await port.identity();
      if (!fresh()) return;
      if (!user) { change({ status: "signed-out" }); return; }
      if (!Number.isFinite(user.expiresAt) || user.expiresAt <= time.now()) throw new SessionExpired();
      const role = assignedRole(await port.role(user.id), user.id);
      if (!fresh()) return;
      if (user.expiresAt <= time.now()) throw new SessionExpired();
      change(role ? { status: "ready", email: user.email, role } : { status: "denied", email: user.email });
      // Auto-refresh is handled by the SDK; this check also hides expired UI if it fails.
      timer = time.later(() => { void refresh(); }, Math.min(user.expiresAt - time.now() + 50, 2_147_483_647));
    } catch (error) {
      if (!fresh()) return;
      if (error instanceof SessionExpired) signedOut();
      else change({ status: "error", message: "Unable to verify dashboard access. Check your connection and retry. If this continues, ask the administrator to check the role migration." });
    }
  }
  async function signOut() {
    invalidate();
    if (stopped) return;
    loggingOut = true;
    change({ status: "loading" });
    try { await port.signOut(); signedOut("You have signed out."); }
    catch { if (!stopped) change({ status: "error", message: "Sign out could not be completed. Please retry signing out." }); }
    finally { loggingOut = false; }
  }
  return { refresh, signOut, signedOut, stop() { stopped = true; invalidate(); } };
}

/** Do not display provider error bodies, tokens, URLs, or account-existence details. */
export function loginError(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: string; status?: number } : {};
  if (value.code === "invalid_credentials") return "Email or password is incorrect.";
  if (value.code === "email_not_confirmed") return "This account is not ready to sign in. Contact the administrator.";
  if (value.status === 429 || value.code === "over_request_rate_limit") return "Too many attempts. Please wait before trying again.";
  return "Unable to sign in. Check your connection and try again.";
}
