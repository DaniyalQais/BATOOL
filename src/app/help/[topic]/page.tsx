import { notFound } from "next/navigation";
import Link from "next/link";
import { publicBusinessSettings as settings } from "@/features/settings/model/generated/public-settings";
import { shippingDescription } from "@/features/settings/model/shipping";
import { checkoutIsWired, releaseCopy } from "@/features/checkout/model/release-copy";
import styles from "./help.module.css";

const wired = checkoutIsWired();

const pages = {
  size: {
    title: "Find your fit",
    subtitle: "Atelier Size & Measurement Guide",
    description:
      "All BATOOL prêt garments are master-tailored with fluid silhouettes and generous seam allowances. Refer to our standard Pakistani stitched pret measurement chart below to find your perfect fit.",
  },
  delivery: {
    title: "Delivery & returns",
    subtitle: "Nationwide Shipping & Seamless Exchange",
    description:
      `BATOOL is a ready-stock luxury pret business based in Pakistan. Prices are in PKR. ${shippingDescription(settings.shipping)}`,
  },
  contact: {
    title: "Let’s stay in touch",
    subtitle: "Client Concierge & Atelier Assistance",
    description:
      "Our client services team is here to assist you with order inquiries, styling consultations, bespoke requests, and delivery updates.",
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((topic) => ({ topic }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  return {
    title: pages[topic as keyof typeof pages]
      ? `${pages[topic as keyof typeof pages].title} · BATOOL Client Care`
      : "Help",
    ...(Object.hasOwn(pages, topic) ? { alternates: { canonical: `/help/${topic}/` } } : {}),
  };
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  if (!Object.hasOwn(pages, topic)) notFound();
  const page = pages[topic as keyof typeof pages];
  const disclosure = releaseCopy(wired, false).availability;

  return (
    <main id="main" className={styles.helpPage}>
      {/* Breadcrumb Navigation */}
      <nav className={styles.breadcrumbBar} aria-label="Breadcrumb">
        <div className={styles.breadcrumbs}>
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href="/help/size/">Customer Care</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.currentCrumb}>{page.title}</span>
        </div>
        <Link href="/#collection" className={styles.backLink}>
          ← Back to collection
        </Link>
      </nav>

      {/* Quick Navigation Tabs */}
      <nav className={styles.tabNav} aria-label="Help topics">
        <Link
          href="/help/size/"
          className={`${styles.tabLink} ${topic === "size" ? styles.activeTab : ""}`}
        >
          📏 Size Guide
        </Link>
        <Link
          href="/help/delivery/"
          className={`${styles.tabLink} ${topic === "delivery" ? styles.activeTab : ""}`}
        >
          🚚 Delivery &amp; Returns
        </Link>
        <Link
          href="/help/contact/"
          className={`${styles.tabLink} ${topic === "contact" ? styles.activeTab : ""}`}
        >
          💬 Contact Atelier
        </Link>
      </nav>

      {/* Header */}
      <header className={styles.header}>
        <span className={styles.eyebrow}>BATOOL CUSTOMER CARE</span>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.introText}>{page.description}</p>
      </header>

      {/* Main Content Area */}
      <div className={styles.contentCard}>
        {/* SIZE GUIDE CONTENT */}
        {topic === "size" && (
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", margin: "0 0 10px" }}>
              Ready-to-Wear Stitched 3-Piece Measurements (Inches)
            </h2>
            <p style={{ fontSize: "13px", color: "#666", margin: "0 0 16px" }}>
              Measurements below represent finished garment dimensions. If your personal measurements fall between sizes, we recommend selecting the larger size for a relaxed, graceful drape.
            </p>

            <div className={styles.tableWrapper}>
              <table className={styles.sizeTable}>
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>Bust / Chest</th>
                    <th>Waist</th>
                    <th>Hip</th>
                    <th>Shirt Length</th>
                    <th>Shoulder</th>
                    <th>Trouser Length</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={styles.sizeBadgeCell}>XS (Extra Small)</td>
                    <td>36″</td>
                    <td>34″</td>
                    <td>38″</td>
                    <td>40″</td>
                    <td>13.5″</td>
                    <td>37″</td>
                  </tr>
                  <tr>
                    <td className={styles.sizeBadgeCell}>S (Small)</td>
                    <td>38″</td>
                    <td>36″</td>
                    <td>40″</td>
                    <td>41″</td>
                    <td>14.0″</td>
                    <td>38″</td>
                  </tr>
                  <tr>
                    <td className={styles.sizeBadgeCell}>M (Medium)</td>
                    <td>40″</td>
                    <td>38″</td>
                    <td>43″</td>
                    <td>42″</td>
                    <td>14.5″</td>
                    <td>39″</td>
                  </tr>
                  <tr>
                    <td className={styles.sizeBadgeCell}>L (Large)</td>
                    <td>43″</td>
                    <td>41″</td>
                    <td>46″</td>
                    <td>43″</td>
                    <td>15.5″</td>
                    <td>40″</td>
                  </tr>
                  <tr>
                    <td className={styles.sizeBadgeCell}>XL (Extra Large)</td>
                    <td>46″</td>
                    <td>44″</td>
                    <td>49″</td>
                    <td>44″</td>
                    <td>16.5″</td>
                    <td>40″</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.measurementTips}>
              <div className={styles.tipCard}>
                <strong>01. Bust &amp; Chest</strong>
                <p>Measure across the fullest part of the bust keeping the tape comfortably level and straight.</p>
              </div>
              <div className={styles.tipCard}>
                <strong>02. Shirt Length</strong>
                <p>Measured from the highest point of the shoulder seam straight down to the finished lower hem.</p>
              </div>
              <div className={styles.tipCard}>
                <strong>03. Trouser &amp; Fit</strong>
                <p>Tailored straight-cut pants with a flexible elasticated waistband and comfortable ankle openings.</p>
              </div>
            </div>

            {settings.public_whatsapp && (
              <p style={{ marginTop: "28px", fontSize: "13px", color: "#555" }}>
                Need personalized sizing advice before placing an order?{" "}
                <a
                  href={`https://wa.me/${settings.public_whatsapp}?text=${encodeURIComponent("Salam BATOOL, I need assistance choosing the right size for a stitched 3-piece suit.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--plum)", fontWeight: "600", textDecoration: "underline" }}
                >
                  Consult our Sizing Concierge on WhatsApp →
                </a>
              </p>
            )}
          </div>
        )}

        {/* DELIVERY & RETURNS CONTENT */}
        {topic === "delivery" && (
          <div>
            <div className={styles.policyGrid}>
              <div className={styles.policyCard}>
                <div className={styles.policyHeader}>
                  <span className={styles.policyIcon}>🚚</span>
                  <span className={styles.policyTitle}>Nationwide Delivery</span>
                </div>
                <p>
                  Orders across Pakistan are dispatched via premier couriers (TCS, Trax Express &amp; Leopards). Delivery takes 3–5 working days once dispatched.
                </p>
                <small style={{ color: "#777" }}>Flat shipping fee: PKR 250 across all cities.</small>
              </div>

              <div className={styles.policyCard}>
                <div className={styles.policyHeader}>
                  <span className={styles.policyIcon}>💵</span>
                  <span className={styles.policyTitle}>Cash on Delivery (COD)</span>
                </div>
                <p>
                  Shop with complete peace of mind. Pay cash at your doorstep when your parcel arrives. No advance deposit required for standard orders.
                </p>
                <small style={{ color: "#777" }}>Exact change is appreciated by courier riders.</small>
              </div>

              <div className={styles.policyCard}>
                <div className={styles.policyHeader}>
                  <span className={styles.policyIcon}>📦</span>
                  <span className={styles.policyTitle}>Open Parcel Inspection</span>
                </div>
                <p>
                  BATOOL proudly supports flyer open inspection. You are welcome to verify your stitched suit’s quality and contents before handing payment to the delivery rider.
                </p>
                <small style={{ color: "#777" }}>Supported at all major courier branches.</small>
              </div>

              <div className={styles.policyCard}>
                <div className={styles.policyHeader}>
                  <span className={styles.policyIcon}>🔄</span>
                  <span className={styles.policyTitle}>7-Day Exchange Guarantee</span>
                </div>
                <p>
                  If your size is not a perfect fit, notify our concierge within 7 days of delivery. We will arrange a replacement size swiftly.
                </p>
                <small style={{ color: "#777" }}>Garments must remain unworn with original tags attached.</small>
              </div>
            </div>

            {settings.policy_text && (
              <div className={styles.policyNote}>
                <strong style={{ display: "block", marginBottom: "4px", color: "#111" }}>Official Policy Statement:</strong>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{settings.policy_text}</p>
              </div>
            )}

            {settings.payment_instructions && (
              <div className={styles.policyNote} style={{ marginTop: "16px" }}>
                <strong style={{ display: "block", marginBottom: "4px", color: "#111" }}>Payment Instructions:</strong>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{settings.payment_instructions}</p>
              </div>
            )}

            <p style={{ marginTop: "24px", fontSize: "12px", color: "#888" }}>
              {disclosure}
            </p>
          </div>
        )}

        {/* CONTACT CONTENT */}
        {topic === "contact" && (
          <div>
            <div className={styles.contactGrid}>
              {/* WhatsApp Concierge Card */}
              <div className={styles.contactCard}>
                <div>
                  <div className={styles.contactCardHeader}>
                    <span className={styles.contactIcon}>💬</span>
                    <div>
                      <h3 className={styles.contactCardTitle}>WhatsApp Concierge</h3>
                      <p className={styles.contactCardSubtitle}>Instant replies &amp; direct order assistance</p>
                    </div>
                  </div>
                  <p style={{ fontSize: "13px", color: "#555", margin: "14px 0 0" }}>
                    Speak directly with our atelier stylists for immediate size recommendations, dispatch updates, and bespoke queries.
                  </p>
                </div>
                {settings.public_whatsapp ? (
                  <a
                    href={`https://wa.me/${settings.public_whatsapp}?text=${encodeURIComponent("Salam BATOOL, I would like to inquire about your collection.")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.contactActionBtn} ${styles.whatsappActionBtn}`}
                  >
                    <span>Chat on WhatsApp (+{settings.public_whatsapp})</span>
                    <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <p style={{ fontSize: "12px", color: "#888" }}>WhatsApp number will be published soon.</p>
                )}
              </div>

              {/* Email Concierge Card */}
              <div className={styles.contactCard}>
                <div>
                  <div className={styles.contactCardHeader}>
                    <span className={styles.contactIcon}>✉️</span>
                    <div>
                      <h3 className={styles.contactCardTitle}>Email Support</h3>
                      <p className={styles.contactCardSubtitle}>Formal inquiries &amp; corporate relations</p>
                    </div>
                  </div>
                  <p style={{ fontSize: "13px", color: "#555", margin: "14px 0 0" }}>
                    Send us detailed inquiries, partnership requests, or feedback. We respond within 24 business hours.
                  </p>
                </div>
                {settings.support_email ? (
                  <a
                    href={`mailto:${settings.support_email}`}
                    className={styles.contactActionBtn}
                  >
                    <span>Email ({settings.support_email})</span>
                    <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <p style={{ fontSize: "12px", color: "#888" }}>Support email will be published soon.</p>
                )}
              </div>
            </div>

            {/* Atelier Operational Details */}
            <div style={{ marginTop: "32px", padding: "24px", background: "#fbf9f6", borderRadius: "8px", border: "1px solid #ebe4dc" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 16px", color: "#111" }}>
                Atelier Schedule &amp; Location
              </h3>
              <ul className={styles.infoList}>
                <li>
                  <strong>Client Service Timings</strong>
                  <span>Monday – Saturday: 10:00 AM – 8:00 PM (Pakistan Standard Time)</span>
                </li>
                <li>
                  <strong>Atelier Origin</strong>
                  <span>Lahore, Pakistan · High-Quality Stitched Pret Tailoring</span>
                </li>
                <li>
                  <strong>Digital &amp; Courier Coverage</strong>
                  <span>Nationwide dispatch to Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, Quetta, and all 150+ postal cities.</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Back Button */}
      <div className={styles.bottomNav}>
        <span style={{ fontSize: "13px", color: "#666" }}>
          Ready to discover your next ensemble?
        </span>
        <Link href="/#collection" className={styles.collectionBtn}>
          <span>Explore The Wardrobe</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  );
}
