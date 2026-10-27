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
      <div className="announcement">
        A NEW EXPRESSION OF EVERYDAY ELEGANCE <span>PAKISTAN · PKR</span>
      </div>
      <header className={styles.header}>
        <Link href="/" className={`wordmark ${styles.brand}`} aria-label="Batool home">
          BATOOL<span>W E A R Y O U R S T O R Y</span>
        </Link>
        <MobileNavigation>
          <nav className={styles.links} aria-label="Main navigation">
            {stitchedCategories.map(category => (
              <Link key={category} href={collectionHref(category)}>{category}</Link>
            ))}
          </nav>
        </MobileNavigation>
        <div className={styles.actions}>
          <Link href="/#catalog-search" className={styles.search} aria-label="Search clothing">
            <SearchIcon />
            <span>Search</span>
          </Link>
          <CartTrigger />
        </div>
      </header>
    </>
  );
}
