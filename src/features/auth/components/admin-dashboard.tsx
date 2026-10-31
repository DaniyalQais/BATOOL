"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { OwnerProducts } from "@/features/catalog/components/owner-products";
import { AdminPanel } from "./admin-panel.tsx";
import { useAdminAccess } from "./use-admin-access.ts";
import styles from "./admin.module.css";

export function AdminDashboard() {
  const { state, refresh, signOut } = useAdminAccess();
  let title = "Dashboard";
  let content: ReactNode;
  if (state.status === "loading") content = <p role="status">Verifying your session and access?</p>;
  else if (state.status === "signed-out") {
    title = "Sign in required";
    content = <><p role="status">{state.message ?? "Sign in with your provisioned BATOOL account to continue."}</p><Link className={styles.secondary} href="/admin/login/">Go to sign in</Link></>;
  } else if (state.status === "denied") {
    title = "Access not assigned";
    content = <><p role="alert">Your account does not have dashboard access. Contact the administrator.</p><button className={styles.button} onClick={() => { void signOut(); }}>Sign out</button></>;
  } else if (state.status === "error") {
    title = "Access unavailable";
    content = <><p className={styles.message} role="alert">{state.message}</p><div className={styles.actions}>
      <button className={styles.button} onClick={() => { void refresh(); }}>Retry</button>
      <button className={styles.secondary} onClick={() => { void signOut(); }}>Sign out</button>
      <Link className={styles.secondary} href="/admin/login/">Sign in page</Link>
    </div></>;
  } else content = <>
    <dl className={styles.details}><dt>Signed in as</dt><dd>{state.email}</dd><dt>Assigned role</dt><dd>{state.role === "owner" ? "Owner" : "Partner"}</dd></dl>
    <p>{state.role === "owner" ? "Edit the six existing catalog products below. Orders are not enabled." : "Your role is reserved for future read access to order amounts, statuses and reports. Reporting is not enabled in this phase."}</p>
    <div className={styles.actions}>
      <button className={styles.button} onClick={() => { void signOut(); }}>Sign out</button>
      <button className={styles.secondary} onClick={() => { void refresh(); }}>Check access again</button>
    </div>
  </>;
  const owner = state.status === "ready" && state.role === "owner";
  return <AdminPanel title={title}>
    {content}
    <OwnerProducts enabled={owner} account={state.status === "ready" ? state.email : ""}
      clear={state.status === "signed-out" || state.status === "denied" || (state.status === "ready" && !owner)} />
  </AdminPanel>;
}
