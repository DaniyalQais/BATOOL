// Schema contract for the versioned catalog migrations. Regenerate/review when schema changes.
export interface ProductRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: "PKR";
  image_slug: string;
  image_note: string | null;
  card_position: string | null;
  card_zoom: number | null;
  category: "Stitched";
  piece_count: 3;
  subcategory: "Daily Pret" | "Festive Edit" | "Luxury Formals";
  color: string;
  tag: string;
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
export type Database = {
  public: {
    Tables: {
      products: Table<ProductRow>;
      product_variants: Omit<Table<VariantRow>, "Relationships"> & {
        Relationships: [{ foreignKeyName: "product_variants_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] }];
      };
      dashboard_roles: Omit<Table<DashboardRoleRow>, "Insert" | "Update"> & { Insert: never; Update: never };
    };
    Views: Record<never, never>;
    Functions: {
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
