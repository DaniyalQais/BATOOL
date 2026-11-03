"use client";
import { Suspense, useEffect, useState } from "react";
import { LocalCheckout } from "@/features/checkout/components/local-checkout";
import { ProductionCheckout } from "@/features/checkout/components/production-checkout";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCartItems } from "@/features/cart/model/store";
import { checkoutTotals } from "@/features/cart/model/checkout";
import { publicBusinessSettings as settings } from "@/features/settings/model/generated/public-settings";
import { shippingDescription } from "@/features/settings/model/shipping";
import { getProductById } from "@/features/catalog/model/active-catalog";
import { formatPrice } from "@/lib/format";
import styles from "./checkout.module.css";

export default function CheckoutPage() {
  return <Suspense fallback={<main className={styles.checkoutPage}><p role="status">Loading checkout...</p></main>}><Checkout /></Suspense>;
}
function Checkout() {
  const [local, setLocal] = useState(false);
  const endpoint = process.env.NEXT_PUBLIC_LOCAL_CHECKOUT_URL ?? "";
  const productionEndpoint = process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT ?? "";
  const release = process.env.NEXT_PUBLIC_CHECKOUT_RELEASE === "true";
  const recovery = process.env.NEXT_PUBLIC_RECOVERY_RELEASE === "true";
  useEffect(() => { setLocal(!!endpoint && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)); }, [endpoint]);
  const preview = useSearchParams().get("preview") === "1";
  const items = useCartItems();
  const totals = checkoutTotals(items, false, settings.shipping);
  return <main id="main" className={styles.checkoutPage}>
    <div className={styles.container}>
      <div className={styles.topNav}><Link href="/" className={styles.brandWordmark}>BATOOL</Link></div>
      <section className={styles.emptyCard}>
        {local ? <LocalCheckout endpoint={endpoint} /> : productionEndpoint && (release || recovery) ?
          <ProductionCheckout endpoint={productionEndpoint} release={release} recovery={recovery} /> : <>
        <h1>{preview ? "Your bag preview" : "Checkout is unavailable"}</h1>
        <p>Orders and payments are not enabled. COD, Easypaisa and JazzCash will become available after the required details and backend handling are ready.</p>
        <p>PKR · Ready stock · {shippingDescription(settings.shipping)}</p>
        {preview && <>
          <p>This is a local bag summary. No order is created and no payment or message is sent.</p>
          <ul>{items.map(line => <li key={line.id + "-" + line.size}>{getProductById(line.id)?.name ?? "Product"} · Size {line.size} · Qty {line.quantity}</li>)}</ul>
          <p>Preview subtotal: {formatPrice(totals.subtotal)} · Shipping: {totals.shipping === null ? "Unconfigured" : formatPrice(totals.shipping)}</p>
        </>}
        <p><Link href="/help/delivery/">Delivery and policy information</Link></p>
        <p><Link href="/help/contact/">Contact BATOOL</Link></p>
        <Link href="/#collection" className={styles.emptyBtn}>Back to collection</Link>
        </>}
      </section>
    </div>
  </main>;
}
