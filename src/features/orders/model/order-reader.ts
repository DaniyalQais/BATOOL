import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../catalog/model/database.types.ts";
import { assignedRole, type AccessPort, type DashboardRole, SessionExpired } from "../../auth/model/access.ts";
import { OrderAccessDenied, orderReport, orderCustomer, orderItem, orderHistory, resultPage, uuid, pageSize, fulfillmentStatuses, paymentStatuses, type OrderFilters } from "./orders.ts";

// Explicit report-only projection, shared by both roles. Never embed private tables.
export const reportColumns = "id,created_at,updated_at,currency,subtotal_minor::text,shipping_minor::text,tax_minor::text,discount_minor::text,total_minor::text,fulfillment_status,payment_status,status_revision::text";
const customerColumns = "order_id,recipient_name,phone,email,address_line1,address_line2,city,region,postal_code,country_code";
const itemColumns = "order_id,line_number,product_id,selected_size,product_name,unit_price_minor::text,quantity,line_total_minor::text";
const historyColumns = "order_id,revision::text,status_kind,from_status,to_status,changed_at,actor_user_id,actor_db_role,actor_session_role";
function bounds(page: number): [number, number] {
  if (!Number.isSafeInteger(page) || page < 0 || page > 100_000) throw new Error("Invalid page.");
  return [page * pageSize, page * pageSize + pageSize];
}
/** Defense in depth for query selection. PostgreSQL grants/RLS remain authoritative. */
export function orderReader(client: SupabaseClient<Database>, access: AccessPort) {
  async function verify(expectedRole: DashboardRole, subject?: string) {
    try {
      const identity = await access.identity();
      if (!identity || identity.expiresAt <= Date.now() || (subject && identity.id !== subject)) throw new OrderAccessDenied();
      const role = assignedRole(await access.role(identity.id), identity.id);
      if (role !== expectedRole) throw new OrderAccessDenied();
      return identity.id;
    } catch (error) { if (error instanceof SessionExpired) throw new OrderAccessDenied(); throw error; }
  }
  function signal(cancel?: AbortSignal) { return AbortSignal.any([AbortSignal.timeout(20_000), ...(cancel ? [cancel] : [])]); }
  return {
    async checkoutContext(role: DashboardRole, id: string, cancel?: AbortSignal) {
      if (role !== "owner") throw new OrderAccessDenied();
      uuid(id); const subject = await verify("owner"); cancel?.throwIfAborted();
      const { data, error } = await client.from("order_checkout_details")
        .select("order_id,payment_method,verification_mode,shipping_mode,settings_revision,payment_instructions,policy_text,wallet_account_title,wallet_account_number")
        .eq("order_id", id).abortSignal(signal(cancel)).maybeSingle();
      if (error) throw error;
      await verify("owner", subject); cancel?.throwIfAborted();
      if (data && (data.order_id !== id || !["cod", "easypaisa", "jazzcash"].includes(data.payment_method)
        || !["cash_on_delivery", "manual_wallet"].includes(data.verification_mode)
        || !["free", "flat_rate"].includes(data.shipping_mode) || !Number.isInteger(data.settings_revision)
        || typeof data.payment_instructions !== "string" || typeof data.policy_text !== "string")) throw new OrderAccessDenied();
      return data;
    },
    async list(role: DashboardRole, filters: OrderFilters, page: number, cancel?: AbortSignal) {
      if (!(["owner", "partner"] as unknown[]).includes(role) ||
        (filters.fulfillment !== "all" && !fulfillmentStatuses.includes(filters.fulfillment)) ||
        (filters.payment !== "all" && !paymentStatuses.includes(filters.payment))) throw new OrderAccessDenied();
      const range = bounds(page); const subject = await verify(role);
      cancel?.throwIfAborted();
      let query = client.from("orders").select(reportColumns).order("created_at", { ascending: false }).order("id", { ascending: false });
      if (filters.fulfillment !== "all") query = query.eq("fulfillment_status", filters.fulfillment);
      if (filters.payment !== "all") query = query.eq("payment_status", filters.payment);
      const { data, error } = await query.range(...range).abortSignal(signal(cancel));
      if (error) throw error;
      await verify(role, subject); cancel?.throwIfAborted();
      return resultPage(data, orderReport);
    },
    async details(role: DashboardRole, id: string, itemPage = 0, historyPage = 0, cancel?: AbortSignal) {
      // Refuse Partner before any identity or private-table request, even if called directly.
      if (role !== "owner") throw new OrderAccessDenied();
      uuid(id); const itemsRange = bounds(itemPage); const historyRange = bounds(historyPage);
      const subject = await verify("owner"); cancel?.throwIfAborted();
      const requestSignal = signal(cancel);
      const [report, customer, items, history] = await Promise.all([
        client.from("orders").select(reportColumns).eq("id", id).abortSignal(requestSignal).maybeSingle(),
        client.from("order_customer_details").select(customerColumns).eq("order_id", id).abortSignal(requestSignal).maybeSingle(),
        client.from("order_items").select(itemColumns).eq("order_id", id).order("line_number").range(...itemsRange).abortSignal(requestSignal),
        client.from("order_status_history").select(historyColumns).eq("order_id", id).order("revision", { ascending: false }).order("status_kind").range(...historyRange).abortSignal(requestSignal),
      ]);
      for (const response of [report, customer, items, history]) if (response.error) throw response.error;
      await verify("owner", subject); cancel?.throwIfAborted();
      if (!report.data || !customer.data) throw new OrderAccessDenied();
      return { order: orderReport(report.data), customer: orderCustomer(customer.data, id),
        items: resultPage(items.data, row => orderItem(row, id)), history: resultPage(history.data, row => orderHistory(row, id)) };
    },
  };
}
