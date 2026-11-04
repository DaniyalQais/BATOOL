import Link from "next/link";
import { CartTrigger } from "@/features/cart/components/cart-trigger";
import { SearchIcon } from "@/components/ui/icons";
import { collectionHref } from "@/features/catalog/model/catalog";
import { stitchedCategories } from "@/features/catalog/model/types";
import { MobileNavigation } from "./mobile-navigation";
import styles from "./header.module.css";
export function Header() {
  return (
    <>
      <div className={`announcement ${styles.announcement}`}>
        <div className={styles.announcementInner}>
          <span className={styles.announcementMessage}>
            A NEW EXPRESSION OF EVERYDAY ELEGANCE · READY-TO-WEAR LUXURY
          </span>
          <span className={styles.announcementRegion}>PAKISTAN · PKR</span>
        </div>
      </div>
      <header className={styles.header}>
        <Link href="/" className={`wordmark ${styles.brand}`} aria-label="Batool home">
          <img
            src="/brand/batool-logo.webp"
            alt="BATOOL — Modest Wear · Luxury"
            className={styles.brandLogo}
            width="170"
            height="46"
          />
        </Link>
        <MobileNavigation>
          <nav className={styles.links} aria-label="Main navigation">
            {stitchedCategories.map(category => (
              <Link key={category} href={collectionHref(category)} className={styles.navLink}>
                <span>{category}</span>
                <span className={styles.mobileChevron} aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </MobileNavigation>
        <div className={styles.actions}>
          <Link href="/#catalog-search" className={styles.search} aria-label="Search clothing">
            <SearchIcon />
            <span className={styles.searchText}>Search</span>
          </Link>
          <CartTrigger />
        </div>
      </header>
    </>
  );
}
