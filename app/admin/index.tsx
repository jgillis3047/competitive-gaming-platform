// app/admin/index.tsx - List pending sellers, approve or suspend
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import { createNotification } from "../../lib/backend/notifications";
import {
  listPendingSellers,
  updateSellerStatus,
  type SellerRow,
} from "../../lib/backend/sellers";
export default function AdminSellersScreen() {
  const [list, setList] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const pending = await listPendingSellers(100);
      setList(pending);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (seller: SellerRow) => {
    setActingId(seller.id);
    try {
      await updateSellerStatus(seller.id, "approved");
      await createNotification({
        user_id: seller.user_id,
        type: "seller_approved",
        title: "Seller application approved",
        body: `Your store "${seller.business_name}" is now live. You can add products and receive orders.`,
        link: "/seller",
      });
      setList((prev) => prev.filter((s) => s.id !== seller.id));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to approve.");
    } finally {
      setActingId(null);
    }
  };

  const handleSuspend = (seller: SellerRow) => {
    Alert.alert(
      "Reject application",
      `Reject "${seller.business_name}"? They can apply again later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setActingId(seller.id);
            try {
              await updateSellerStatus(seller.id, "suspended");
              await createNotification({
                user_id: seller.user_id,
                type: "seller_rejected",
                title: "Seller application not approved",
                body: `Your store "${seller.business_name}" was not approved at this time. You can apply again later.`,
                link: "/apply-seller",
              });
              setList((prev) => prev.filter((s) => s.id !== seller.id));
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to reject.");
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#60a5fa" style={{ marginTop: 24 }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={styles.emptyTitle}>No pending applications</Text>
            <Text style={styles.emptySub}>New seller applications will appear here.</Text>
          </View>
        ) : (
          list.map((seller) => (
            <View key={seller.id} style={styles.card}>
              <Text style={styles.businessName}>{seller.business_name}</Text>
              <Text style={styles.slug}>{seller.slug}</Text>
              {seller.description ? (
                <Text style={styles.desc} numberOfLines={2}>{seller.description}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => handleApprove(seller)}
                  disabled={actingId !== null}
                  style={[styles.btn, styles.btnApprove, actingId === seller.id && { opacity: 0.6 }]}
                >
                  {actingId === seller.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.btnText}>Approve</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => handleSuspend(seller)}
                  disabled={actingId !== null}
                  style={[styles.btn, styles.btnReject, actingId === seller.id && { opacity: 0.6 }]}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                  <Text style={styles.btnText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  empty: { alignItems: "center", paddingTop: 48 },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 12 },
  emptySub: { color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 4 },
  card: {
    backgroundColor: "#0b1120",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  businessName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  slug: { color: "#6b7280", fontSize: 13, marginTop: 4 },
  desc: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  btnApprove: { backgroundColor: "#16a34a" },
  btnReject: { backgroundColor: "#b91c1c" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
