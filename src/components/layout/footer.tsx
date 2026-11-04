import Link from "next/link";
import { collectionHref } from "@/features/catalog/model/catalog";
import { stitchedCategories } from "@/features/catalog/model/types";
import { PrivateListForm } from "./private-list-form";
import styles from "./footer.module.css";
import { publicBusinessSettings as settings } from "@/features/settings/model/generated/public-settings";
import { checkoutIsWired, releaseCopy } from "@/features/checkout/model/release-copy";

export function Footer() {
  const disclosure = releaseCopy(checkoutIsWired(), false).availability;

  return (
    <footer className={styles.footer}>
      {/* Hallmark Trust Strip */}
      <section className={styles.hallmarkStrip} aria-label="BATOOL Commitments">
        <div className={styles.hallmarkContainer}>
          <div className={styles.hallmarkItem}>
            <span className={styles.hallmarkIcon} aria-hidden="true">🚚</span>
            <div>
              <strong className={styles.hallmarkTitle}>Nationwide Delivery</strong>
              <p className={styles.hallmarkText}>TCS &amp; Trax express in 3–5 working days</p>
            </div>
          </div>
          <div className={styles.hallmarkDivider} aria-hidden="true" />
          <div className={styles.hallmarkItem}>
            <span className={styles.hallmarkIcon} aria-hidden="true">💵</span>
            <div>
              <strong className={styles.hallmarkTitle}>Cash on Delivery</strong>
              <p className={styles.hallmarkText}>Doorstep COD available across Pakistan</p>
            </div>
          </div>
          <div className={styles.hallmarkDivider} aria-hidden="true" />
          <div className={styles.hallmarkItem}>
            <span className={styles.hallmarkIcon} aria-hidden="true">📦</span>
            <div>
              <strong className={styles.hallmarkTitle}>Open Parcel Inspection</strong>
              <p className={styles.hallmarkText}>Verify your stitched suit before payment</p>
            </div>
          </div>
          <div className={styles.hallmarkDivider} aria-hidden="true" />
          <div className={styles.hallmarkItem}>
            <span className={styles.hallmarkIcon} aria-hidden="true">🔄</span>
            <div>
              <strong className={styles.hallmarkTitle}>7-Day Exchange</strong>
              <p className={styles.hallmarkText}>Effortless size &amp; style assistance</p>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter / The BATOOL Edit */}
      <section className={styles.newsletterBand} aria-labelledby="footer-newsletter-title">
        <div className={styles.newsletter} translate="no">
          <div className={styles.newsletterIntro}>
            <span className={styles.newsletterEyebrow}>✦ PRIVATE CLIENT LIST</span>
            <h2 id="footer-newsletter-title" className={styles.newsletterHeading}>The BATOOL Edit</h2>
            <p className="notranslate">
              Be the first to preview limited seasonal pret edits, hand-embroidery releases, and private exhibitions.
            </p>
          </div>
          <div className={styles.newsletterFormWrapper}>
            <PrivateListForm />
          </div>
        </div>
      </section>

      {/* Main Footer Navigation & Brand */}
      <div className={styles.main}>
        {/* Brand Narrative */}
        <div className={styles.brand}>
          <Link href="/" className={styles.brandLogoLink} aria-label="BATOOL home">
            <img
              src="/brand/batool-logo.webp"
              alt="BATOOL — Modest Wear · Luxury"
              className={styles.brandFooterLogo}
              width="180"
              height="50"
            />
          </Link>
          <span className={styles.brandSub}>LUXURY STITCHED PRET · PAKISTAN</span>
          <p className={styles.brandDescription}>
            Everyday, beautifully. Crafted with reverence for Pakistani artisanal tailoring, fluid drapery, and contemporary ready-to-wear refinement.
          </p>
          {settings.public_whatsapp && (
            <a
              href={`https://wa.me/${settings.public_whatsapp}`}
              className={styles.whatsappConciergeBadge}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className={styles.whatsappDot} aria-hidden="true" />
              <span>WhatsApp Concierge: +{settings.public_whatsapp}</span>
            </a>
          )}
        </div>

        {/* Shop Navigation */}
        <nav className={styles.linkGroup} aria-labelledby="footer-shop-title">
          <h3 id="footer-shop-title">The Collections</h3>
          <ul>
            {stitchedCategories.map(category => (
              <li key={category}>
                <Link href={collectionHref(category)}>{category}</Link>
              </li>
            ))}
            <li>
              <Link href="/#collection">All Ready-to-Wear</Link>
            </li>
          </ul>
        </nav>

        {/* Customer Care */}
        <nav className={styles.linkGroup} aria-labelledby="footer-care-title">
          <h3 id="footer-care-title">Client Concierge</h3>
          <ul>
            <li><Link href="/help/size/">Size &amp; Fit Guide</Link></li>
            <li><Link href="/help/delivery/">Delivery &amp; Exchange Terms</Link></li>
            <li><Link href="/help/contact/">Contact Atelier</Link></li>
            {settings.public_whatsapp && (
              <li>
                <a href={`https://wa.me/${settings.public_whatsapp}`} rel="noopener noreferrer">
                  WhatsApp Support
                </a>
              </li>
            )}
            {settings.support_email && (
              <li>
                <a href={`mailto:${settings.support_email}`}>{settings.support_email}</a>
              </li>
            )}
          </ul>
        </nav>

        {/* Delivery & Assurance */}
        <div className={styles.linkGroup}>
          <h3>Service &amp; Trust</h3>
          <ul className={styles.serviceNotes}>
            <li>
              <strong>Courier Partners</strong>
              <span>TCS · Trax Express · Leopards</span>
            </li>
            <li>
              <strong>Payment Channels</strong>
              <span>Cash on Delivery (COD) · Raast</span>
            </li>
            <li>
              <strong>Atelier Hours</strong>
              <span>Mon – Sat: 10:00 AM – 8:00 PM PKT</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Legal Band */}
      <div className={styles.bottomBand}>
        <div className={styles.bottom}>
          <p className={styles.concept}>
            Concept and sample images are illustrative; see individual image disclosures. {disclosure}
          </p>
          <div className={styles.legal}>
            <span>© {new Date().getFullYear()} BATOOL. All Rights Reserved.</span>
            <span>Crafted by Aonicon Valley.</span>
            <span className={styles.countryBadge}>Pakistan · PKR ₨</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
