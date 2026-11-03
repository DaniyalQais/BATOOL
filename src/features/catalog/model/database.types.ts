// Schema contract for the versioned migrations. Regenerate/review when schema changes.
import type { OrderReport, OrderCustomer, OrderItem, OrderHistory } from "../../orders/model/orders.ts";
export interface ProductRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: "PKR";
  image_slug: string | null;
  image_note: string | null;
  card_position: string | null;
  card_zoom: number | null;
  category: "Stitched";
  piece_count: 3;
  subcategory: "Daily Pret" | "Festive Edit" | "Luxury Formals" | null;
  color: string | null;
  tag: string | null;
  draft_managed: boolean;
  archived: boolean;
  active: boolean;
  is_demo: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  edit_revision: number;
  main_image_path: string | null;
  main_image_width: number | null;
  main_image_height: number | null;
  image_alt: string | null;
}
export interface VariantRow {
  product_id: number;
  size: "S" | "M" | "L" | "XL";
  active: boolean;
  // null means unknown, including every seeded demo variant. Never infer stock from size.
  stock_quantity: number | null;
  created_at: string;
  updated_at: string;
}
export interface DashboardRoleRow {
  user_id: string;
  role: "owner" | "partner";
  created_at: string;
  updated_at: string;
}
type Table<Row> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type ReadOnlyTable<Row> = Omit<Table<Row>, "Insert" | "Update"> & { Insert: never; Update: never };
// Uncast JSON bigint may be a number; the order reader explicitly selects ::text.
type RawBigints<Row, Keys extends keyof Row> = Omit<Row, Keys> & { [Key in Keys]: string | number };
export type Database = {
  public: {
    Tables: {
      products: Table<ProductRow>;
      product_variants: Omit<Table<VariantRow>, "Relationships"> & {
        Relationships: [{ foreignKeyName: "product_variants_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] }];
      };
      dashboard_roles: Omit<Table<DashboardRoleRow>, "Insert" | "Update"> & { Insert: never; Update: never };
      business_settings: ReadOnlyTable<{ id: boolean; revision: number; settings: Json; updated_at: string; updated_by: string | null }>;
      order_notification_settings: ReadOnlyTable<{ id: boolean; revision: number; settings: Json; updated_at: string; updated_by: string | null }>;
      orders: ReadOnlyTable<RawBigints<OrderReport, "subtotal_minor" | "shipping_minor" | "tax_minor" | "discount_minor" | "total_minor" | "status_revision">>;
      order_customer_details: ReadOnlyTable<OrderCustomer>;
      order_checkout_details: ReadOnlyTable<{ order_id: string; payment_method: "cod" | "easypaisa" | "jazzcash";
        verification_mode: "cash_on_delivery" | "manual_wallet"; shipping_mode: "free" | "flat_rate";
        settings_revision: number; payment_instructions: string; policy_text: string;
        wallet_account_title: string | null; wallet_account_number: string | null }>;
      order_items: ReadOnlyTable<RawBigints<OrderItem, "unit_price_minor" | "line_total_minor">>;
      order_status_history: ReadOnlyTable<RawBigints<OrderHistory, "revision">>;
    };
    Views: Record<never, never>;
    Functions: {
      owner_product_media_ready: { Args: Record<never, never>; Returns: boolean };
      owner_approve_catalog_merchandise: { Args: { p_product_id: number; p_expected_revision: number; p_confirmed: boolean }; Returns: Json };
      owner_recovery_case: { Args: { p_case: string }; Returns: Json };
      owner_verify_recovery: { Args: { p_case: string; p_revision: number; p_decision: string; p_quote: string | null; p_order: string | null; p_evidence: string | null; p_independently_verified: boolean }; Returns: Json };
      owner_resolve_recovery: { Args: { p_case: string; p_revision: number }; Returns: Json };
      get_public_business_settings: { Args: Record<never, never>; Returns: Json };
      owner_save_business_settings: { Args: { p_expected_revision: number; p_settings: Json }; Returns: Json };
      owner_save_notification_settings: { Args: { p_expected_revision: number; p_settings: Json }; Returns: Json };
      owner_create_product_draft: {
        Args: { p_request_key: string; p_name: string; p_description: string; p_price_minor: number; p_stocks: { S: number | null; M: number | null; L: number | null; XL: number | null } };
        Returns: Json;
      };
      owner_save_catalog_product: {
        Args: { p_product_id: number; p_expected_revision: number; p_name: string; p_description: string; p_price_minor: number; p_active: boolean; p_stocks: { S: number | null; M: number | null; L: number | null; XL: number | null }; p_subcategory: string | null; p_color: string | null; p_tag: string | null; p_archived: boolean };
        Returns: Json;
      };
      owner_attach_product_image: {
        Args: { p_product_id: number; p_expected_revision: number; p_image_path: string; p_alt: string };
        Returns: Json;
      };
      owner_update_catalog_product: {
        Args: {
          p_product_id: number; p_expected_revision: number; p_name: string;
          p_description: string; p_price_minor: number; p_active: boolean;
          p_stocks: { S: number | null; M: number | null; L: number | null; XL: number | null };
        };
        Returns: Json;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
