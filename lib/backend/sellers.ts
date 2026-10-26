// lib/backend/sellers.ts - Curated marketplace sellers
import { supabase } from "./supabaseClient";

export type SellerRow = {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  commission_percent: number;
  status: "pending" | "approved" | "suspended";
  created_at: string;
  updated_at: string;
};

export type SellerWithExtras = SellerRow & {
  product_count?: number;
};

/** List sellers that are approved (curated). */
export async function listApprovedSellers(limit = 50): Promise<SellerWithExtras[]> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const withCounts = await Promise.all(
    (data ?? []).map(async (row: SellerRow) => {
      const { count } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", row.id)
        .eq("is_active", true);
      return { ...row, product_count: count ?? 0 };
    })
  );
  return withCounts as SellerWithExtras[];
}

export async function getSellerById(id: string): Promise<SellerRow | null> {
  const { data, error } = await supabase.from("sellers").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data as SellerRow | null;
}

export async function getSellerByUserId(userId: string): Promise<SellerRow | null> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) return null;
  return data as SellerRow | null;
}

/** Get seller application by user ID (any status). Use to show "Become a seller" vs "Pending" vs "Seller dashboard". */
export async function getSellerApplicationByUserId(userId: string): Promise<SellerRow | null> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data as SellerRow | null;
}

/** List sellers with status = pending (for admin approval). Requires admin. */
export async function listPendingSellers(limit = 50): Promise<SellerRow[]> {
  const { data, error } = await supabase
    .from("sellers")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SellerRow[];
}

/** Update seller status (e.g. approve or suspend). Caller must be the seller (own row) or admin. */
export async function updateSellerStatus(
  sellerId: string,
  status: "pending" | "approved" | "suspended"
): Promise<void> {
  const { error } = await supabase
    .from("sellers")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sellerId);
  if (error) throw error;
}

/** Create a seller application (status = pending). Caller must be authenticated; RLS ensures user_id = auth.uid(). */
export async function createSellerApplication(params: {
  userId: string;
  businessName: string;
  slug?: string;
  description?: string | null;
}): Promise<{ seller: SellerRow } | { error: string }> {
  const slug =
    (params.slug || "").trim() ||
    params.businessName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  if (!slug) return { error: "Business name must contain at least one letter or number." };
  const { data, error } = await supabase
    .from("sellers")
    .insert({
      user_id: params.userId,
      business_name: params.businessName.trim(),
      slug,
      description: (params.description || "").trim() || null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That store URL is already taken. Try a different one." };
    return { error: error.message || "Failed to submit application." };
  }
  return { seller: data as SellerRow };
}
