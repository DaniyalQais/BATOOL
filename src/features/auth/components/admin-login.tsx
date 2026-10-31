"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminClient } from "../model/browser-client.ts";
import { loginError } from "../model/access.ts";
import { useAdminAccess } from "./use-admin-access.ts";
import { AdminPanel } from "./admin-panel.tsx";
import styles from "./admin.module.css";

export function AdminLogin() {
  const access = useAdminAccess();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (access.state.status === "ready") router.replace("/admin/"); }, [access.state.status, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const client = adminClient();
      if (reset) {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL("/admin/reset-password/", window.location.origin).href,
        });
        if (error) setMessage("Unable to request a reset link. Check your connection or try again later.");
        else setMessage("If this address has a provisioned account, a password reset link will be sent. Check your inbox.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        setPassword("");
        if (error) setMessage(loginError(error));
        else await access.refresh();
      }
    } catch { setMessage(reset ? "Unable to request a reset link. Check your connection and authentication setup." : loginError(null)); }
    finally { setBusy(false); }
  }
  const state = access.state;
  if (state.status === "loading" || state.status === "ready") return <AdminPanel title="Sign in"><p role="status">Checking your session…</p></AdminPanel>;
  if (state.status === "denied") return <AdminPanel title="Access not assigned">
    <p role="alert">Your account does not have dashboard access. Contact the administrator to request an explicit role assignment.</p>
    <button className={styles.button} onClick={() => { void access.signOut(); }}>Sign out</button>
  </AdminPanel>;
  return <AdminPanel title={reset ? "Reset your password" : "Sign in"}>
    <p>Access is limited to explicitly provisioned BATOOL accounts.</p>
    {state.status === "error" && <div className={styles.message} role="alert">{state.message}<br />
      <button className={styles.secondary} onClick={() => { void access.refresh(); }}>Retry session check</button>{" "}
      <button className={styles.secondary} onClick={() => { void access.signOut(); }}>Sign out</button>
    </div>}
    {state.status === "signed-out" && state.message && <p role="status">{state.message}</p>}
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      <label className={styles.field}>Email
        <input className={styles.input} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
      </label>
      {!reset && <label className={styles.field}>Password
        <input className={styles.input} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      </label>}
      <button className={styles.button} disabled={busy} type="submit">{busy ? "Please wait…" : reset ? "Send reset link" : "Sign in"}</button>
      {message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
    </form>
    <button className={styles.secondary} disabled={busy} onClick={() => { setReset(value => !value); setMessage(""); setPassword(""); }}>
      {reset ? "Back to sign in" : "Forgot your password?"}
    </button>
  </AdminPanel>;
}
