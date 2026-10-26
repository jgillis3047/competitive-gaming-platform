// app/notifications.tsx - Notifications list
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

import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../lib/backend/notifications";
import type { NotificationRow } from "../lib/backend/notifications";
import { NOTIFICATION_TYPE_LABELS } from "../lib/backend/notificationTypes";
import type { NotificationType } from "../lib/backend/notificationTypes";
import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";
import { pressSoft, pressSoftIcon, pressSubtle } from "../lib/ui/pressableStyles";
import { safeRouterPathFromDeepLink } from "../lib/utils/inAppPath";

export default function NotificationsScreen() {
  const router = useRouter();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const [list, setList] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!myId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const items = await listNotifications(myId, 50);
      setList(items);
    } catch (e: any) {
      setLoadError(e?.message ?? "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleItemPress = async (item: NotificationRow) => {
    if (!myId) return;
    if (!item.read) await markNotificationRead(item.id, myId);
    setList((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    const safe = safeRouterPathFromDeepLink(item.link ?? "");
    if (safe) router.push(safe as any);
  };

  const handleMarkAllRead = async () => {
    if (!myId) return;
    try {
      await markAllNotificationsRead(myId);
      setList((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        {list.some((n) => !n.read) ? (
          <Pressable onPress={handleMarkAllRead} style={({ pressed }) => [styles.markAllBtn, pressSubtle(pressed)]}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={load} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySub}>Likes, comments, challenge updates, and seller updates show here. Enable push in Settings for alerts when the app is closed.</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const typeLabel = NOTIFICATION_TYPE_LABELS[item.type as NotificationType] ?? item.type;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressSubtle(pressed)]}
                onPress={() => handleItemPress(item)}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.rowType}>{typeLabel}</Text>
                  <Text style={styles.rowTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowBody} numberOfLines={2}>{item.body ?? ""}</Text>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: { marginRight: 16 },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.text },
  markAllBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  markAllText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center", marginBottom: 12 },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: colors.text, fontWeight: "700" },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 16 },
  emptySub: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: "center" },
  row: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowUnread: { backgroundColor: colors.accentSurface },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  rowType: { color: colors.accent, fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rowBody: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  rowTime: { color: colors.textMuted, fontSize: 12 },
});
