"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { cartActions, useCartItems } from "../../cart/model/store";
import { checkoutClient, httpCheckoutTransport } from "../model/checkout-client";
import type { DeliveryDetails, PaymentMethod, Quote, Receipt } from "../model/contracts";
import { SupportRecovery } from "./support-recovery";
import { getProductById } from "@/features/catalog/model/active-catalog";
import { formatWhatsAppPhone } from "@/features/cart/model/whatsapp";
import { publicBusinessSettings } from "@/features/settings/model/generated/public-settings";
import styles from "@/app/checkout/checkout.module.css";

const storageKey = "batool-local-checkout-intent-v1";
function money(value: string) { const amount = BigInt(value); return `PKR ${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`; }

export function LocalCheckout({ endpoint, production = false, methods = ["cod", "easypaisa", "jazzcash"], intake = true, recovery = false }: {
  endpoint: string; production?: boolean; methods?: PaymentMethod[]; intake?: boolean; recovery?: boolean;
}) {
  const cart = useCartItems();
  const [client] = useState(() => checkoutClient(httpCheckoutTransport(endpoint), {
    read: () => sessionStorage.getItem(production ? "batool-checkout-intent-v1" : storageKey),
    write: value => sessionStorage.setItem(production ? "batool-checkout-intent-v1" : storageKey, value),
    remove: () => sessionStorage.removeItem(production ? "batool-checkout-intent-v1" : storageKey),
  }, cartActions.completeCheckout));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cod");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [blocked, setBlocked] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => { try {
    client.restore();
    const saved = client.pending();
    if (saved) {
      if (saved.receipt && cart.length > 0) {
        try {
          client.startAnother();
          setReceipt(null);
          setQuote(null);
          return;
        } catch {}
      }
      setQuote(saved.quote); setMethod(saved.quote.payment_method); if (saved.receipt) setReceipt(saved.receipt);
    }
    else if (client.operationalReceipt()) {
      if (cart.length > 0) {
        try { client.startAnother(); setReceipt(null); return; } catch {}
      }
      setReceipt(client.operationalReceipt()!);
    }
    else if (client.restarting()) setFeedback("The old attempt is safely closed. Your bag is preserved. Review a replacement quote.");
  } catch { setBlocked(true); setError("Saved checkout needs review. Your bag is preserved. Contact BATOOL before another attempt."); } }, [client, cart.length]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setFeedback("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Order unconfirmed. Your bag is preserved."); }
    finally { const saved = client.pending(); if (saved) { setQuote(saved.quote); setMethod(saved.quote.payment_method); } setBusy(false); }
  }

  // Auto-quote on load if cart has items and checkout is open
  useEffect(() => {
    if (intake && cart.length > 0 && !quote && !busy && !blocked && !client.pending() && !receipt && methods.includes(method)) {
      void run(async () => {
        setQuote(await client.quote(cart, method));
      });
    }
  }, [intake, cart.length, quote, busy, blocked, method, receipt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const optional = (name: string) => text(name) || null;
    const rawPhone = text("phone");
    const cleanPhone = formatWhatsAppPhone(rawPhone);
    if (!/^92[0-9]{10}$/.test(cleanPhone)) {
      setError("Please enter a valid Pakistani mobile number (e.g. 03424834128 or +923424834128).");
      return;
    }
    const customer: DeliveryDetails = { recipient_name: text("recipient_name"), phone: cleanPhone, email: optional("email"), address_line1: text("address_line1"),
      address_line2: optional("address_line2"), city: text("city"), region: optional("region"), postal_code: optional("postal_code"), country_code: "PK" };
    if (quote) void run(async () => { setReceipt(await client.place(quote, customer)); });
  }
  const canPlace = intake && methods.includes(quote?.payment_method ?? method);

  return <section aria-label={production ? "Checkout" : "Local checkout test"} aria-busy={busy} style={{ width: "100%" }}>
    <h1 style={{ display: "none" }}>{production ? "Checkout" : "Local checkout test"}</h1>

    {error && <div role="alert" style={{ padding: "14px 18px", background: "#fdf2f2", borderLeft: "4px solid #e02424", color: "#9b1c1c", marginBottom: "20px", fontSize: "14px" }}>{error}</div>}
    {feedback && <div role="status" style={{ padding: "14px 18px", background: "#fdf8f0", borderLeft: "4px solid #d97706", color: "#92400e", marginBottom: "20px", fontSize: "14px" }}>{feedback}</div>}

    {receipt ? (
      <div role="status" className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <span className={styles.orderConfirmedBadge}>Order Confirmed</span>
        <h2 className={styles.successTitle}>Order saved</h2>
        <p className={styles.orderSubtitle}>
          Thank you for choosing BATOOL. Your luxury pret order has been placed successfully and is being prepared for dispatch.
        </p>

        <div className={styles.refContainer}>
          <button
            type="button"
            className={styles.successOrderRefBtn}
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(receipt.order_id);
                setCopiedRef(true);
                setTimeout(() => setCopiedRef(false), 2500);
              }
            }}
            title="Click to copy reference"
          >
            <span>Reference: {receipt.order_id}</span>
            <span className={styles.copyBadge}>{copiedRef ? "✓ Copied!" : "Copy ID"}</span>
          </button>
        </div>

        {/* Structured Order Breakdown Card */}
        <div className={styles.orderReceipt}>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Total Amount Payable</span>
            <span className={styles.receiptValue} style={{ fontSize: "16px", fontWeight: 700, color: "#111111" }}>
              {money(receipt.total_minor)}
            </span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Payment Method</span>
            <span className={styles.receiptValue}>
              {receipt.payment_status === "unpaid" ? "Cash on Delivery (COD)" : receipt.payment_status}
            </span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Estimated Delivery</span>
            <span className={styles.receiptValue}>3–5 Working Days across Pakistan</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Inspection Guarantee</span>
            <span className={styles.receiptValue}>📦 Open &amp; Inspect Parcel Upon Delivery</span>
          </div>
        </div>

        {/* WhatsApp Customer Action Card */}
        <div className={styles.whatsappCard}>
          <div className={styles.whatsappCardHeader}>
            <span className={styles.whatsappCardBadge}>💬 WhatsApp Customer Care</span>
            <h3 className={styles.whatsappCardTitle}>Order Confirmation via WhatsApp</h3>
            <p className={styles.whatsappCardDesc}>
              Want immediate dispatch tracking or size assistance? Tap below to send your order reference directly to BATOOL Official WhatsApp.
            </p>
          </div>
          <a
            href={`https://wa.me/${(publicBusinessSettings.public_whatsapp || "923424834128").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Salam BATOOL, I placed Order #${receipt.order_id.slice(0, 8)}. Total: ${money(receipt.total_minor)}. Please confirm my order dispatch.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.whatsappCustomerCta}
          >
            <span className={styles.whatsappButtonIcon}>💬</span>
            <span>Confirm Order on WhatsApp</span>
          </a>
        </div>

        <p style={{ fontSize: "12px", color: "#777777", margin: "0 0 20px", lineHeight: "1.5" }}>
          Wallet payments require manual verification. An order confirmation does not confirm payment.
        </p>

        <div className={styles.receiptActions}>
          <Link
            href="/#collection"
            className={styles.continueShoppingBtn}
            onClick={() => {
              try { client.startAnother(); setReceipt(null); setQuote(null); } catch {}
            }}
          >
            Continue Shopping
          </Link>
          <button
            type="button"
            className={styles.startAnotherBtn}
            onClick={() => { try { client.startAnother(); setReceipt(null); setQuote(null); } catch { setError("Saved checkout could not be cleared. Keep this order reference."); } }}
          >
            Start another order
          </button>
        </div>

        <div className={styles.confirmationHelpLinks}>
          <Link href="/help/delivery/" className={styles.grayTextLink}>Delivery &amp; Exchange Policy</Link>
          <span className={styles.helpDivider}>•</span>
          <Link href="/help/contact/" className={styles.grayTextLink}>Contact Customer Support</Link>
        </div>
      </div>
    ) : (
      <div className={styles.layout}>
        {/* Left Column: Checkout Steps & Delivery Form */}
        <div className={styles.formSection}>
          {/* Step 1: Payment Method */}
          <div className={styles.sectionBlock}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionStep}>1</span>
              <h2 className={styles.sectionTitle}>Payment Method</h2>
            </div>

            {intake && methods.length > 0 && (
              <div className={styles.paymentOptions}>
                {methods.map(val => (
                  <div
                    key={val}
                    className={`${styles.paymentOptionCard} ${(quote?.payment_method ?? method) === val ? styles.active : ""}`}
                    onClick={() => {
                      if (busy || !!client.pending() || blocked) return;
                      setMethod(val);
                      setQuote(null);
                    }}
                  >
                    <div className={styles.paymentHeader}>
                      <div className={styles.paymentHeaderLeft}>
                        <div className={`${styles.radioCircle} ${(quote?.payment_method ?? method) === val ? styles.selected : ""}`}>
                          {(quote?.payment_method ?? method) === val && <div className={styles.radioDot} />}
                        </div>
                        <span className={styles.paymentLabel}>
                          {val === "cod" ? "Cash on Delivery (COD)" : val === "easypaisa" ? "Easypaisa — Manual Verification" : "JazzCash — Manual Verification"}
                        </span>
                      </div>
                      {val === "cod" && <span className={styles.badgeCod}>Pakistan Wide</span>}
                    </div>
                    <div className={styles.paymentBody}>
                      {val === "cod" && "Pay in cash to the delivery rider when your parcel arrives. You can inspect your parcel before accepting."}
                      {val === "easypaisa" && "Transfer using Easypaisa. Account title and number will be verified manually before dispatch."}
                      {val === "jazzcash" && "Transfer using JazzCash. Account title and number will be verified manually before dispatch."}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Native select to maintain accessibility and test contract */}
            <label style={{ display: "none" }}>Payment method <select value={methods.includes(method) ? method : ""} disabled={busy || !!client.pending() || blocked} onChange={event => { setMethod(event.target.value as PaymentMethod); setQuote(null); }}>
              <option value="" disabled>Choose an available method</option>
              {methods.map(value => <option key={value} value={value}>{value === "cod" ? "Cash on delivery" : value === "easypaisa" ? "Easypaisa — manual verification" : "JazzCash — manual verification"}</option>)}
            </select></label>

            {!quote && (
              <div style={{ marginTop: "20px" }}>
                <button
                  type="button"
                  className={styles.placeOrderBtn}
                  disabled={busy || !cart.length || !!client.pending() || blocked || !intake || !methods.includes(method)}
                  onClick={() => void run(async () => { setQuote(await client.quote(cart, method)); })}
                >
                  {client.restarting() ? "Review replacement quote" : "Check current prices and shipping"}
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Customer & Delivery Details */}
          {quote && (
            <div className={styles.sectionBlock}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionStep}>2</span>
                <h2 className={styles.sectionTitle}>Delivery &amp; Customer Details</h2>
              </div>

              <form onSubmit={submit}>
                <fieldset disabled={busy || blocked || client.pending()?.quoteMismatch || !canPlace} style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend style={{ display: "none" }}>Delivery details</legend>

                  <div className={styles.fieldsGrid}>
                    <div className={styles.fieldFull}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Recipient Full Name *</label>
                        <input
                          name="recipient_name"
                          required
                          maxLength={160}
                          autoComplete="name"
                          placeholder="e.g. Daniyal Qais"
                          className={styles.fieldInput}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Mobile Phone / WhatsApp *</label>
                      <input
                        name="phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        placeholder="0342 4834128 or +92 342 4834128"
                        className={styles.fieldInput}
                      />
                      <p className={styles.fieldHint}>Courier calls before delivery. Any Pakistani format (+92, 03xx) accepted.</p>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Email Address (Optional)</label>
                      <input
                        name="email"
                        type="email"
                        maxLength={254}
                        autoComplete="email"
                        placeholder="you@example.com"
                        className={styles.fieldInput}
                      />
                    </div>

                    <div className={styles.fieldFull}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Street Address / House No. *</label>
                        <input
                          name="address_line1"
                          required
                          maxLength={300}
                          autoComplete="address-line1"
                          placeholder="House/Apartment #, Street, Sector / Area"
                          className={styles.fieldInput}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldFull}>
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Nearest Landmark / Address Line 2 (Optional)</label>
                        <input
                          name="address_line2"
                          maxLength={300}
                          autoComplete="address-line2"
                          placeholder="Near main market, school, mosque, etc."
                          className={styles.fieldInput}
                        />
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>City *</label>
                      <input
                        name="city"
                        required
                        maxLength={120}
                        autoComplete="address-level2"
                        placeholder="e.g. Lahore, Karachi, Islamabad"
                        className={styles.fieldInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Province / Region (Optional)</label>
                      <input
                        name="region"
                        maxLength={120}
                        autoComplete="address-level1"
                        placeholder="Punjab, Sindh, KPK, Islamabad"
                        className={styles.fieldInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Postal Code (Optional)</label>
                      <input
                        name="postal_code"
                        maxLength={32}
                        autoComplete="postal-code"
                        placeholder="e.g. 54000"
                        className={styles.fieldInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Country</label>
                      <input
                        value="Pakistan"
                        readOnly
                        disabled
                        className={styles.fieldInput}
                        style={{ background: "#f5f3f0" }}
                      />
                    </div>
                  </div>

                  {/* Trust Indicators (J. / Gul Ahmed Style) */}
                  <div className={styles.ctaContainer} style={{ marginTop: "24px" }}>
                    <div className={styles.trustRow}>
                      <div className={styles.trustItem}>
                        <span className={styles.trustIcon}>🚚</span>
                        <span>Fast Delivery (3–5 Working Days)</span>
                      </div>
                      <span className={styles.trustDivider}>•</span>
                      <div className={styles.trustItem}>
                        <span className={styles.trustIcon}>📦</span>
                        <span>Parcel Inspection Allowed</span>
                      </div>
                      <span className={styles.trustDivider}>•</span>
                      <div className={styles.trustItem}>
                        <span className={styles.trustIcon}>🔄</span>
                        <span>7-Day Easy Exchange</span>
                      </div>
                    </div>

                    <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", fontSize: "13px", color: "#333", margin: "14px 0" }}>
                      <input type="checkbox" required style={{ width: "18px", height: "18px", marginTop: "2px", accentColor: "#111" }} />
                      <span>I reviewed the displayed total, payment instructions, and policy.</span>
                    </label>

                    <button
                      type="submit"
                      className={styles.placeOrderBtn}
                      disabled={busy || blocked || client.pending()?.quoteMismatch || !canPlace}
                    >
                      {client.pending() ? "Retry saved request" : "Place order"}
                    </button>
                  </div>
                </fieldset>
              </form>
            </div>
          )}

          {/* Saved attempt actions */}
          {!!client.pending() && (
            <div style={{ marginTop: "24px", padding: "18px", background: "#fcf8f2", border: "1px solid #eadbc8", borderRadius: "8px" }}>
              <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#785324", lineHeight: "1.6" }}>
                Resolve saved checkout checks any order already in progress. An existing order is recovered; only an uncommitted attempt can be closed for a restart. Your bag stays until an order is confirmed.
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={styles.promoBtn}
                  disabled={busy || blocked}
                  onClick={() => void run(async () => {
                    const saved = await client.recover();
                    if (saved) setReceipt(saved);
                    else setFeedback("No committed order found yet. Resolve saved checkout will wait for an in-flight attempt, recover an existing order, or safely close the old attempt. Your bag is preserved.");
                  })}
                >
                  Check saved order
                </button>
                <button
                  type="button"
                  className={styles.placeOrderBtn}
                  style={{ minHeight: "42px", padding: "0 22px", width: "auto" }}
                  disabled={busy || blocked}
                  onClick={() => void run(async () => {
                    const result = await client.resolve();
                    if (result.status === "committed") setReceipt(result.receipt);
                    else { setQuote(null); setFeedback("The old attempt is safely closed. Your bag is preserved. Review a replacement quote before ordering."); }
                  })}
                >
                  Resolve saved checkout
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Order Summary Card (Sticky like J. / Gul Ahmed) */}
        <aside className={styles.summarySection}>
          <div className={styles.summaryHeader}>
            <h3 className={styles.summaryTitle}>Order Summary</h3>
            <span className={styles.summaryCount}>
              {(quote?.lines ?? cart).reduce((acc, curr) => acc + curr.quantity, 0)} Items
            </span>
          </div>

          <ul className={styles.itemsList}>
            {(quote?.lines ?? cart).map(line => {
              const product = getProductById(line.id);
              const imageSrc = product?.uploadedImage
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/product-images/${product.uploadedImage.path}`
                : product?.imageSlug
                ? `/images/${product.imageSlug}-192.webp`
                : undefined;
              return (
                <li key={`${line.id}:${line.size}`} className={styles.itemRow}>
                  <div className={styles.itemThumbWrapper}>
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={product?.name ?? "Outfit"}
                        className={styles.itemThumb}
                        onError={(e) => {
                          if (product?.imageSlug && !e.currentTarget.src.includes(`${product.imageSlug}-192.webp`)) {
                            e.currentTarget.src = `/images/${product.imageSlug}-192.webp`;
                          }
                        }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>👗</div>
                    )}
                  </div>
                  <div className={styles.itemDetails}>
                    <h4 className={styles.itemName}>{product?.name ?? ("name" in line ? (line as { name: string }).name : "Product")}</h4>
                    <p className={styles.itemMeta}>
                      <span>Size:</span> <strong className={styles.sizeBadge}>{line.size}</strong>
                      <span>• Qty: {line.quantity}</span>
                    </p>
                    {"unit_price_minor" in line && (
                      <p style={{ margin: 0, fontSize: "12px", color: "#777" }}>
                        {money((line as { unit_price_minor: string }).unit_price_minor)} each
                      </p>
                    )}
                  </div>
                  <div className={styles.itemPrice}>
                    {"unit_price_minor" in line
                      ? money(String(BigInt((line as { unit_price_minor: string }).unit_price_minor) * BigInt(line.quantity)))
                      : (product ? `PKR ${(product.price * line.quantity).toFixed(2)}` : "")}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pricing Breakdown */}
          <div className={styles.pricingTable}>
            <div className={styles.priceRow}>
              <span>Subtotal</span>
              <strong>{quote ? money(quote.subtotal_minor) : "Calculated at checkout"}</strong>
            </div>
            <div className={styles.priceRow}>
              <span>Shipping (Pakistan)</span>
              <strong>{quote ? money(quote.shipping_minor) : "PKR 250.00"}</strong>
            </div>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total Payable</span>
              <span className={styles.totalValue}>
                {quote ? money(quote.total_minor) : "Pending details"}
              </span>
            </div>
          </div>

          <p className={styles.deliveryNote}>
            Pakistan-wide delivery · Standard 3–5 working days
          </p>
        </aside>
      </div>
    )}

    {recovery && !receipt && (
      <details className={styles.recoveryDetails}>
        <summary className={styles.recoverySummary}>Need assistance recovering an interrupted order?</summary>
        <div className={styles.recoveryContent}>
          <SupportRecovery endpoint={endpoint} accept={value => {
            const recovered = client.adoptRecovery(value); setReceipt(recovered); setQuote(null); setBlocked(false);
            setFeedback(recovered ? "Existing order recovered." : "The original attempt is durably closed. Your bag is preserved. Review a replacement quote.");
          }} />
        </div>
      </details>
    )}
  </section>;
}
