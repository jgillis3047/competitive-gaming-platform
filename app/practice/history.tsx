// app/practice/history.tsx — Unified practice history
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import {
  formatPracticeHistoryMeta,
  kindEmoji,
  loadUnifiedPracticeHistory,
  type PracticeHistoryEntry,
} from "../../lib/data/practiceHistory";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function PracticeHistoryScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [items, setItems] = useState<PracticeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await loadUnifiedPracticeHistory(userId, 80);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openEntry = (entry: PracticeHistoryEntry) => {
    if (entry.route) router.push(entry.route as Href);
  };

  return (
    <View style={styles.screen}>
      <AppHeader />
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Practice history</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.sub}>
        Phone games, AI-validated drills, shooting sessions, and golf rounds — newest first.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
          }
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No practice yet</Text>
              <Text style={styles.emptySub}>
                Runs from Practice mode, Arena Vision, and golf will show up here.
              </Text>
              <Pressable
                onPress={() => router.push("/(tabs)/create" as Href)}
                style={({ pressed }) => [styles.emptyCta, pressSoft(pressed)]}
              >
                <Text style={styles.emptyCtaText}>Go to Practice mode</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEntry(item)}
              disabled={!item.route}
              style={({ pressed }) => [styles.row, !item.route && styles.rowStatic, pressSoft(pressed)]}
            >
              <Text style={styles.emoji}>{kindEmoji(item.kind)}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.scoreLabel ? (
                  <Text style={styles.rowScore}>{item.scoreLabel}</Text>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={2}>
                  {formatPracticeHistoryMeta(item)}
                  {item.subtitle ? ` · ${item.subtitle}` : ""}
                </Text>
                {item.aiSummary ? (
                  <Text style={styles.rowAi} numberOfLines={2}>
                    {item.aiSummary}
                  </Text>
                ) : null}
              </View>
              {item.route ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgFeed },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  backBtn: { padding: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: "900" },
  sub: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontWeight: "600",
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 },
  empty: { alignItems: "center", gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 8 },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 8,
  },
  rowStatic: { opacity: 0.95 },
  emoji: { fontSize: 22 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  rowScore: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: "600" },
  rowAi: { color: colors.textTertiary, fontSize: 11, marginTop: 4, lineHeight: 15 },
});
