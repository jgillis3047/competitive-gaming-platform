// lib/backend/orders.ts - Marketplace orders (buy flow)
import { supabase } from "./supabaseClient";

export type OrderRow = {
  id: string;
  user_id: string;
  product_id: string;
  seller_id: string;
  amount_cents: number;
  quantity: number;
  platform_fee_cents: number;
  status: "pending" | "paid" | "fulfilled" | "refunded";
  created_at: string;
};

export type OrderWithExtras = OrderRow & {
  product?: { id: string; name: string; price_cents: number; image_url: string | null } | null;
  seller?: { id: string; business_name: string } | null;
};

/** Create an order (buy now). Platform fee is computed from seller commission. */
export async function createOrder(params: {
  userId: string;
  productId: string;
  quantity?: number;
}): Promise<OrderRow> {
  const quantity = Math.max(1, params.quantity ?? 1);

  const { data: product, error: prodErr } = await supabase
    .from("products")
    .select("id, seller_id, price_cents, is_active")
    .eq("id", params.productId)
    .single();
  if (prodErr || !product) throw new Error("Product not found.");
  if (!(product as any).is_active) throw new Error("Product is no longer available.");

  const { data: seller } = await supabase
    .from("sellers")
    .select("id, commission_percent, status")
    .eq("id", (product as any).seller_id)
    .single();
  if (!seller || (seller as any).status !== "approved") throw new Error("Seller not available.");

  const amountCents = (product as any).price_cents * quantity;
  const commissionPercent = Number((seller as any).commission_percent) || 10;
  const platformFeeCents = Math.round((amountCents * commissionPercent) / 100);

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      user_id: params.userId,
      product_id: params.productId,
      seller_id: (product as any).seller_id,
      amount_cents: amountCents,
      quantity,
      platform_fee_cents: platformFeeCents,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return order as OrderRow;
}

/** Mark order as paid (after VC debit). */
export async function markOrderPaid(orderId: string, userId: string): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .single();
  if (!order || (order as any).user_id !== userId) throw new Error("Order not found or not yours.");
  const { error } = await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

/** List orders for the current user (buyer). */
export async function listOrdersForUser(userId: string, limit = 50): Promise<OrderWithExtras[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*, product:products(id, name, price_cents, image_url), seller:sellers(id, business_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OrderWithExtras[];
}

/** List orders for a seller. */
export async function listOrdersForSeller(sellerId: string, userId: string, limit = 50): Promise<OrderWithExtras[]> {
  const { data: seller } = await supabase
    .from("sellers")
    .select("user_id")
    .eq("id", sellerId)
    .single();
  if (!seller || (seller as any).user_id !== userId) throw new Error("Not authorized.");

  const { data, error } = await supabase
    .from("orders")
    .select("*, product:products(id, name, price_cents, image_url)")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as OrderWithExtras[];
}
