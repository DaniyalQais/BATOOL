"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminClient, accessPort } from "../model/browser-client.ts";
import { AdminPanel } from "./admin-panel.tsx";
import styles from "./admin.module.css";

export function ResetPassword() {
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid" | "success" | "logout-error">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let client;
    try { client = adminClient(); } catch { setPhase("invalid"); return; }
    let recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const invalidLink = new URLSearchParams(window.location.hash.slice(1)).has("error");
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recovery = true;
      if (event === "SIGNED_OUT" && active) setPhase(current => current === "success" ? current : "invalid");
    });
    const port = accessPort(client);
    void port.identity().then(user => {
      if (active) setPhase(user && user.expiresAt > Date.now() && recovery && !invalidLink ? "ready" : "invalid");
    }).catch(() => { if (active) setPhase("invalid"); }).finally(() => {
      // Never leave recovery tokens/error details in the address bar/history entry.
      if (active && window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function finishSignOut() {
    setBusy(true);
    try { await accessPort(adminClient()).signOut(); setPhase("success"); }
    catch { setPhase("logout-error"); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) { setMessage("Use at least 12 characters for your new password."); return; }
    if (password !== confirmation) { setMessage("The passwords do not match."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await adminClient().auth.updateUser({ password });
      setPassword(""); setConfirmation("");
      if (error) { setMessage("The password could not be updated. Check password requirements or request a new reset link if it has expired."); return; }
      await finishSignOut();
    } catch { setMessage("The password could not be updated. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <AdminPanel title="Set a new password">
    {phase === "checking" && <p role="status">Verifying your reset link…</p>}
    {phase === "invalid" && <><p role="alert">This reset link is invalid, expired, or unavailable. Request a new link from the sign-in page.</p><Link className={styles.secondary} href="/admin/login/">Back to sign in</Link></>}
    {phase === "success" && <><p role="status">Password updated. Sign in again with your new password.</p><Link className={styles.secondary} href="/admin/login/">Go to sign in</Link></>}
    {phase === "logout-error" && <><p role="alert">Password updated, but sign out could not be completed.</p><button className={styles.button} disabled={busy} onClick={() => { void finishSignOut(); }}>Retry signing out</button></>}
    {phase === "ready" && <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      <label className={styles.field}>New password<input className={styles.input} type="password" required minLength={12} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      <label className={styles.field}>Confirm new password<input className={styles.input} type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} /></label>
      <button className={styles.button} disabled={busy} type="submit">{busy ? "Updating…" : "Update password"}</button>
      {message && <p className={styles.message} role="alert">{message}</p>}
    </form>}
  </AdminPanel>;
}
