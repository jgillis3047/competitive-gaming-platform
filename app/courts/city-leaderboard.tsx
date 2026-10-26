// City-scoped King leaderboard (same scope keys as city-wide claims)
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { fetchRecordTypes, type CourtRecordTypeRow } from "../../lib/backend/courts";
import type { AreaKind } from "../../lib/backend/kingClaims";
import {
  fetchKingLeaderboardWithProfiles,
  formatKingScore,
  scopeKeyForCity,
  type KingLeaderboardRow,
} from "../../lib/backend/kingLeaderboard";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";
import Avatar from "../../lib/ui/Avatar";
import { lightTap } from "../../lib/utils/haptics";

const AREA_LABELS: Record<AreaKind, string> = {
  gym: "Gym",
  park: "Park",
  trail: "Trail",
  track: "Track",
  range: "Range",
  driving_range: "Driving range",
  other: "Other",
};

function isAreaKind(s: string): s is AreaKind {
  return (
    s === "gym" ||
    s === "park" ||
    s === "trail" ||
    s === "track" ||
    s === "range" ||
    s === "driving_range" ||
    s === "other"
  );
}

export default function CityLeaderboardScreen() {
  const router = useRouter();
  const { city, record, areaKind: areaKindRaw } = useLocalSearchParams<{
    city?: string;
    record?: string;
    areaKind?: string;
  }>();

  const cityName = String(city ?? "").trim();
  const recordSlug = String(record ?? "").trim();
  const areaKindParam = String(areaKindRaw ?? "");
  const areaKind: AreaKind = isAreaKind(areaKindParam) ? areaKindParam : "other";

  const [types, setTypes] = useState<CourtRecordTypeRow[]>([]);
  const [rows, setRows] = useState<KingLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const rt = useMemo(
    () => types.find((t) => t.slug === recordSlug),
    [types, recordSlug]
  );

  const load = useCallback(async () => {
    if (!cityName || !recordSlug) {
      setErr("Missing city or record.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const tList = await fetchRecordTypes();
      setTypes(tList);
      const meta = tList.find((x) => x.slug === recordSlug);
      if (!meta) throw new Error("Unknown record type.");
      const sk = scopeKeyForCity(cityName, recordSlug, areaKind);
      const pack = await fetchKingLeaderboardWithProfiles(sk, recordSlug, meta.higher_is_better);
      setRows(pack.rows);
    } catch (e: any) {
      setErr(e?.message ?? "Could not load city leaderboard.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cityName, recordSlug, areaKind]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          City leaderboard
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroAccent} />
        <View style={styles.heroBody}>
          <Text style={styles.headline} numberOfLines={2}>
            {cityName || "—"}
          </Text>
          <Text style={styles.meta}>
            {rt?.title ?? recordSlug} · {AREA_LABELS[areaKind] ?? areaKind}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => {
          lightTap();
          router.push(
            `/courts/apply?claimScope=city&cityName=${encodeURIComponent(cityName)}&areaKind=${encodeURIComponent(areaKind)}&recordSlug=${encodeURIComponent(recordSlug)}` as Href
          );
        }}
        style={({ pressed }) => [styles.applyRow, pressSoft(pressed)]}
      >
        <Ionicons name="ribbon" size={20} color={colors.gold} />
        <Text style={styles.applyText}>Claim a Crown (this city)</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.lbTitle}>Rankings</Text>
          {rows.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="trophy-outline" size={36} color={colors.gold} />
              </View>
              <Text style={styles.emptyTitle}>No entries yet</Text>
              <Text style={styles.empty}>
                Be the first to claim this city or log an attempt for this record.
              </Text>
            </View>
          ) : (
            rows.slice(0, 25).map((r, i) => (
              <Pressable
                key={r.teamId ? `t:${r.teamId}` : `u:${r.userId}`}
                onPress={() =>
                  r.teamId
                    ? router.push(`/team/${r.teamId}` as Href)
                    : r.userId && router.push(`/user/${r.userId}` as Href)
                }
                style={({ pressed }) => [
                  styles.row,
                  i === 0 && styles.rowGold,
                  i === 1 && styles.rowSilver,
                  i === 2 && styles.rowBronze,
                  pressSoft(pressed),
                ]}
              >
                <Text style={styles.rank}>#{r.rankLabel}</Text>
                <Avatar imageUrl={r.avatarUrl} name={r.displayName || "?"} size={40} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.isTeam ? `${r.displayName ?? "Crew"} (crew)` : r.displayName || r.username || "Player"}
                  </Text>
                </View>
                <Text style={styles.score}>{formatKingScore(r.scoreValue, recordSlug)}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
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
  title: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: colors.text },
  heroCard: {
    flexDirection: "row",
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
  },
  heroAccent: { width: 4, backgroundColor: colors.gold },
  heroBody: { flex: 1, padding: space.lg },
  headline: { fontSize: 22, fontWeight: "900", color: colors.text },
  meta: { color: colors.textSecondary, fontSize: 14, marginTop: 6 },
  applyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  applyText: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 15 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  err: { color: colors.danger, marginTop: 12 },
  lbTitle: { color: colors.textTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 10 },
  emptyWrap: { alignItems: "center", paddingVertical: space.xl, paddingHorizontal: space.md },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.goldSurfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  emptyTitle: { color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: space.sm },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
    borderRadius: radius.sm,
  },
  rowGold: { borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.goldSurfaceMuted },
  rowSilver: {
    borderLeftWidth: 3,
    borderLeftColor: colors.podiumSilver,
    backgroundColor: colors.podiumSilverSurface,
  },
  rowBronze: {
    borderLeftWidth: 3,
    borderLeftColor: colors.podiumBronze,
    backgroundColor: colors.podiumBronzeSurface,
  },
  rank: { minWidth: 40, color: colors.textMuted, fontWeight: "800" },
  name: { color: colors.text, fontWeight: "700" },
  score: { color: colors.accentMuted, fontWeight: "900", fontSize: 15 },
});
