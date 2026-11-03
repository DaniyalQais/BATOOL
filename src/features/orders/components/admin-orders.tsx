"use client";
import { useEffect, useState } from "react";
import { adminClient, accessPort } from "../../auth/model/browser-client.ts";
import type { DashboardRole } from "../../auth/model/access.ts";
import { orderReader } from "../model/order-reader.ts";
import { fulfillmentStatuses, paymentStatuses, formatPKR, orderFailure, type OrderFilters, type OrderReport, type Page } from "../model/orders.ts";
import styles from "./admin-orders.module.css";

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string; denied: boolean };
function reader() { const client = adminClient(); return orderReader(client, accessPort(client)); }
function date(value: string) { return new Date(value).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }); }
function Pagination({ name, page, hasNext, change }: { name: string; page: number; hasNext: boolean; change(page: number): void }) {
  return <nav className={styles.pagination} aria-label={`${name} pages`}>
    <button disabled={page === 0} onClick={() => change(page - 1)}>Previous {name.toLowerCase()}</button>
    <span>Page {page + 1}</span>
    <button disabled={!hasNext} onClick={() => change(page + 1)}>Next {name.toLowerCase()}</button>
  </nav>;
}
function Failure({ state, retry }: { state: Extract<Load<unknown>, { status: "error" }>; retry(): void }) {
  return <div role="alert" className={styles.notice}>
    <h3>{state.denied ? "Order access denied" : "Orders unavailable"}</h3><p>{state.message}</p>
    <button onClick={retry}>Retry order request</button>
  </div>;
}
function Amounts({ order }: { order: OrderReport }) {
  return <dl className={styles.amounts}>
    {([["Subtotal", order.subtotal_minor], ["Shipping", order.shipping_minor], ["Tax", order.tax_minor], ["Discount", order.discount_minor], ["Total", order.total_minor]] as const)
      .map(([label, amount]) => <div key={label} className={label === "Total" ? styles.totalAmount : undefined}><dt>{label}</dt><dd>{formatPKR(amount)}</dd></div>)}
  </dl>;
}
function OwnerOrderDetails({ id, close }: { id: string; close(): void }) {
  type Details = Awaited<ReturnType<ReturnType<typeof orderReader>["details"]>>;
  const [itemPage, setItemPage] = useState(0); const [historyPage, setHistoryPage] = useState(0); const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Load<Details>>({ status: "loading" });
  useEffect(() => {
    const cancel = new AbortController(); let active = true; setState({ status: "loading" });
    void (async () => {
      try { const data = await reader().details("owner", id, itemPage, historyPage, cancel.signal); if (active) setState({ status: "ready", data }); }
      catch (error) { if (active) setState({ status: "error", ...orderFailure(error) }); }
    })();
    return () => { active = false; cancel.abort(); };
  }, [id, itemPage, historyPage, attempt]);
  function items(page: number) { setState({ status: "loading" }); setItemPage(page); }
  function history(page: number) { setState({ status: "loading" }); setHistoryPage(page); }
  return <section className={styles.detail} aria-labelledby="order-details-title" aria-busy={state.status === "loading"}>
    <div className={styles.heading}><h3 id="order-details-title">Order details</h3><button onClick={close}>Close details</button></div>
    <p className={styles.id}>{id}</p>
    {state.status === "loading" && <p role="status">Loading permitted order details…</p>}
    {state.status === "error" && <Failure state={state} retry={() => setAttempt(n => n + 1)} />}
    {state.status === "ready" && <>
      <p>Fulfillment: {state.data.order.fulfillment_status} · Payment: {state.data.order.payment_status}</p>
      <Amounts order={state.data.order} />
      <CheckoutContext id={id} />
      <h4>Customer and delivery</h4>
      <dl className={styles.customer}>
        <dt>Recipient</dt><dd><strong>{state.data.customer.recipient_name}</strong></dd>
        <dt>Phone</dt><dd className={styles.phoneField}>
          <span>{state.data.customer.phone}</span>
          {state.data.customer.phone && (
            <a
              href={`https://wa.me/${state.data.customer.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Salam ${state.data.customer.recipient_name}, this is BATOOL regarding your order #${id.slice(0, 8)}. Total: ${formatPKR(state.data.order.total_minor)}. Please confirm your delivery address.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.whatsappBtn}
            >
              💬 WhatsApp Customer
            </a>
          )}
        </dd>
        <dt>Email</dt><dd>{state.data.customer.email ?? "Not provided"}</dd>
        <dt>Address</dt><dd>{[state.data.customer.address_line1, state.data.customer.address_line2, state.data.customer.city,
          state.data.customer.region, state.data.customer.postal_code, state.data.customer.country_code].filter(Boolean).join(", ")}</dd>
      </dl>
      <h4>Order-time items</h4>
      {!state.data.items.rows.length && <p role="status">No item rows returned on this page. This may indicate changed access or incomplete order data.</p>}
      <ul className={styles.entries}>{state.data.items.rows.map(item => <li key={item.line_number}>
        <strong>{item.product_name}</strong><p>Size {item.selected_size} · Quantity {item.quantity} · Product {item.product_id}</p>
        <p>{formatPKR(item.unit_price_minor)} each · Line total {formatPKR(item.line_total_minor)}</p>
      </li>)}</ul>
      <Pagination name="Items" page={itemPage} hasNext={state.data.items.hasNext} change={items} />
      <h4>Status history</h4>
      <p className={styles.hint}>Newest first. Times are Pakistan time. A database role identifies execution context, not a named human operator.</p>
      {!state.data.history.rows.length && <p role="status">No history rows returned on this page. This may indicate changed access or incomplete order data.</p>}
      <ol className={styles.entries}>{state.data.history.rows.map(event => <li key={`${event.revision}-${event.status_kind}`}>
        <strong>{event.status_kind}: {event.from_status ?? "Initial"} → {event.to_status}</strong>
        <p>{date(event.changed_at)} · Revision {event.revision}</p>
        <p className={styles.id}>User: {event.actor_user_id ?? "Database action; no Auth user"}</p>
        <p>Database role: {event.actor_db_role} · Session role: {event.actor_session_role}</p>
      </li>)}</ol>
      <Pagination name="History" page={historyPage} hasNext={state.data.history.hasNext} change={history} />
    </>}
  </section>;
}
function CheckoutContext({ id }: { id: string }) {
  type Context = Awaited<ReturnType<ReturnType<typeof orderReader>["checkoutContext"]>>;
  const [requested, setRequested] = useState(false);
  const [state, setState] = useState<Load<Context>>({ status: "loading" });
  useEffect(() => {
    if (!requested) return;
    const cancel = new AbortController(); let active = true;
    void reader().checkoutContext("owner", id, cancel.signal).then(data => { if (active) setState({ status: "ready", data }); })
      .catch(error => { if (active) setState({ status: "error", ...orderFailure(error) }); });
    return () => { active = false; cancel.abort(); };
  }, [id, requested]);
  if (!requested) return <button onClick={() => setRequested(true)}>Load checkout context</button>;
  if (state.status === "loading") return <p role="status">Loading checkout context…</p>;
  if (state.status === "error") return <p role="alert">Checkout context is unavailable. The secure checkout migration may not be applied.</p>;
  if (!state.data) return <p>No checkout context was saved for this order.</p>;
  return <section aria-label="Saved checkout context"><h4>Saved checkout context</h4>
    <p>Method: {state.data.payment_method} · Handling: {state.data.verification_mode}</p>
    <p>Shipping: {state.data.shipping_mode} · Settings revision: {state.data.settings_revision}</p>
    {state.data.verification_mode === "manual_wallet" && <p>Manual verification required. Customer claims do not mark an order paid.</p>}
    {state.data.wallet_account_title && <p>Saved wallet: {state.data.wallet_account_title} · {state.data.wallet_account_number}</p>}
    <p>{state.data.payment_instructions}</p><p>{state.data.policy_text}</p>
  </section>;
}
/** Mount only after verified access; unmount on auth rechecks, errors or role changes. */
export function AdminOrders({ role }: { role: DashboardRole }) {
  const [filters, setFilters] = useState<OrderFilters>({ fulfillment: "all", payment: "all" }); const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0); const [selected, setSelected] = useState<string | null>(null);
  const [state, setState] = useState<Load<Page<OrderReport>>>({ status: "loading" });
  useEffect(() => {
    const cancel = new AbortController(); let active = true; setState({ status: "loading" });
    void (async () => {
      try { const data = await reader().list(role, filters, page, cancel.signal); if (active) setState({ status: "ready", data }); }
      catch (error) { if (active) setState({ status: "error", ...orderFailure(error) }); }
    })();
    return () => { active = false; cancel.abort(); };
  }, [role, filters, page, attempt]);
  function filter(update: Partial<OrderFilters>) { setState({ status: "loading" }); setSelected(null); setPage(0); setFilters(previous => ({ ...previous, ...update })); }
  function paginate(next: number) { setState({ status: "loading" }); setSelected(null); setPage(next); }
  function reload() { setState({ status: "loading" }); setSelected(null); setAttempt(n => n + 1); }
  return <section className={styles.section} aria-labelledby="admin-orders-title">
    <div className={styles.heading}><h2 id="admin-orders-title">Orders</h2><button onClick={reload}>Refresh orders</button></div>
    <p>{role === "owner" ? "Read orders, customer details, saved items and status history." : "Read order references, dates, amounts and statuses."}</p>
    <p className={styles.hint}>Read-only access. Order creation and status changes are not available here. Times are Pakistan time.</p>
    <div className={styles.filters}>
      <label>Fulfillment status<select aria-label="Fulfillment status" value={filters.fulfillment} onChange={event => filter({ fulfillment: event.target.value as OrderFilters["fulfillment"] })}>
        <option value="all">All fulfillment statuses</option>{fulfillmentStatuses.map(status => <option key={status} value={status}>{status}</option>)}
      </select></label>
      <label>Payment status<select aria-label="Payment status" value={filters.payment} onChange={event => filter({ payment: event.target.value as OrderFilters["payment"] })}>
        <option value="all">All payment statuses</option>{paymentStatuses.map(status => <option key={status} value={status}>{status}</option>)}
      </select></label>
    </div>
    <div aria-busy={state.status === "loading"}>
      {state.status === "loading" && <p role="status">Loading orders…</p>}
      {state.status === "error" && <Failure state={state} retry={reload} />}
      {state.status === "ready" && <>
        {!state.data.rows.length && <p role="status">{filters.fulfillment !== "all" || filters.payment !== "all" ? "No orders match these filters." : page > 0 ? "No orders returned on this page. Go back or refresh the list." : "No orders are available to this account. Order intake has not been enabled."}</p>}
        <ul className={styles.orders}>{state.data.rows.map(order => <li className={styles.card} key={order.id}>
          <h3 className={styles.id}>Order {order.id}</h3>
          <p>Created {date(order.created_at)}<br />Updated {date(order.updated_at)}</p>
          <p>Fulfillment: <strong>{order.fulfillment_status}</strong> · Payment: <strong>{order.payment_status}</strong></p>
          <Amounts order={order} />
          {role === "owner" && <button aria-expanded={selected === order.id} aria-controls="selected-order-details" onClick={() => setSelected(selected === order.id ? null : order.id)}>View order details</button>}
        </li>)}</ul>
        <Pagination name="Orders" page={page} hasNext={state.data.hasNext} change={paginate} />
        {role === "owner" && selected && <div id="selected-order-details"><OwnerOrderDetails key={selected} id={selected} close={() => setSelected(null)} /></div>}
      </>}
    </div>
  </section>;
}
