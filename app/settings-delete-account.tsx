// app/settings-delete-account.tsx - Delete account confirmation
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { deleteAccount } from "../lib/backend/account";
import { useAuthStore } from "../lib/data/authStore";
import { pressSoftIcon } from "../lib/ui/pressableStyles";

export default function SettingsDeleteAccountScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    Alert.alert(
      "Delete account?",
      "This will permanently delete your account, profile, wallet balance, and orders. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteAccount();
              // Best-effort logout & redirect to login
              await logout();
              router.replace("/auth/login");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Could not delete account.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Delete account</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.warningTitle}>Are you sure?</Text>
        <Text style={styles.warningBody}>
          Deleting your account will remove your profile, challenges, wallet balance, and order history. This action
          cannot be undone.
        </Text>

        <Pressable
          onPress={handleDelete}
          disabled={loading}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && !loading && { opacity: 0.9 },
            loading && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.deleteBtnText}>{loading ? "Deleting…" : "Yes, delete my account"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: "#fff" },
  content: { flex: 1, padding: 20 },
  warningTitle: { color: "#fecaca", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  warningBody: { color: "rgba(255,255,255,0.7)", fontSize: 14, lineHeight: 20, marginBottom: 24 },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: "#ef4444",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});

