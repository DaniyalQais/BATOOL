import Link from "next/link";
import { collectionHref } from "@/features/catalog/model/catalog";
import { stitchedCategories } from "@/features/catalog/model/types";
import { PrivateListForm } from "./private-list-form";
import styles from "./footer.module.css";
export function Footer() {
  return (
    <footer className={styles.footer}>
      <section className={styles.newsletterBand} aria-labelledby="footer-newsletter-title">
        <div className={styles.newsletter} translate="no">
          <div>
            <h2 id="footer-newsletter-title">The BATOOL Edit</h2>
            <p className="notranslate">Collection stories and updates from BATOOL.</p>
          </div>
          <PrivateListForm />
        </div>
      </section>
      <div className={styles.main}>
        <div className={styles.brand}>
          <Link href="/" className={`wordmark ${styles.brandMark}`} aria-label="BATOOL home">
            BATOOL
          </Link>
          <p>Everyday, beautifully.</p>
        </div>
        <nav className={styles.linkGroup} aria-labelledby="footer-shop-title">
          <h3 id="footer-shop-title">Shop</h3>
          <ul>
            {stitchedCategories.map(category => (
              <li key={category}><Link href={collectionHref(category)}>{category}</Link></li>
            ))}
          </ul>
        </nav>
        <nav className={styles.linkGroup} aria-labelledby="footer-care-title">
          <h3 id="footer-care-title">Customer care</h3>
          <ul>
            <li><Link href="/help/size/">Size guide</Link></li>
            <li><Link href="/help/delivery/">Delivery &amp; returns</Link></li>
            <li><Link href="/help/contact/">Contact</Link></li>
          </ul>
        </nav>
      </div>
      <div className={styles.bottomBand}>
        <div className={styles.bottom}>
          <p className={styles.concept}>
            This is a concept store. Products and prices are illustrative; orders
            and payments are not yet enabled.
          </p>
          <div className={styles.legal}>
            <span>© {new Date().getFullYear()} BATOOL</span>
            <span>Crafted by Aonicon Valley.</span>
            <span>Pakistan · PKR</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
