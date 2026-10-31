import test from "node:test";
import assert from "node:assert/strict";
import { assignedRole, createAccessController, expiredAuthFailure, loginError, SessionExpired, type AccessClock, type AccessPort, type AccessState } from "../src/features/auth/model/access.ts";
import { publicAuthConfig } from "../src/features/auth/model/public-config.ts";

function setup() {
  let now = 1000;
  const states: AccessState[] = [];
  const timers = new Map<object, () => void>();
  const clock: AccessClock = {
    now: () => now,
    later: callback => { const key = {}; timers.set(key, callback); return key; },
    cancel: key => { timers.delete(key as object); },
  };
  const port: AccessPort = {
    identity: async () => ({ id: "user-a", email: "test@example.invalid", expiresAt: 2000 }),
    role: async id => ({ user_id: id, role: "owner" }),
    signOut: async () => {},
  };
  const controller = createAccessController(port, state => states.push(state), clock);
  return { controller, port, states, timers, advance: (value: number) => { now = value; } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
test("only an explicit matching owner/partner mapping grants dashboard access", () => {
  assert.equal(assignedRole(null, "a"), null);
  for (const role of ["owner", "partner"]) assert.equal(assignedRole({ user_id: "a", role }, "a"), role);
  for (const value of [undefined, {}, { role: "owner" }, { user_id: "b", role: "owner" }, { user_id: "a", role: "admin" }, { user_id: "a", user_metadata: { role: "owner" } }]) {
    assert.throws(() => assignedRole(value, "a"));
  }
});
test("signed-out and authenticated-but-unassigned accounts never become ready", async () => {
  const a = setup(); a.port.identity = async () => null;
  await a.controller.refresh(); assert.equal(a.states.at(-1)?.status, "signed-out");
  const b = setup(); b.port.role = async () => null;
  await b.controller.refresh(); assert.equal(b.states.at(-1)?.status, "denied");
  assert.ok([...a.states, ...b.states].every(state => state.status !== "ready"));
});
test("both assigned roles are resolved from the database after verified identity", async () => {
  for (const role of ["owner", "partner"] as const) {
    const a = setup(); a.port.role = async id => ({ user_id: id, role });
    await a.controller.refresh();
    assert.deepEqual(a.states.at(-1), { status: "ready", email: "test@example.invalid", role });
    a.controller.stop(); assert.equal(a.timers.size, 0);
  }
});
test("role revocation and role-query failures clear previously authorized content", async () => {
  const a = setup(); await a.controller.refresh(); a.port.role = async () => null;
  await a.controller.refresh(); assert.equal(a.states.at(-1)?.status, "denied");
  a.port.role = async () => { throw new Error("private provider details"); };
  await a.controller.refresh(); assert.equal(a.states.at(-1)?.status, "error");
  assert.ok(!JSON.stringify(a.states).includes("private provider details"));
});
test("logout invalidates a pending role lookup and prevents stale authorization", async () => {
  const a = setup(); const role = deferred<unknown>();
  a.port.role = () => role.promise;
  const pending = a.controller.refresh(); await Promise.resolve();
  await a.controller.signOut(); role.resolve({ user_id: "user-a", role: "owner" }); await pending;
  assert.equal(a.states.at(-1)?.status, "signed-out");
  assert.ok(a.states.every(state => state.status !== "ready"));
});
test("a newer session check wins over an old user's delayed response", async () => {
  const a = setup(); const old = deferred<Awaited<ReturnType<AccessPort["identity"]>>>();
  a.port.identity = () => old.promise;
  const first = a.controller.refresh();
  a.port.identity = async () => null;
  await a.controller.refresh();
  old.resolve({ id: "old-user", email: "old@example.invalid", expiresAt: 2000 }); await first;
  assert.equal(a.states.at(-1)?.status, "signed-out");
  assert.ok(a.states.every(state => state.status !== "ready"));
});
test("expired sessions and expiry during a role lookup never reveal dashboard data", async () => {
  const a = setup(); a.advance(3000); await a.controller.refresh();
  assert.equal(a.states.at(-1)?.status, "signed-out");
  const b = setup(); b.port.role = async () => { b.advance(3000); return { user_id: "user-a", role: "owner" }; };
  await b.controller.refresh(); assert.equal(b.states.at(-1)?.status, "signed-out");
  const c = setup(); c.port.identity = async () => { throw new SessionExpired(); };
  await c.controller.refresh(); assert.equal(c.states.at(-1)?.status, "signed-out");
});
test("expiry timer rechecks access; stopped controllers do not publish pending results", async () => {
  const a = setup(); await a.controller.refresh();
  a.port.identity = async () => null;
  const timer = [...a.timers.values()][0]; timer(); await Promise.resolve(); await Promise.resolve();
  assert.equal(a.states.at(-1)?.status, "signed-out");
  const b = setup(); const identity = deferred<Awaited<ReturnType<AccessPort["identity"]>>>();
  b.port.identity = () => identity.promise; const pending = b.controller.refresh();
  b.controller.stop(); const count = b.states.length;
  identity.resolve(null); await pending; assert.equal(b.states.length, count);
});
test("logout blocks revalidation while pending and handles failure without claiming success", async () => {
  const a = setup(); const logout = deferred<void>();
  a.port.signOut = () => logout.promise;
  const pending = a.controller.signOut(); await a.controller.refresh();
  assert.equal(a.states.at(-1)?.status, "loading"); logout.resolve(); await pending;
  assert.equal(a.states.at(-1)?.status, "signed-out");
  const b = setup(); await b.controller.refresh();
  b.port.signOut = async () => { throw new Error("provider error"); };
  await b.controller.signOut(); assert.equal(b.states.at(-1)?.status, "error");
});
test("public auth config accepts only an HTTPS origin and a publishable key", () => {
  assert.equal(publicAuthConfig(undefined, undefined), null);
  assert.deepEqual(publicAuthConfig("https://example.supabase.co/", "sb_publishable_test"), { url: "https://example.supabase.co", key: "sb_publishable_test" });
  for (const key of ["sb_secret_test", "service_role", "eyJlegacy-key", ""]) assert.throws(() => publicAuthConfig("https://example.supabase.co", key));
  for (const url of ["invalid", "http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com/?token=example"]) assert.throws(() => publicAuthConfig(url, "sb_publishable_test"));
});
test("login errors remain clear without exposing raw provider details", () => {
  assert.match(loginError({ code: "invalid_credentials" }), /Email or password/);
  assert.match(loginError({ code: "email_not_confirmed" }), /administrator/);
  assert.match(loginError({ status: 429 }), /Too many/);
  assert.equal(loginError({ message: "private token details" }), loginError(null));
});
test("expired credentials are distinguished from connectivity and rate-limit failures", () => {
  for (const error of [{ status: 401 }, { name: "AuthSessionMissingError" }, { code: "refresh_token_not_found" }]) assert.equal(expiredAuthFailure(error), true);
  for (const error of [null, { status: 500 }, { status: 429 }, { name: "AuthRetryableFetchError" }]) assert.equal(expiredAuthFailure(error), false);
});
