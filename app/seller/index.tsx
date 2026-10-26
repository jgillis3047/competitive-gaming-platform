// app/seller/index.tsx - Seller dashboard home
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import { getSellerByUserId } from "../../lib/backend/sellers";
import type { SellerRow } from "../../lib/backend/sellers";
import { listProducts } from "../../lib/backend/products";
import { listOrdersForSeller } from "../../lib/backend/orders";
import type { OrderWithExtras } from "../../lib/backend/orders";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";

export default function SellerDashboardScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [revenueCents, setRevenueCents] = useState(0);
  const [platformFeeCents, setPlatformFeeCents] = useState(0);
  const [paidOrders, setPaidOrders] = useState<OrderWithExtras[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const s = await getSellerByUserId(userId);
      setSeller(s);
      if (!s) return;
      const [products, orders] = await Promise.all([
        listProducts({ sellerId: s.id, limit: 500 }),
        listOrdersForSeller(s.id, userId, 500),
      ]);
      setProductCount(products.length);
      setOrderCount(orders.length);
      const paidOrFulfilled = orders.filter((o) => o.status === "paid" || o.status === "fulfilled");
      const revenue = paidOrFulfilled.reduce((sum, o) => sum + (o.amount_cents - (o.platform_fee_cents ?? 0)), 0);
      const platformFee = paidOrFulfilled.reduce((sum, o) => sum + (o.platform_fee_cents ?? 0), 0);
      setRevenueCents(revenue);
      setPlatformFeeCents(platformFee);
      setPaidOrders(paidOrFulfilled.slice(0, 10));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!seller) return null;

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.businessName}>{seller.business_name}</Text>
          <Text style={styles.slug}>{seller.slug}</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color="#60a5fa" style={{ marginVertical: 24 }} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <Pressable style={styles.statCard} onPress={() => router.push("/seller/products")}>
                <Text style={styles.statValue}>{productCount}</Text>
                <Text style={styles.statLabel}>Products</Text>
              </Pressable>
              <Pressable style={styles.statCard} onPress={() => router.push("/seller/orders")}>
                <Text style={styles.statValue}>{orderCount}</Text>
                <Text style={styles.statLabel}>Orders</Text>
              </Pressable>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>${(revenueCents / 100).toFixed(0)}</Text>
                <Text style={styles.statLabel}>Revenue (your share)</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>${(platformFeeCents / 100).toFixed(0)}</Text>
                <Text style={styles.statLabel}>Platform fee</Text>
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payout history</Text>
              {paidOrders.length === 0 ? (
                <Text style={styles.placeholder}>No paid orders yet. Orders appear here when customers pay.</Text>
              ) : (
                paidOrders.map((o: OrderWithExtras) => {
                  const sellerShare = o.amount_cents - (o.platform_fee_cents ?? 0);
                  const prodName = (o.product as any)?.name ?? "Product";
                  const date = o.created_at ? new Date(o.created_at).toLocaleDateString() : "";
                  return (
                    <View key={o.id} style={styles.payoutRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.payoutProd}>{prodName}</Text>
                        <Text style={styles.payoutDate}>{date}</Text>
                      </View>
                      <Text style={styles.payoutAmount}>${(sellerShare / 100).toFixed(2)}</Text>
                    </View>
                  );
                })
              )}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sponsored challenges</Text>
              <Text style={styles.placeholder}>
                Create a challenge and check &quot;Sponsor with [your store]&quot; to promote your brand.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: "#0b1120",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#111827",
  },
  businessName: { color: "#ffffff", fontSize: 20, fontWeight: "800" },
  slug: { color: "#6b7280", fontSize: 14, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: "#0b1120",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#111827",
    alignItems: "center",
  },
  statValue: { color: colors.gold, fontSize: 22, fontWeight: "800" },
  statLabel: { color: "#9ca3af", fontSize: 13, marginTop: 4 },
  statSub: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  section: { marginTop: 24 },
  sectionTitle: { color: "#e5e7eb", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  placeholder: { color: "#6b7280", fontSize: 14 },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  payoutProd: { color: "#fff", fontSize: 14, fontWeight: "600" },
  payoutDate: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  payoutAmount: { color: colors.gold, fontSize: 14, fontWeight: "700" },
});
