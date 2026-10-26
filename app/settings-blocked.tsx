// app/settings-blocked.tsx - List and unblock users
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import Avatar from "../lib/ui/Avatar";
import { listBlockedUsers, unblockUser, type BlockedUserRow } from "../lib/backend/blockedUsers";
import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

export default function SettingsBlockedScreen() {
  const router = useRouter();
  const [list, setList] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listBlockedUsers();
      setList(data);
    } catch (e: any) {
      setLoadError(e?.message ?? "Could not load blocked users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleUnblock = async (blockedId: string) => {
    if (unblockingId) return;
    setUnblockingId(blockedId);
    try {
      await unblockUser(blockedId);
      setList((prev) => prev.filter((r) => r.blocked_id !== blockedId));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not unblock.");
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.title}>Blocked users</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.hint}>Users you block won&apos;t see your profile or be able to message you.</Text>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : loadError ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={load} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>No blocked users</Text>
        ) : (
          list.map((row) => {
            const p = row.blocked_profile;
            const name = p?.display_name || p?.username || "Unknown";
            const isBusy = unblockingId === row.blocked_id;
            return (
              <View key={row.id} style={styles.row}>
                <Pressable
                  onPress={() => router.push(`/user/${row.blocked_id}` as any)}
                  style={({ pressed }) => [styles.userPressable, pressSoftIcon(pressed)]}
                >
                  <Avatar imageUrl={p?.avatar_url} name={name} size={44} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{name}</Text>
                    {p?.username ? <Text style={styles.userHandle}>@{p.username}</Text> : null}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => handleUnblock(row.blocked_id)}
                  disabled={isBusy}
                  style={[styles.unblockBtn, isBusy && styles.unblockBtnDisabled]}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color="#fca5a5" />
                  ) : (
                    <Text style={styles.unblockBtnText}>Unblock</Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 },
  center: { paddingVertical: 24, alignItems: "center" },
  errorText: { color: "#FCA5A5", fontSize: 15, textAlign: "center", marginBottom: 12 },
  retryBtn: { backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  empty: { color: "rgba(255,255,255,0.5)", fontSize: 15 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  userPressable: { flex: 1, flexDirection: "row", alignItems: "center" },
  userInfo: { marginLeft: 12 },
  userName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  userHandle: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  unblockBtnDisabled: { opacity: 0.6 },
  unblockBtnText: { color: "#fca5a5", fontWeight: "800", fontSize: 13 },
});
