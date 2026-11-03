"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { OwnerProducts } from "@/features/catalog/components/owner-products";
import { AdminOrders } from "@/features/orders/components/admin-orders";
import { OwnerSettings } from "@/features/settings/components/owner-settings";
import { OwnerRecovery } from "@/features/checkout/components/owner-recovery";
import { AdminPanel } from "./admin-panel.tsx";
import { useAdminAccess } from "./use-admin-access.ts";
import styles from "./admin.module.css";

type TabId = "orders" | "products" | "settings" | "recovery" | "all";

export function AdminDashboard() {
  const { state, refresh, signOut } = useAdminAccess();
  const [activeTab, setActiveTab] = useState<TabId>("orders");
  let title = "Dashboard";
  let content: ReactNode;
  if (state.status === "loading") content = <p role="status" className={styles.statusMsg}>Verifying your session and access…</p>;
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
    <div className={styles.userBanner}>
      <div className={styles.userInfo}>
        <div className={styles.avatar}>{state.email.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className={styles.userEmailRow}>
            <strong className={styles.userEmail}>{state.email}</strong>
            <span className={styles.roleBadge}>{state.role === "owner" ? "Store Owner" : "Partner"}</span>
            <span className={styles.liveStatusBadge}>● System Online</span>
          </div>
          <p className={styles.userSubtext}>
            {state.role === "owner"
              ? "Full store access: Manage live orders, customer addresses, stock and settings."
              : "Read orders, dates, amounts and statuses."}
          </p>
        </div>
      </div>
      <div className={styles.userActions}>
        <button className={styles.secondaryButton} onClick={() => { void refresh(); }}>Check access again</button>
        <button className={styles.logoutButton} onClick={() => { void signOut(); }}>Sign out</button>
      </div>
    </div>

    {/* Quick Stat / KPI Cards */}
    <div className={styles.statsGrid}>
      <div className={styles.statCard}>
        <span className={styles.statIcon}>📦</span>
        <div>
          <span className={styles.statLabel}>Order Fulfillment</span>
          <strong className={styles.statValue}>Pakistan-wide</strong>
          <span className={styles.statSub}>COD &amp; Online orders</span>
        </div>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statIcon}>🚚</span>
        <div>
          <span className={styles.statLabel}>Shipping Rate</span>
          <strong className={styles.statValue}>PKR 250.00</strong>
          <span className={styles.statSub}>Flat fee configured</span>
        </div>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statIcon}>👗</span>
        <div>
          <span className={styles.statLabel}>Product Catalog</span>
          <strong className={styles.statValue}>6 Ensembles</strong>
          <span className={styles.statSub}>Active &amp; Orderable</span>
        </div>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statIcon}>💳</span>
        <div>
          <span className={styles.statLabel}>Payment Methods</span>
          <strong className={styles.statValue}>COD Active</strong>
          <span className={styles.statSub}>Easypaisa / JazzCash ready</span>
        </div>
      </div>
    </div>

    {/* Navigation Tabs */}
    <nav className={styles.tabNav} aria-label="Dashboard sections">
      <button
        type="button"
        className={`${styles.tabBtn} ${activeTab === "orders" ? styles.tabBtnActive : ""}`}
        onClick={() => setActiveTab("orders")}
      >
        <span>📦</span> Orders &amp; Customers
      </button>
      {state.role === "owner" && (
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "products" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("products")}
        >
          <span>👗</span> Products &amp; Stock
        </button>
      )}
      {state.role === "owner" && (
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "settings" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <span>⚙️</span> Store Settings &amp; WhatsApp
        </button>
      )}
      {state.role === "owner" && (
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === "recovery" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("recovery")}
        >
          <span>🛡️</span> Recovery &amp; Audit
        </button>
      )}
      <button
        type="button"
        className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
        onClick={() => setActiveTab("all")}
      >
        <span>📋</span> All Sections
      </button>
    </nav>
  </>;

  const owner = state.status === "ready" && state.role === "owner";
  const isReady = state.status === "ready";

  return <AdminPanel title={title} wide={isReady}>
    {content}
    {isReady && (
      <div className={activeTab === "orders" || activeTab === "all" ? styles.tabSectionActive : styles.tabSectionHidden}>
        <AdminOrders key={`${state.email}-${state.role}`} role={state.role} />
      </div>
    )}
    <div className={owner && (activeTab === "products" || activeTab === "all") ? styles.tabSectionActive : styles.tabSectionHidden}>
      <OwnerProducts enabled={owner} account={state.status === "ready" ? state.email : ""}
        clear={state.status === "signed-out" || state.status === "denied" || (state.status === "ready" && !owner)} />
    </div>
    {owner && (
      <div className={activeTab === "settings" || activeTab === "all" ? styles.tabSectionActive : styles.tabSectionHidden}>
        <OwnerSettings key={state.status === "ready" ? state.email : ""} />
      </div>
    )}
    {owner && (
      <div className={activeTab === "recovery" || activeTab === "all" ? styles.tabSectionActive : styles.tabSectionHidden}>
        <OwnerRecovery key={state.status === "ready" ? state.email : ""} />
      </div>
    )}
  </AdminPanel>;
}
