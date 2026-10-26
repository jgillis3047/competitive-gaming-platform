// app/courts/my-claims.tsx — Status of King applications
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { fetchMyKingClaims, type KingClaimApplicationRow } from "../../lib/backend/kingClaims";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";

function statusLabel(s: KingClaimApplicationRow["status"]) {
  if (s === "pending") return "Pending review";
  if (s === "approved") return "Approved";
  return "Rejected";
}

function statusColor(s: KingClaimApplicationRow["status"]) {
  if (s === "pending") return colors.warning;
  if (s === "approved") return colors.success;
  return colors.danger;
}

export default function MyKingClaimsScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [rows, setRows] = useState<KingClaimApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const data = await fetchMyKingClaims(userId);
    setRows(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { flex: 1 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>My applications</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.lead}>
        Claims are reviewed before you show as King on courts and in league standings. After approval, your crown appears where that court or crew is shown.
      </Text>

      {!userId ? (
        <Text style={styles.warn}>Log in to see your applications.</Text>
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-text-outline" size={36} color={colors.gold} />
              </View>
              <Text style={styles.emptyTitle}>No applications yet</Text>
              <Text style={styles.empty}>Submit a King claim from a court or city — it will show up here.</Text>
            </View>
          ) : (
            rows.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {r.claim_title}
                  </Text>
                  <View style={[styles.badge, { borderColor: statusColor(r.status) }]}>
                    <Text style={[styles.badgeText, { color: statusColor(r.status) }]}>{statusLabel(r.status)}</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>
                  {r.claim_scope === "court" ? "Court" : "City"} · {r.area_kind.replace("_", " ")}
                  {r.city_name ? ` · ${r.city_name}` : ""}
                </Text>
                {r.source_challenge_id ? (
                  <Text style={styles.cardSub}>Linked challenge: {r.source_challenge_id.slice(0, 8)}…</Text>
                ) : null}
                {r.is_online_game ? <Text style={styles.cardSub}>Online / in-app — proof optional</Text> : null}
                <Text style={styles.cardDate}>{new Date(r.created_at).toLocaleString()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Pressable onPress={() => router.push("/courts/apply" as Href)} style={({ pressed }) => [styles.cta, pressSoft(pressed)]}>
        <Text style={styles.ctaText}>New application</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgFeed,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  lead: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  warn: { color: colors.warning },
  emptyWrap: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 8 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldSurfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 8 },
  empty: { color: colors.textMuted, textAlign: "center", fontSize: 14, lineHeight: 20 },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 8 },
  cardTitle: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 16 },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  cardMeta: { color: colors.textMuted, fontSize: 12, textTransform: "capitalize" },
  cardSub: { color: colors.textTertiary, fontSize: 12, marginTop: 4 },
  cardDate: { color: colors.textTertiary, fontSize: 11, marginTop: 8 },
  cta: {
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  ctaText: { color: colors.text, fontWeight: "900", fontSize: 16 },
});
