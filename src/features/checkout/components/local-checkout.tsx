"use client";
import { useEffect, useState, type FormEvent } from "react";
import { cartActions, useCartItems } from "../../cart/model/store";
import { checkoutClient, httpCheckoutTransport } from "../model/checkout-client";
import type { DeliveryDetails, PaymentMethod, Quote, Receipt } from "../model/contracts";
import { SupportRecovery } from "./support-recovery";

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
  useEffect(() => { try {
    client.restore();
    const saved = client.pending();
    if (saved) { setQuote(saved.quote); setMethod(saved.quote.payment_method); if (saved.receipt) setReceipt(saved.receipt); }
    else if (client.operationalReceipt()) setReceipt(client.operationalReceipt()!);
    else if (client.restarting()) setFeedback("The old attempt is safely closed. Your bag is preserved. Review a replacement quote.");
  } catch { setBlocked(true); setError("Saved checkout needs review. Your bag is preserved. Contact BATOOL before another attempt."); } }, [client]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setFeedback("");
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Order unconfirmed. Your bag is preserved."); }
    finally { const saved = client.pending(); if (saved) { setQuote(saved.quote); setMethod(saved.quote.payment_method); } setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const optional = (name: string) => text(name) || null;
    const customer: DeliveryDetails = { recipient_name: text("recipient_name"), phone: text("phone"), email: optional("email"), address_line1: text("address_line1"),
      address_line2: optional("address_line2"), city: text("city"), region: optional("region"), postal_code: optional("postal_code"), country_code: "PK" };
    if (quote) void run(async () => { setReceipt(await client.place(quote, customer)); });
  }
  const canPlace = intake && methods.includes(quote?.payment_method ?? method);
  return <section aria-label={production ? "Checkout" : "Local checkout test"} aria-busy={busy}>
    <h1>{production ? "Checkout" : "Local checkout test"}</h1>
    <p>{production ? (intake ? "PKR · Ready stock · Pakistan-wide delivery" : "New orders are unavailable. Keep your bag and recover any saved attempt below.") : "Disposable backend only. Live checkout remains unavailable."}</p>
    {error && <p role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {receipt ? <div role="status"><h2>Order saved</h2><p>Reference: {receipt.order_id}</p><p>Total: {money(receipt.total_minor)} · Payment: {receipt.payment_status}</p>
      <p>Wallet payments require manual verification. An order confirmation does not confirm payment.</p>
      <button onClick={() => { try { client.startAnother(); setReceipt(null); setQuote(null); } catch { setError("Saved checkout could not be cleared. Keep this order reference."); } }}>Start another order</button>
    </div> : <>
      {intake && methods.length > 0 && <label>Payment method <select value={methods.includes(method) ? method : ""} disabled={busy || !!client.pending() || blocked} onChange={event => { setMethod(event.target.value as PaymentMethod); setQuote(null); }}>
        <option value="" disabled>Choose an available method</option>
        {methods.map(value => <option key={value} value={value}>{value === "cod" ? "Cash on delivery" : value === "easypaisa" ? "Easypaisa — manual verification" : "JazzCash — manual verification"}</option>)}
      </select></label>}
      <button disabled={busy || !cart.length || !!client.pending() || blocked || !intake || !methods.includes(method)} onClick={() => void run(async () => { setQuote(await client.quote(cart, method)); })}>{client.restarting() ? "Review replacement quote" : "Check current prices and shipping"}</button>
      {quote && <>
        <ul>{quote.lines.map(line => <li key={`${line.id}:${line.size}`}>{line.name} · {line.size} · {line.quantity} × {money(line.unit_price_minor)}</li>)}</ul>
        <p>Subtotal: {money(quote.subtotal_minor)} · Shipping: {money(quote.shipping_minor)} · Total: {money(quote.total_minor)}</p>
        <p>Pakistan-wide delivery. Quote expires: {new Date(quote.expires_at).toLocaleString()}</p>
        <p>Checkout reference: {quote.quote_id}</p>
        <p>{quote.payment_instructions}</p><p>{quote.policy_text}</p>
        <form onSubmit={submit}>
          <fieldset disabled={busy || blocked || client.pending()?.quoteMismatch || !canPlace}><legend>Delivery details</legend>
            <label>Recipient name<input name="recipient_name" required maxLength={160} autoComplete="name" /></label>
            <label>Phone (92 followed by 10 digits)<input name="phone" type="tel" required pattern="92[0-9]{10}" autoComplete="tel" /></label>
            <label>Email (optional)<input name="email" type="email" maxLength={254} autoComplete="email" /></label>
            <label>Address<input name="address_line1" required maxLength={300} autoComplete="address-line1" /></label>
            <label>Address line 2 (optional)<input name="address_line2" maxLength={300} autoComplete="address-line2" /></label>
            <label>City<input name="city" required maxLength={120} autoComplete="address-level2" /></label>
            <label>Province / region (optional)<input name="region" maxLength={120} autoComplete="address-level1" /></label>
            <label>Postal code (optional)<input name="postal_code" maxLength={32} autoComplete="postal-code" /></label>
            <p>Country: Pakistan</p><label><input type="checkbox" required /> I reviewed the displayed total, payment instructions, and policy.</label>
            <button type="submit">{client.pending() ? "Retry saved request" : "Place order"}</button>
          </fieldset>
        </form>
      </>}
      {!!client.pending() && <button disabled={busy || blocked} onClick={() => void run(async () => {
        const saved = await client.recover(); if (saved) setReceipt(saved); else setFeedback("No committed order found yet. Resolve saved checkout will wait for an in-flight attempt, recover an existing order, or safely close the old attempt. Your bag is preserved.");
      })}>Check saved order</button>}
      {!!client.pending() && <>
        <p>Resolve saved checkout checks any order already in progress. An existing order is recovered; only an uncommitted attempt can be closed for a restart. Your bag stays until an order is confirmed.</p>
        <button disabled={busy || blocked} onClick={() => void run(async () => {
          const result = await client.resolve();
          if (result.status === "committed") setReceipt(result.receipt);
          else { setQuote(null); setFeedback("The old attempt is safely closed. Your bag is preserved. Review a replacement quote before ordering."); }
        })}>Resolve saved checkout</button>
      </>}
    </>}
    {recovery && <SupportRecovery endpoint={endpoint} accept={value => {
      const recovered = client.adoptRecovery(value); setReceipt(recovered); setQuote(null); setBlocked(false);
      setFeedback(recovered ? "Existing order recovered." : "The original attempt is durably closed. Your bag is preserved. Review a replacement quote.");
    }} />}
  </section>;
}
