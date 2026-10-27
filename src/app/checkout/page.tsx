"use client";

import { useState, useId, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCartItems, cartActions } from "@/features/cart/model/store";
import { cartSubtotal, MAX_QUANTITY, type CartLine } from "@/features/cart/model/cart";
import { getProductById } from "@/features/catalog/model/products";
import { formatPrice } from "@/lib/format";
import { showToast } from "@/components/ui/toast";
import {
  getStoreOwnerWhatsAppUrl,
  getCustomerWhatsAppUrl,
  STORE_OWNER_WHATSAPP,
  STORE_OWNER_PHONE_DISPLAY,
} from "@/features/cart/model/whatsapp";
import styles from "./checkout.module.css";

const PAKISTAN_CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Sialkot",
  "Gujranwala",
  "Hyderabad",
  "Abbottabad",
  "Bahawalpur",
  "Sargodha",
  "Sukkur",
  "Gujrat",
  "Jhelum",
  "Mardan",
  "Sheikhupura",
  "Rahim Yar Khan",
  "Other City",
];

interface OrderSubmission {
  orderRef: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
  paymentMethod: "cod" | "digital";
  items: readonly CartLine[];
  subtotal: number;
}

export default function CheckoutPage() {
  const items = useCartItems();
  const subtotal = cartSubtotal(items);

  // Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Karachi");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "digital">("cod");

  // Promo code
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMessage, setPromoMessage] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<OrderSubmission | null>(null);
  const [copied, setCopied] = useState(false);

  const nameId = useId();
  const phoneId = useId();
  const cityId = useId();
  const addressId = useId();
  const notesId = useId();

  const handleQuantityChange = (line: CartLine, delta: number) => {
    cartActions.change(line.id, line.size, delta);
  };

  const handleRemoveItem = (line: CartLine) => {
    cartActions.remove(line.id, line.size);
  };

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (promoCode.trim().toUpperCase() === "BATOOL10") {
      setPromoApplied(true);
      setPromoMessage("10% Privilege savings applied to your order.");
    } else if (promoCode.trim()) {
      setPromoMessage("Promo code not recognized or expired.");
    }
  };

  const discountAmount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const handleSubmitOrder = (e: FormEvent) => {
    e.preventDefault();

    if (!items.length) return;
    if (!name.trim() || !phone.trim() || !city.trim() || !address.trim()) return;

    setSubmitting(true);

    const orderRef = `BT-${Math.floor(100000 + Math.random() * 900000)}`;

    const record: OrderSubmission = {
      orderRef,
      name,
      phone,
      city,
      address,
      notes,
      paymentMethod,
      items: [...items],
      subtotal: finalTotal,
    };

    // WhatsApp automation:
    // 1. Send clean TCS slip to store owner number
    const storeOwnerUrl = getStoreOwnerWhatsAppUrl(record);
    // 2. Open wa.me for customer with Thank you message
    const customerUrl = getCustomerWhatsAppUrl(record);

    if (typeof window !== "undefined") {
      // Open WhatsApp for store owner with TCS slip immediately on click
      window.open(storeOwnerUrl, "_blank", "noopener,noreferrer");

      // Also open wa.me for customer with Thank you message
      setTimeout(() => {
        try {
          window.open(customerUrl, "_blank", "noopener,noreferrer");
        } catch {
          // Fallback to on-screen button if popup was blocked
        }
      }, 400);
    }

    setTimeout(() => {
      setCompletedOrder(record);
      // Clear cart
      items.forEach((line) => cartActions.remove(line.id, line.size));
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 600);
  };

  const handleCopyOrderRef = async () => {
    if (!completedOrder) return;
    try {
      await navigator.clipboard.writeText(completedOrder.orderRef);
      setCopied(true);
      showToast({
        product: { id: -1, name: "", price: 0, imageSlug: "" },
        message: "Copied",
        duration: 2200,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Thank You / Order Confirmation State
  if (completedOrder) {
    return (
      <main className={styles.checkoutPage}>
        <div className={styles.container}>
          <div className={styles.topNav}>
            <Link href="/" className={styles.brandWordmark} aria-label="Batool Home">
              BATOOL
              <span>W E A R Y O U R S T O R Y</span>
            </Link>
          </div>

          <div className={styles.successCard}>
            <div className={styles.successIcon} aria-hidden="true">✓</div>
            <h1 className={styles.successTitle}>Thank you, {completedOrder.name}!</h1>

            {/* Copyable Order ID on click with Copied toast */}
            <button
              type="button"
              className={styles.successOrderRefBtn}
              onClick={handleCopyOrderRef}
              title="Click to copy Order ID"
              aria-label={`Copy Order Confirmation ID ${completedOrder.orderRef}`}
            >
              ORDER CONFIRMATION: {completedOrder.orderRef}
              <span className={styles.copyBadge}>
                {copied ? "Copied ✓" : "Copy"}
              </span>
            </button>

            {/* Phone number bold and black */}
            <p className={styles.successSubtitle}>
              Your order has been received and is being prepared with utmost care. Our concierge will send a WhatsApp confirmation to{" "}
              <strong className={styles.phoneHighlight}>{completedOrder.phone}</strong> before dispatch.
            </p>

            {/* WhatsApp Automation Card: TCS Slip & Customer Thank You */}
            <div className={styles.whatsappCard}>
              <div className={styles.whatsappCardHeader}>
                <div className={styles.whatsappCardBadge}>
                  <span aria-hidden="true">💬</span>
                  <span>WhatsApp Automation Active</span>
                </div>
                <h3 className={styles.whatsappCardTitle}>TCS Delivery Slip Formatted</h3>
                <p className={styles.whatsappCardDesc}>
                  Order details formatted for TCS courier booking have been prepared for the store owner (<strong>{STORE_OWNER_PHONE_DISPLAY}</strong>).
                </p>
              </div>

              <div className={styles.whatsappActionBtns}>
                <a
                  href={getCustomerWhatsAppUrl(completedOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.whatsappCustomerCta}
                  id="whatsapp-thankyou-cta"
                >
                  <span>Open WhatsApp &ldquo;Thank you&rdquo; Message</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <a
                  href={getStoreOwnerWhatsAppUrl(completedOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.whatsappStoreSecondary}
                >
                  Resend TCS Slip to Owner
                </a>
              </div>
            </div>

            <div className={styles.orderReceipt}>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Delivery To</span>
                <span className={styles.receiptValue}>{completedOrder.name}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Shipping Address</span>
                <span className={styles.receiptValue}>{completedOrder.address}, {completedOrder.city}</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Payment Method</span>
                <span className={styles.receiptValue}>
                  {completedOrder.paymentMethod === "cod" ? "Cash on Delivery (COD)" : "Easypaisa / JazzCash"}
                </span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Delivery Time</span>
                <span className={styles.receiptValue}>2–4 Business Days (Express Courier)</span>
              </div>
              <div className={styles.receiptRow}>
                <span className={styles.receiptLabel}>Total Payable Amount</span>
                <span className={styles.receiptValue} style={{ fontSize: "15px", color: "#C5A880", fontWeight: 700 }}>
                  {formatPrice(completedOrder.subtotal)}
                </span>
              </div>
            </div>

            <Link href="/" className={styles.emptyBtn}>
              CONTINUE SHOPPING ↗
            </Link>

            {/* Below CONTINUE SHOPPING button, two text links: "Track Your Order" and "Need Help? WhatsApp Us" */}
            <div className={styles.confirmationHelpLinks}>
              <Link href="/help/delivery/" className={styles.grayTextLink}>
                Track Your Order
              </Link>
              <span className={styles.helpDivider} aria-hidden="true">·</span>
              <a
                href={`https://wa.me/${STORE_OWNER_WHATSAPP}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.grayTextLink}
              >
                Need Help? WhatsApp Us
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Empty Cart State
  if (!items.length) {
    return (
      <main className={styles.checkoutPage}>
        <div className={styles.container}>
          <div className={styles.topNav}>
            <Link href="/" className={styles.brandWordmark} aria-label="Batool Home">
              BATOOL
              <span>W E A R Y O U R S T O R Y</span>
            </Link>
            <Link href="/#collection" className={styles.returnLink}>
              ← Back to Collection
            </Link>
          </div>

          <div className={styles.emptyCard}>
            <h3>Your shopping bag is empty</h3>
            <p>Select your favorite ensemble from our luxury stitched edit before checking out.</p>
            <Link href="/#collection" className={styles.emptyBtn}>
              Explore Collection ↗
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.checkoutPage}>
      <div className={styles.container}>
        {/* Top Header & Breadcrumb */}
        <header className={styles.topNav}>
          <Link href="/" className={styles.brandWordmark} aria-label="Batool Home">
            BATOOL
            <span>W E A R Y O U R S T O R Y</span>
          </Link>
          <Link href="/#collection" className={styles.returnLink}>
            ← Return to Collection
          </Link>
        </header>

        <div className={styles.layout}>
          {/* Left Side: Shipping & Payment Form (First column on desktop) */}
          <form className={styles.formSection} onSubmit={handleSubmitOrder}>
            {/* Step 1: Shipping Details */}
            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionStep}>1</span>
                <h2 className={styles.sectionTitle}>Shipping Details</h2>
              </div>

              <div className={styles.fieldsGrid}>
                {/* Full Name */}
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <label htmlFor={nameId} className={styles.fieldLabel}>
                    Full Name *
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    required
                    placeholder="e.g. Ayesha Khan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>

                {/* Phone */}
                <div className={styles.fieldGroup}>
                  <label htmlFor={phoneId} className={styles.fieldLabel}>
                    Phone Number (WhatsApp) *
                  </label>
                  <input
                    id={phoneId}
                    type="tel"
                    required
                    placeholder="03xx xxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={styles.fieldInput}
                  />
                  <p className={styles.fieldHint}>Used for delivery courier alerts</p>
                </div>

                {/* City */}
                <div className={styles.fieldGroup}>
                  <label htmlFor={cityId} className={styles.fieldLabel}>
                    City *
                  </label>
                  <select
                    id={cityId}
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    {PAKISTAN_CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Full Address */}
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <label htmlFor={addressId} className={styles.fieldLabel}>
                    Full Delivery Address *
                  </label>
                  <textarea
                    id={addressId}
                    required
                    rows={3}
                    placeholder="House/Apartment #, Street, Block/Phase, Sector/Area..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={styles.fieldTextarea}
                  />
                </div>

                {/* Optional Notes */}
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <label htmlFor={notesId} className={styles.fieldLabel}>
                    Order Notes / Landmark (Optional)
                  </label>
                  <input
                    id={notesId}
                    type="text"
                    placeholder="Nearby landmark, delivery instructions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </section>

            {/* Step 2: Payment Method */}
            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionStep}>2</span>
                <h2 className={styles.sectionTitle}>Payment Method</h2>
              </div>

              <div className={styles.paymentOptions}>
                {/* Cash on Delivery (COD) - Default */}
                <div
                  className={`${styles.paymentOptionCard} ${
                    paymentMethod === "cod" ? styles.active : ""
                  }`}
                  onClick={() => setPaymentMethod("cod")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setPaymentMethod("cod");
                  }}
                >
                  <div className={styles.paymentHeader}>
                    <div className={styles.paymentHeaderLeft}>
                      <div
                        className={`${styles.radioCircle} ${
                          paymentMethod === "cod" ? styles.selected : ""
                        }`}
                      >
                        {paymentMethod === "cod" && <div className={styles.radioDot} />}
                      </div>
                      <span className={styles.paymentLabel}>Cash on Delivery (COD)</span>
                    </div>
                    <span className={styles.badgeCod}>Recommended</span>
                  </div>

                  {paymentMethod === "cod" && (
                    <div className={styles.paymentBody}>
                      Pay with cash at your doorstep when your parcel is delivered by our courier partner (TCS / Leopard). Inspect your parcel upon arrival.
                    </div>
                  )}
                </div>

                {/* Easypaisa / JazzCash */}
                <div
                  className={`${styles.paymentOptionCard} ${
                    paymentMethod === "digital" ? styles.active : ""
                  }`}
                  onClick={() => setPaymentMethod("digital")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setPaymentMethod("digital");
                  }}
                >
                  <div className={styles.paymentHeader}>
                    <div className={styles.paymentHeaderLeft}>
                      <div
                        className={`${styles.radioCircle} ${
                          paymentMethod === "digital" ? styles.selected : ""
                        }`}
                      >
                        {paymentMethod === "digital" && <div className={styles.radioDot} />}
                      </div>
                      <span className={styles.paymentLabel}>Easypaisa / JazzCash</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#666" }}>Mobile Wallet</span>
                  </div>

                  {paymentMethod === "digital" && (
                    <div className={styles.paymentBody}>
                      <div className={styles.digitalPaymentBox}>
                        <div className={styles.digitalRow}>
                          <span>Account Title:</span>
                          <strong>BATOOL ATELIER</strong>
                        </div>
                        <div className={styles.digitalRow}>
                          <span>Account / Mobile #:</span>
                          <strong>{STORE_OWNER_PHONE_DISPLAY}</strong>
                        </div>
                        <div className={styles.digitalRow}>
                          <span>Network:</span>
                          <strong>JazzCash / Easypaisa Direct</strong>
                        </div>
                      </div>
                      <p style={{ margin: "10px 0 0", fontSize: "11px", color: "#666" }}>
                        Please complete your order first. You will receive an SMS and WhatsApp confirmation with payment verification instructions.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Step 3: Trust Row ABOVE Place Order CTA */}
            <div className={styles.ctaContainer}>
              {/* 4. Trust row moved ABOVE Place Order button */}
              <div className={styles.trustRow} aria-label="Purchase guarantees">
                <div className={styles.trustItem}>
                  <span className={styles.trustIcon} aria-hidden="true">★</span>
                  <span>100% Original</span>
                </div>
                <span className={styles.trustDivider} aria-hidden="true">|</span>
                <div className={styles.trustItem}>
                  <span className={styles.trustIcon} aria-hidden="true">✓</span>
                  <span>Free Delivery in Pakistan</span>
                </div>
                <span className={styles.trustDivider} aria-hidden="true">|</span>
                <div className={styles.trustItem}>
                  <span className={styles.trustIcon} aria-hidden="true">↺</span>
                  <span>7 Days Exchange</span>
                </div>
              </div>

              {/* Place Order CTA Button */}
              <button
                type="submit"
                disabled={submitting}
                className={styles.placeOrderBtn}
              >
                {submitting
                  ? "Securing Your Order..."
                  : paymentMethod === "cod"
                  ? `Place Order - Cash on Delivery (${formatPrice(finalTotal)})`
                  : `Place Order - Easypaisa / JazzCash (${formatPrice(finalTotal)})`}
              </button>
            </div>
          </form>

          {/* Right Side: Sticky Order Summary (Second column on desktop, sticky at top: 100px) */}
          <aside className={styles.summarySection} aria-label="Order summary">
            <div className={styles.summaryHeader}>
              <h2 className={styles.summaryTitle}>Order Summary</h2>
              <span className={styles.summaryCount}>
                {items.reduce((sum, item) => sum + item.quantity, 0)} {items.length === 1 ? "Piece" : "Pieces"}
              </span>
            </div>

            {/* Product items list with 80x100 thumbnail */}
            <ul className={styles.itemsList}>
              {items.map((line) => {
                const product = getProductById(line.id);
                if (!product) return null;
                const lineTotal = product.price * line.quantity;

                return (
                  <li key={`${line.id}-${line.size}`} className={styles.itemRow}>
                    {/* 6. Product thumbnail in Order Summary 80x100 */}
                    <div className={styles.itemThumbWrapper}>
                      <Image
                        src={product.imageSlug}
                        alt={product.name}
                        width={80}
                        height={100}
                        className={styles.itemThumb}
                      />
                    </div>

                    <div className={styles.itemDetails}>
                      <h3 className={styles.itemName}>{product.name}</h3>
                      <div className={styles.itemMeta}>
                        <span className={styles.sizeBadge}>Size {line.size}</span>
                        <span>·</span>
                        <span>{formatPrice(product.price)}</span>
                      </div>

                      <div className={styles.itemQtyControls}>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          onClick={() => handleQuantityChange(line, -1)}
                          aria-label={`Decrease ${product.name} quantity`}
                        >
                          −
                        </button>
                        <span className={styles.qtyValue}>{line.quantity}</span>
                        <button
                          type="button"
                          className={styles.qtyBtn}
                          disabled={line.quantity >= MAX_QUANTITY}
                          onClick={() => handleQuantityChange(line, 1)}
                          aria-label={`Increase ${product.name} quantity`}
                        >
                          +
                        </button>

                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => handleRemoveItem(line)}
                          aria-label={`Remove ${product.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className={styles.itemPrice}>
                      {formatPrice(lineTotal)}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Promo Code Input */}
            <form onSubmit={handleApplyPromo} className={styles.promoBox}>
              <input
                type="text"
                placeholder="PROMO CODE"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className={styles.promoInput}
                aria-label="Gift card or discount code"
              />
              <button type="submit" className={styles.promoBtn}>
                Apply
              </button>
            </form>
            {promoMessage && (
              <p
                style={{
                  margin: "-12px 0 16px",
                  fontSize: "11px",
                  color: promoApplied ? "#C5A880" : "#888888",
                  fontWeight: promoApplied ? 600 : 400,
                }}
              >
                {promoMessage}
              </p>
            )}

            {/* Pricing breakdown */}
            <div className={styles.pricingTable}>
              <div className={styles.priceRow}>
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>

              {promoApplied && (
                <div className={styles.priceRow} style={{ color: "#C5A880" }}>
                  <span>Privilege Discount (10%)</span>
                  <strong>−{formatPrice(discountAmount)}</strong>
                </div>
              )}

              <div className={styles.priceRow}>
                <span>Standard Delivery in Pakistan</span>
                <span className={styles.freeDeliveryPill}>
                  <span aria-hidden="true">✓</span> FREE
                </span>
              </div>

              <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total Payable</span>
                <span className={styles.totalValue}>{formatPrice(finalTotal)}</span>
              </div>

              <p className={styles.deliveryNote}>
                Estimated delivery <strong>2–4 business days</strong> across all Pakistan cities.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
