// lib/backend/products.ts - Marketplace products (gift cards + gear)
import { supabase } from "./supabaseClient";

export type ProductCategory = "gift_card" | "gear" | "apparel" | "other";

export type ProductRow = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  category: ProductCategory;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductWithSeller = ProductRow & {
  seller?: { id: string; business_name: string; slug: string; logo_url: string | null } | null;
};

/** List active products, optionally by category (e.g. gift_card) or seller_id. */
export async function listProducts(params: {
  category?: ProductCategory;
  sellerId?: string;
  limit?: number;
}): Promise<ProductWithSeller[]> {
  let q = supabase
    .from("products")
    .select("*, seller:sellers(id, business_name, slug, logo_url)")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.category) q = q.eq("category", params.category);
  if (params.sellerId) q = q.eq("seller_id", params.sellerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProductWithSeller[];
}

/** Get a single product by id. */
export async function getProductById(id: string): Promise<ProductWithSeller | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*, seller:sellers(id, business_name, slug, logo_url)")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return data as ProductWithSeller | null;
}

/** Seller creates a product. */
export async function createProduct(params: {
  sellerId: string;
  userId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  category: ProductCategory;
  imageUrl?: string | null;
}): Promise<ProductRow> {
  const { data: seller } = await supabase
    .from("sellers")
    .select("id, user_id, status")
    .eq("id", params.sellerId)
    .single();
  if (!seller || (seller as any).user_id !== params.userId || (seller as any).status !== "approved")
    throw new Error("Not authorized to add products for this seller.");

  const { data, error } = await supabase
    .from("products")
    .insert({
      seller_id: params.sellerId,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      price_cents: params.priceCents,
      category: params.category,
      image_url: params.imageUrl || null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ProductRow;
}

/** Seller updates a product. */
export async function updateProduct(params: {
  productId: string;
  userId: string;
  name?: string;
  description?: string | null;
  priceCents?: number;
  category?: ProductCategory;
  imageUrl?: string | null;
  isActive?: boolean;
}): Promise<ProductRow> {
  const { data: product } = await supabase
    .from("products")
    .select("id, seller_id")
    .eq("id", params.productId)
    .single();
  if (!product) throw new Error("Product not found.");

  const { data: seller } = await supabase
    .from("sellers")
    .select("user_id")
    .eq("id", (product as any).seller_id)
    .single();
  if (!seller || (seller as any).user_id !== params.userId)
    throw new Error("Not authorized to update this product.");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) updates.name = params.name.trim();
  if (params.description !== undefined) updates.description = params.description?.trim() || null;
  if (params.priceCents !== undefined) updates.price_cents = params.priceCents;
  if (params.category !== undefined) updates.category = params.category;
  if (params.imageUrl !== undefined) updates.image_url = params.imageUrl || null;
  if (params.isActive !== undefined) updates.is_active = params.isActive;

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", params.productId)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProductRow;
}
