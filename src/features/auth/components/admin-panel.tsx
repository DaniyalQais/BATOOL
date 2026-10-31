import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

export function AdminPanel({ title, children }: { title: string; children: ReactNode }) {
  return <main id="main" className={styles.main}>
    <section className={styles.panel} aria-labelledby="admin-title">
      <p className={styles.eyebrow}>BATOOL · PRIVATE WORKSPACE</p>
      <h1 id="admin-title" className={styles.title}>{title}</h1>
      {children}
    </section>
    <Link href="/" className={styles.back}>Back to storefront</Link>
  </main>;
}
