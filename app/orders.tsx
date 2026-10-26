// app/orders.tsx - Buyer's purchase history (marketplace orders)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "./components/AppHeader";
import { listOrdersForUser } from "../lib/backend/orders";
import type { OrderWithExtras } from "../lib/backend/orders";
import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const statusStyleMap: Record<string, { backgroundColor: string; color: string }> = {
  pending: { backgroundColor: "#1e293b", color: "#93c5fd" },
  paid: { backgroundColor: "#1e3a2f", color: "#86efac" },
  fulfilled: { backgroundColor: "#14532d", color: "#bbf7d0" },
  refunded: { backgroundColor: "#374151", color: "#9ca3af" },
};

export default function OrdersScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [orders, setOrders] = useState<OrderWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await listOrdersForUser(userId, 100);
      setOrders(list);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!userId) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Sign in to view your purchases.</Text>
          <Pressable
            onPress={() => router.replace("/auth/login")}
            style={({ pressed }) => [styles.signInBtn, pressSoft(pressed)]}
          >
            <Text style={styles.signInBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Purchase history</Text>
          <Text style={styles.headerSub}>
            Marketplace orders are listed here. Wallet top-ups appear in your Wallet activity.
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : errorMsg ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable onPress={load} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>No purchases yet.</Text>
            <Text style={styles.emptySub}>Buy from the Shop to see your orders here.</Text>
            <Pressable
              onPress={() => router.push("/(tabs)/shop" as any)}
              style={({ pressed }) => [styles.shopBtn, pressSoft(pressed)]}
            >
              <Text style={styles.shopBtnText}>Browse Shop</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace("/wallet")}
              style={({ pressed }) => [styles.walletBtn, pressSoft(pressed)]}
            >
              <Text style={styles.walletBtnText}>View wallet top-up history</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o) => o.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const product = item.product as { name: string; price_cents: number } | null;
              const seller = item.seller as { business_name: string } | null;
              return (
                <View style={styles.orderRow}>
                  <Text style={styles.orderProduct}>{product?.name ?? "Product"}</Text>
                  {seller?.business_name ? (
                    <Text style={styles.orderSeller}>{seller.business_name}</Text>
                  ) : null}
                  <View style={styles.orderMeta}>
                    <Text style={styles.orderAmount}>{formatUSDFromCents(item.amount_cents)}</Text>
                    <Text style={[styles.orderStatus, statusStyleMap[item.status] ?? statusStyleMap.pending]}>
                      {item.status}
                    </Text>
                  </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: { marginRight: 12 },
  title: { fontSize: 18, fontWeight: "800", color: "#fff" },
  headerSub: { color: "rgba(156,163,175,0.9)", fontSize: 12, marginTop: 2 },
  content: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#FCA5A5", fontSize: 15, textAlign: "center", marginBottom: 12 },
  retryBtn: { backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  emptyText: { color: "#e5e7eb", fontSize: 16, fontWeight: "600", textAlign: "center" },
  emptySub: { color: "#6b7280", fontSize: 14, marginTop: 8, textAlign: "center" },
  signInBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#6366f1",
  },
  signInBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  shopBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#6366f1",
  },
  shopBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  walletBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.8)",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  walletBtnText: { color: "#e5e7eb", fontSize: 14, fontWeight: "700" },
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },
  orderRow: {
    backgroundColor: "#0b1120",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#111827",
  },
  orderProduct: { color: "#fff", fontSize: 16, fontWeight: "700" },
  orderSeller: { color: "#6b7280", fontSize: 13, marginTop: 4 },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  orderAmount: { color: colors.gold, fontSize: 15, fontWeight: "800" },
  orderStatus: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  orderDate: { color: "#6b7280", fontSize: 12, marginTop: 6 },
});
