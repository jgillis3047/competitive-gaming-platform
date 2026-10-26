// app/seller/orders.tsx - List orders for seller
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import { getSellerByUserId } from "../../lib/backend/sellers";
import type { SellerRow } from "../../lib/backend/sellers";
import { listOrdersForSeller } from "../../lib/backend/orders";
import type { OrderWithExtras } from "../../lib/backend/orders";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";

function formatVc(vc: number) {
  return `${vc.toLocaleString("en-US")} VC`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusStyleMap: Record<string, { backgroundColor: string; color: string }> = {
  pending: { backgroundColor: "#1e293b", color: "#93c5fd" },
  paid: { backgroundColor: "#1e3a2f", color: "#86efac" },
  fulfilled: { backgroundColor: "#14532d", color: "#bbf7d0" },
  refunded: { backgroundColor: "#374151", color: "#9ca3af" },
};

export default function SellerOrdersScreen() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [orders, setOrders] = useState<OrderWithExtras[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const s = await getSellerByUserId(userId);
      setSeller(s);
      if (!s) return;
      const list = await listOrdersForSeller(s.id, userId, 100);
      setOrders(list);
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
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color="#60a5fa" style={{ marginTop: 24 }} />
        ) : orders.length === 0 ? (
          <Text style={styles.empty}>No orders yet.</Text>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o) => o.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const product = item.product as { name: string; price_cents: number } | null;
              return (
                <View style={styles.orderRow}>
                  <Text style={styles.orderProduct}>{product?.name ?? "Product"}</Text>
                  <Text style={styles.orderAmount}>{formatVc(item.amount_cents)}</Text>
                  <Text style={[styles.orderStatus, statusStyleMap[item.status] ?? statusStyleMap.pending]}>{item.status}</Text>
                  <Text style={styles.orderDate}>{formatDate(item.created_at)}</Text>
                </View>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  content: { flex: 1, padding: 16 },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  empty: { color: "#6b7280", marginTop: 16 },
  orderRow: {
    backgroundColor: "#0b1120",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#111827",
  },
  orderProduct: { color: "#fff", fontSize: 15, fontWeight: "600" },
  orderAmount: { color: colors.gold, fontSize: 14, fontWeight: "700", marginTop: 4 },
  orderStatus: { fontSize: 11, fontWeight: "700", marginTop: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  orderDate: { color: "#6b7280", fontSize: 12, marginTop: 4 },
});
