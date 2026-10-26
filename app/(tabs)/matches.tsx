// app/(tabs)/matches.tsx — GamePigeon-style inbox: one card per opponent, challenge pills, action filter
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ActionInboxRow from "../../components/thread/ActionInboxRow";
import MatchInboxRow from "../../components/thread/MatchInboxRow";
import AppHeader from "../components/AppHeader";
import { getOpenTeamChallengesForUser } from "../../lib/backend/teams";
import type { TeamChallengeRow } from "../../lib/backend/teams";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import {
  loadMatchInboxData,
  type MatchActionFlatRow,
  type MatchInboxRow as InboxRowData,
} from "../../lib/thread/matchInboxLoad";
import { formatAgo } from "../../lib/thread/challengeState";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";

type FilterKey = "all" | "action" | "waiting" | "completed";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export default function MatchesTabScreen() {
  const router = useRouter();
  const storeUser = useAuthStore((s: any) => s.user);

  const [meId, setMeId] = useState<string | null>(storeUser?.id ?? null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<InboxRowData[]>([]);
  const [actionFlatRows, setActionFlatRows] = useState<MatchActionFlatRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [openTeamChallenges, setOpenTeamChallenges] = useState<TeamChallengeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (storeUser?.id) {
        if (!cancelled) setMeId(storeUser.id);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setMeId(data?.user?.id ?? null);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [storeUser?.id]);

  const openThread = useCallback(
    (threadId: string) => {
      if (!threadId) return;
      router.push({ pathname: "/matches/thread/[id]", params: { id: threadId } } as Href);
    },
    [router]
  );

  const openChallenge = useCallback(
    (challengeId: string) => {
      router.push({ pathname: "/challenge/[id]", params: { id: challengeId } } as Href);
    },
    [router]
  );

  const load = useCallback(async () => {
    if (!meId) return;

    setLoading(true);
    setError(null);

    try {
      const inbox = await loadMatchInboxData(meId);
      setRows(inbox.rows);
      setActionFlatRows(inbox.actionFlatRows);
      setProfilesById(inbox.profilesById);

      const open = await getOpenTeamChallengesForUser(meId, 10);
      setOpenTeamChallenges(open);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load matches.");
    } finally {
      setLoading(false);
    }
  }, [meId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const action = actionFlatRows.length;
    const waiting = rows.reduce((n, r) => n + r.waitingCount, 0);
    const completed = rows.reduce((n, r) => n + r.completedCount, 0);
    return { action, waiting, completed };
  }, [rows, actionFlatRows]);

  const filteredInboxRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "action") return rows.filter((r) => r.needsActionCount > 0);
    if (filter === "waiting") return rows.filter((r) => r.waitingCount > 0);
    return rows.filter((r) => r.completedCount > 0);
  }, [rows, filter]);

  const emptyCopy = filter === "all"
    ? "No conversations yet — message someone from their profile."
    : filter === "action"
      ? "Nothing needs your attention."
      : filter === "waiting"
        ? "No matches waiting on opponents."
        : "No completed matchups yet.";

  return (
    <ScreenCanvas>
      <View style={styles.inner}>
        <AppHeader />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Ionicons name="chatbubbles" size={22} color={colors.accent} style={{ marginRight: 6 }} />
              <Text style={styles.title}>Matches</Text>
            </View>
            <Text style={styles.subtitle}>Your inbox — message opponents or manage games</Text>
          </View>
          <Pressable onPress={load} style={({ pressed }) => [styles.iconBtn, pressSoftIcon(pressed)]}>
            {loading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={22} color={colors.text} />
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push("/search?compose=message" as Href)}
          style={({ pressed }) => [styles.newMessageBtn, pressSoft(pressed)]}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.accentMuted} />
          <Text style={styles.newMessageText}>New message</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={styles.filters}>
          <FilterPill
            label={`All (${rows.length})`}
            active={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterPill
            label={`Needs Action (${counts.action})`}
            active={filter === "action"}
            urgent={counts.action > 0}
            onPress={() => setFilter("action")}
          />
          <FilterPill
            label={`Waiting (${counts.waiting})`}
            active={filter === "waiting"}
            onPress={() => setFilter("waiting")}
          />
          <FilterPill
            label={`Completed (${counts.completed})`}
            active={filter === "completed"}
            onPress={() => setFilter("completed")}
          />
        </View>

        {!meId ? <Text style={styles.sub}>Log in to see your matches.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {openTeamChallenges.length > 0 ? (
          <View style={styles.openSection}>
            <Text style={styles.openSectionTitle}>Crew challenges awaiting opponent</Text>
            {openTeamChallenges.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => openChallenge(c.id)}
                style={({ pressed }) => [styles.openRow, pressed && styles.rowPressed]}
              >
                <View style={styles.openContent}>
                  <Text style={styles.openTitle} numberOfLines={1}>{c.title || "Challenge"}</Text>
                  <Text style={styles.openMeta}>{(c.game_type ?? "game").replace(/_/g, " ")} • Open</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading && rows.length === 0 && actionFlatRows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.sub}>Loading…</Text>
          </View>
        ) : filter === "action" ? (
          <FlatList
            data={actionFlatRows}
            keyExtractor={(x) => x.challengeId}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
            }
            ListHeaderComponent={
              actionFlatRows.length > 0 ? (
                <Text style={styles.sectionHint}>Tap to jump in — no digging through threads.</Text>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>{emptyCopy}</Text>
                <Pressable
                  onPress={() => router.push("/(tabs)/feed" as any)}
                  style={({ pressed }) => [styles.findBtn, pressSoft(pressed)]}
                >
                  <Text style={styles.findBtnText}>Find a match</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <ActionInboxRow
                opponentName={item.opponentName}
                avatarUrl={profilesById[item.opponentId]?.avatar_url}
                gameTitle={item.gameTitle}
                action={item.action}
                onPlay={() => openChallenge(item.challengeId)}
                onOpenThread={() => openThread(item.threadId)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        ) : (
          <FlatList
            data={filteredInboxRows}
            keyExtractor={(x) => x.threadId}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
            }
            ListEmptyComponent={
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>{emptyCopy}</Text>
                <Pressable
                  onPress={() => router.push("/(tabs)/feed" as any)}
                  style={({ pressed }) => [styles.findBtn, pressSoft(pressed)]}
                >
                  <Text style={styles.findBtnText}>Find a match</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <MatchInboxRow
                opponentName={item.opponentName}
                avatarUrl={profilesById[item.opponentId]?.avatar_url}
                updatedAgo={formatAgo(item.updatedAt)}
                lastUpdate={item.lastUpdate}
                activeCount={item.activeCount}
                needsActionCount={item.needsActionCount}
                waitingCount={item.waitingCount}
                pills={item.pills}
                onPress={() => openThread(item.threadId)}
              />
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </ScreenCanvas>
  );
}

function FilterPill(props: { label: string; active: boolean; urgent?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.filterPill,
        props.active && styles.filterPillActive,
        props.active && props.urgent && styles.filterPillUrgent,
        pressSoft(pressed),
      ]}
    >
      <Text style={[styles.filterText, props.active && styles.filterTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  newMessageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
  },
  newMessageText: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", letterSpacing: -0.2 },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  sub: { color: colors.textTertiary, marginTop: 8, fontWeight: "700" },
  error: { color: colors.danger, marginTop: 8, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  filters: { flexDirection: "row", gap: space.sm, marginBottom: space.md, flexWrap: "wrap" },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterPillActive: {
    backgroundColor: colors.accentChip,
    borderColor: colors.accentChipBorder,
  },
  filterPillUrgent: {
    backgroundColor: "rgba(239,68,68,0.14)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  filterText: { color: colors.textSecondary, fontWeight: "900", fontSize: 12 },
  filterTextActive: { color: colors.text },

  sectionHint: {
    color: colors.textTertiary,
    fontWeight: "700",
    fontSize: 12,
    marginBottom: space.sm,
  },

  openSection: { marginBottom: space.lg },
  openSectionTitle: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(79,109,245,0.14)",
    borderWidth: 1,
    borderColor: "rgba(79,109,245,0.30)",
    marginBottom: 8,
  },
  openContent: { flex: 1, minWidth: 0 },
  openTitle: { color: colors.text, fontWeight: "800", fontSize: 15 },
  openMeta: { color: colors.textTertiary, fontSize: 13, marginTop: 2 },
  rowPressed: { opacity: 0.95 },

  emptyRow: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  emptyText: { color: colors.textMuted, fontWeight: "800" },
  findBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(79,109,245,0.22)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  findBtnText: { color: colors.text, fontWeight: "900", fontSize: 12 },
});
