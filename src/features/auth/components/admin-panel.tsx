import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

export function AdminPanel({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return <main id="main" className={`${styles.main} ${wide ? styles.wideMain : ""}`}>
    <section className={`${styles.panel} ${wide ? styles.widePanel : ""}`} aria-labelledby="admin-title">
      <div className={styles.topHeader}>
        <div>
          <p className={styles.eyebrow}>BATOOL · PRIVATE WORKSPACE</p>
          <h1 id="admin-title" className={styles.title}>{title}</h1>
        </div>
        {wide && (
          <Link href="/" className={styles.liveStoreLink} target="_blank" rel="noopener noreferrer">
            View Live Store ↗
          </Link>
        )}
      </div>
      {children}
    </section>
    <Link href="/" className={styles.back}>← Back to storefront</Link>
  </main>;
}
