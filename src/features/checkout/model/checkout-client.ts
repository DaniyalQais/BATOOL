import type { CartLine } from "../../cart/model/cart.ts";
import { isIntentResolution, isQuote, isReceipt, matchesQuote, object, uuid, type DeliveryDetails, type PaymentMethod, type Quote, type Receipt } from "./contracts.ts";

type Pending = { scope: string; key: string; quote: Quote; cart: readonly CartLine[]; receipt?: Receipt; quoteMismatch?: true };
type Restart = { state: "restart"; scope: string; resolution_id: string; replacement_key: string };
type StoragePort = { read(): string | null; write(value: string): void; remove(): void };
type Transport = (body: Record<string, unknown>) => Promise<unknown>;
export function checkoutClient(transport: Transport, storage: StoragePort, complete: (cart: readonly CartLine[]) => void) {
  let pending: Pending | undefined;
  let restart: Restart | undefined;
  let scope: string | undefined;
  let busy = false;
  let operationalReceipt: Receipt | undefined;
  let storageValid = true;
  function restore() {
    storageValid = false;
    const raw = storage.read();
    if (!raw) { storageValid = true; return; }
    const value: unknown = JSON.parse(raw);
    if (object(value) && value.state === "operational_receipt" && isReceipt(value.receipt)) {
      operationalReceipt = value.receipt; storageValid = true; return;
    }
    if (object(value) && value.state === "restart") {
      if (typeof value.scope !== "string" || typeof value.resolution_id !== "string" || !uuid.test(value.resolution_id)
        || typeof value.replacement_key !== "string" || !uuid.test(value.replacement_key)) throw new Error("Saved recovery needs review. Your bag is preserved.");
      restart = { state: "restart", scope: value.scope, resolution_id: value.resolution_id, replacement_key: value.replacement_key };
      scope = restart.scope; storageValid = true; return;
    }
    if (!object(value) || typeof value.scope !== "string" || typeof value.key !== "string" || !uuid.test(value.key)
      || !isQuote(value.quote) || !Array.isArray(value.cart)) throw new Error("Saved checkout needs review. Your bag has been preserved.");
    const expected = value.quote.lines.map(({ id, size, quantity }) => ({ id, size, quantity }));
    if (JSON.stringify(value.cart) !== JSON.stringify(expected)
      || (value.receipt !== undefined && (!isReceipt(value.receipt) || !matchesQuote(value.receipt, value.quote)))) throw new Error("Saved checkout needs review. Your bag has been preserved.");
    if (value.quoteMismatch !== undefined && value.quoteMismatch !== true) throw new Error("Saved checkout needs review. Your bag is preserved.");
    pending = { scope: value.scope, key: value.key, quote: value.quote, cart: expected,
      ...(isReceipt(value.receipt) ? { receipt: value.receipt } : {}), ...(value.quoteMismatch === true ? { quoteMismatch: true } : {}) };
    scope = pending.scope;
    storageValid = true;
  }
  async function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("Checkout is already in progress.");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  function confirmed(value: unknown) {
    if (!pending || !object(value) || value.confirmed !== true || !isReceipt(value.receipt) || !matchesQuote(value.receipt, pending.quote)) {
      throw new Error("Order commit is not confirmed. Your bag is preserved. Check or retry this same request.");
    }
    // Mark confirmation before touching the bag. On an interrupted reload this
    // favors retaining the bag over consuming it twice. No PII is persisted.
    const receipt = value.receipt;
    storage.write(JSON.stringify({ ...pending, receipt }));
    const consume = !pending.receipt;
    pending = { ...pending, receipt };
    if (consume) complete(pending.cart);
    // Keep the receipt and key for reload recovery. A new purchase needs a fresh
    // page/session after reviewing this receipt, not an automatic retry identity.
    return receipt;
  }
  return {
    restore,
    pending: () => pending,
    restarting: () => !!restart,
    operationalReceipt: () => operationalReceipt,
    adoptRecovery(value: unknown) {
      if (!storageValid) throw new Error("Saved checkout identity is unreadable. Keep it for support reconciliation before replacement.");
      if (busy || !object(value) || !isIntentResolution(value.resolution)) throw new Error("Recovery is unconfirmed. Your bag is preserved.");
      const resolution = value.resolution;
      if (restart && (resolution.status !== "retired" || restart.resolution_id !== resolution.resolution_id
        || restart.replacement_key !== resolution.replacement_key)) {
        throw new Error("Another replacement checkout is unresolved. Keep both references for support reconciliation.");
      }
      if (pending && !pending.receipt && pending.quote.quote_id !== (resolution.status === "committed" ? resolution.receipt.quote_id : resolution.quote_id)) {
        throw new Error("Another saved checkout is unresolved. Keep both references and contact support.");
      }
      if (resolution.status === "committed") {
        if (pending) return confirmed({ confirmed: true, receipt: resolution.receipt });
        // Missing original local cart snapshot: recover status conservatively,
        // never clear a potentially unrelated current bag.
        storage.write(JSON.stringify({ state: "operational_receipt", receipt: resolution.receipt }));
        operationalReceipt = resolution.receipt; return resolution.receipt;
      }
      if (typeof value.scope !== "string" || !value.scope) throw new Error("Recovery is unconfirmed.");
      const next: Restart = { state: "restart", scope: value.scope, resolution_id: resolution.resolution_id, replacement_key: resolution.replacement_key };
      storage.write(JSON.stringify(next)); restart = next; scope = next.scope; pending = undefined; operationalReceipt = undefined;
      return null;
    },
    startAnother() {
      if (busy || (!pending?.receipt && !operationalReceipt)) throw new Error("Confirm the saved order before starting another.");
      storage.remove();
      pending = undefined;
      scope = undefined;
      operationalReceipt = undefined;
    },
    quote(cart: readonly CartLine[], method: PaymentMethod) { return exclusive(async () => {
      if (pending || operationalReceipt) throw new Error("Resolve the saved checkout before starting another order.");
      if (!scope) {
        const result = await transport({ action: "scope" });
        if (!object(result) || typeof result.scope !== "string") throw new Error("Checkout is unavailable.");
        scope = result.scope;
      }
      const result = await transport(restart ? { action: "replacement_quote", scope: restart.scope, resolution_id: restart.resolution_id, cart, method }
        : { action: "quote", scope, cart, method });
      if (!object(result) || !isQuote(result.quote)) throw new Error("Could not confirm current prices and shipping.");
      const sorted = [...cart].sort((a, b) => a.id - b.id || a.size.localeCompare(b.size));
      const quoted = result.quote.lines.map(({ id, size, quantity }) => ({ id, size, quantity }));
      const matches = JSON.stringify(sorted) === JSON.stringify(quoted) && method === result.quote.payment_method;
      if (restart) {
        const next: Pending = { scope: restart.scope, key: restart.replacement_key, quote: result.quote, cart: quoted, ...(!matches ? { quoteMismatch: true } : {}) };
        // The server pins this quote/key. Save that binding even before Place:
        // lost responses, reloads and another tab must not invent a new key.
        storage.write(JSON.stringify(next)); pending = next; restart = undefined;
      }
      if (!matches) throw new Error(pending ? "The saved replacement uses a different bag. Resolve this saved attempt before quoting your current bag."
        : "The quote does not match your bag.");
      return result.quote;
    }); },
    place(quote: Quote, customer: DeliveryDetails) { return exclusive(async () => {
      if (!scope || !isQuote(quote)) throw new Error("Review a current quote first.");
      if (!pending) {
        pending = { scope, key: crypto.randomUUID(), quote, cart: quote.lines.map(({ id, size, quantity }) => ({ id, size, quantity })) };
        // Durable intent must exist BEFORE sending the order. Storage failure
        // blocks submission, so a reload cannot silently generate another key.
        try { storage.write(JSON.stringify(pending)); } catch { pending = undefined; throw new Error("Checkout recovery storage is unavailable. No order was sent."); }
      }
      if (pending.quote.quote_id !== quote.quote_id) throw new Error("Retry the saved checkout.");
      if (pending.quoteMismatch) throw new Error("Resolve the saved replacement before placing another order.");
      if (pending.receipt) return pending.receipt;
      return confirmed(await transport({ action: "create", scope: pending.scope, key: pending.key, quote_id: pending.quote.quote_id, customer }));
    }); },
    recover() { return exclusive(async () => {
      if (!pending) return null;
      if (pending.receipt) return pending.receipt;
      const result = await transport({ action: "recover", scope: pending.scope, key: pending.key });
      if (object(result) && result.confirmed === false) return null; // Not proof a concurrent attempt cannot still commit.
      return confirmed(result);
    }); },
    resolve() { return exclusive(async () => {
      if (!pending) throw new Error("No saved checkout needs resolution.");
      if (pending.receipt) return { status: "committed" as const, receipt: pending.receipt };
      const result = await transport({ action: "resolve", scope: pending.scope, key: pending.key, quote_id: pending.quote.quote_id });
      if (!object(result) || !isIntentResolution(result.resolution)) throw new Error("Recovery is unconfirmed. Keep this saved request and try recovery again. Your bag is preserved.");
      const resolved = result.resolution;
      if (resolved.status === "committed") return { status: "committed" as const, receipt: confirmed({ confirmed: true, receipt: resolved.receipt }) };
      if (resolved.quote_id !== pending.quote.quote_id || resolved.replacement_key === pending.key || typeof result.scope !== "string") {
        throw new Error("Recovery does not match the saved request. Your bag is preserved.");
      }
      const next: Restart = { state: "restart", scope: result.scope, resolution_id: resolved.resolution_id, replacement_key: resolved.replacement_key };
      // Only a confirmed durable retirement releases the old intent. Failure to
      // persist it keeps the old identity so recovery can be safely repeated.
      storage.write(JSON.stringify(next)); restart = next; scope = next.scope; pending = undefined;
      return { status: "retired" as const };
    }); },
  };
}

export function httpCheckoutTransport(endpoint: string): Transport {
  return async body => {
    const response = await fetch(endpoint, { method: "POST", cache: "no-store", credentials: "omit",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    // Preserve backend‑provided error payloads (e.g. { error: "commit_unconfirmed" })
    if (!response.ok) {
      try {
        const json = await response.json();
        if (json && typeof json.error === "string") {
          throw new Error(json.error);
        }
      } catch (_) {
        // Fallback to generic messages for non‑JSON error bodies
        const messages: Record<number, string> = {
          400: "Check your delivery details. Use a Pakistani phone number in 92 format.",
          401: "Checkout recovery has expired. Contact BATOOL before starting another order.",
          409: "The saved request or quote is unavailable. Use Resolve saved checkout to recover an order or safely restart. Your bag is preserved.",
          429: "Please wait before retrying the same request.",
          503: "checkout_unavailable",
        };
        throw new Error(messages[response.status] ?? "Order commit is unconfirmed. Your bag is preserved; check or retry the same request.");
      }
    }
    return response.json();
  };
}
