// app/league/[id].tsx - League profile
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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

import {
  deleteLeague,
  getLeagueById,
  getLeagueChallenges,
  joinLeague,
  leaveLeague,
  type LeagueChallengeRow,
  type LeagueWithExtras,
} from "../../lib/backend/leagues";
import { loadLeagueStandings, type PlayerStanding, type TeamStanding } from "../../lib/backend/leagueStandings";
import { getTeamsByIds } from "../../lib/backend/teams";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";

export default function LeagueProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = String(id ?? "");
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [league, setLeague] = useState<LeagueWithExtras | null>(null);
  const [challenges, setChallenges] = useState<LeagueChallengeRow[]>([]);
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([]);
  const [playerStandings, setPlayerStandings] = useState<PlayerStanding[]>([]);
  const [standingsTab, setStandingsTab] = useState<"teams" | "players">("teams");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!leagueId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [l, ch, st] = await Promise.all([
        getLeagueById(leagueId, myId ?? undefined),
        getLeagueChallenges(leagueId),
        loadLeagueStandings(leagueId),
      ]);
      setLeague(l ?? null);
      setChallenges(ch ?? []);
      setTeamStandings(st.teams);
      setPlayerStandings(st.players);
      const ids = [...new Set((ch ?? []).flatMap((c) => [c.creator_team_id, c.opponent_team_id].filter(Boolean)))] as string[];
      const names = ids.length > 0 ? await getTeamsByIds(ids) : new Map();
      setTeamNames(names);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load league.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leagueId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!league) return;
    if (league.kind !== "both") return;
    if (teamStandings.length === 0 && playerStandings.length > 0) setStandingsTab("players");
    else if (playerStandings.length === 0 && teamStandings.length > 0) setStandingsTab("teams");
  }, [league, teamStandings.length, playerStandings.length]);

  const handleJoin = async () => {
    if (!myId) {
      Alert.alert("Sign in required", "Log in to join.");
      return;
    }
    try {
      setBusy(true);
      await joinLeague({ leagueId, userId: myId });
      await load();
    } catch (e: any) {
      Alert.alert("Join failed", e?.message ?? "Could not join.");
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!myId) return;
    Alert.alert(
      "Leave league?",
      "Are you sure you want to leave this league?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);
              await leaveLeague({ leagueId, userId: myId });
              router.back();
            } catch (e: any) {
              Alert.alert("Leave failed", e?.message ?? "Could not leave.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!myId || !league || league.created_by !== myId) return;
    Alert.alert(
      "Delete league?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);
              await deleteLeague({ leagueId, userId: myId });
              router.back();
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Could not delete.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const isMember = !!league?.my_member;
  const isOwner = league?.created_by === myId;
  const creatorName = league?.creator?.display_name || league?.creator?.username || "Unknown";
  const canJoin = league?.kind === "1v1" || league?.kind === "both";

  const completed = challenges.filter((c) => String(c.status).toLowerCase() === "completed");
  const active = challenges.filter((c) =>
    ["open", "accepted", "in-progress"].includes(String(c.status).toLowerCase())
  );
  const nextGame = active[0] ?? null;
  const showTeamStandings = league?.kind === "team" || league?.kind === "both";
  const showPlayerStandings = league?.kind === "1v1" || league?.kind === "both";

  if (loading && !league) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (!league) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>League not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={() => load(true)} />
      }
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backIcon, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{league.name}</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{(league.name ?? "?").charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.leagueName}>{league.name}</Text>
        {league.description ? (
          <Text style={styles.description}>{league.description}</Text>
        ) : null}
        <Text style={styles.meta}>
          by {creatorName} • {league.kind} • {(league.member_count ?? 0) + (league.team_count ?? 0)} total
        </Text>

        {nextGame ? (
          <Pressable
            onPress={() => router.push(`/challenge/${nextGame.id}` as any)}
            style={({ pressed }) => [styles.nextGameBtn, pressSoftIcon(pressed)]}
          >
            <Ionicons name="game-controller-outline" size={18} color={colors.accentMuted} style={{ marginRight: 8 }} />
            <Text style={styles.nextGameText} numberOfLines={1}>
              Next: {nextGame.title || "Challenge"} • {(nextGame.game_type ?? "game").replace(/_/g, " ")}
            </Text>
          </Pressable>
        ) : null}
        {isMember ? (
          <Pressable
            onPress={() => router.push({ pathname: "/(tabs)/create", params: { league_id: leagueId } } as any)}
            style={({ pressed }) => [styles.createChallengeBtn, pressSoftIcon(pressed)]}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accentMuted} style={{ marginRight: 8 }} />
            <Text style={styles.createChallengeText}>Create challenge</Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          {!isMember && canJoin ? (
            <Pressable
              onPress={handleJoin}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, busy && styles.disabled, pressSoft(pressed)]}
            >
              <Text style={styles.primaryBtnText}>{busy ? "Joining…" : "Join League"}</Text>
            </Pressable>
          ) : !isOwner ? (
            <Pressable
              onPress={handleLeave}
              disabled={busy}
              style={({ pressed }) => [styles.secondaryBtn, busy && styles.disabled, pressSoft(pressed)]}
            >
              <Text style={styles.secondaryBtnText}>Leave League</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleDelete}
              disabled={busy}
              style={({ pressed }) => [styles.dangerBtn, busy && styles.disabled, pressSoft(pressed)]}
            >
              <Text style={styles.dangerBtnText}>Delete League</Text>
            </Pressable>
          )}
        </View>
      </View>

      {showTeamStandings || showPlayerStandings ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season standings</Text>
          <Text style={styles.standingsExplainer}>
            Ladder from completed league matches — separate from King / spot leaderboards.
          </Text>
          {showTeamStandings && showPlayerStandings ? (
            <View style={styles.standingsTabRow}>
              <Pressable
                onPress={() => setStandingsTab("teams")}
                style={[styles.standingsTab, standingsTab === "teams" && styles.standingsTabOn]}
              >
                <Text style={[styles.standingsTabText, standingsTab === "teams" && styles.standingsTabTextOn]}>Crews</Text>
              </Pressable>
              <Pressable
                onPress={() => setStandingsTab("players")}
                style={[styles.standingsTab, standingsTab === "players" && styles.standingsTabOn]}
              >
                <Text style={[styles.standingsTabText, standingsTab === "players" && styles.standingsTabTextOn]}>
                  Players
                </Text>
              </Pressable>
            </View>
          ) : null}

          {teamStandings.length === 0 && playerStandings.length === 0 ? (
            <View style={styles.standingsEmpty}>
              <Ionicons name="trophy-outline" size={40} color={colors.textMuted} />
              <Text style={styles.standingsEmptyTitle}>No ladder yet</Text>
              <Text style={styles.standingsEmptySub}>
                Finish league matches with a winner — standings fill in automatically.
              </Text>
            </View>
          ) : (
            <>
              {showTeamStandings && (!showPlayerStandings || standingsTab === "teams")
                ? teamStandings.map((t, idx) => (
                    <Pressable
                      key={t.teamId}
                      onPress={() => router.push(`/team/${t.teamId}` as any)}
                      style={[styles.standingRow, idx === 0 && styles.standingRowGold, idx === 1 && styles.standingRowSilver, idx === 2 && styles.standingRowBronze]}
                    >
                      <Text style={styles.standingRank}>{idx + 1}</Text>
                      <Text style={styles.standingName}>{t.name}</Text>
                      <View style={styles.recordPill}>
                        <Text style={styles.standingWins}>
                          {t.wins}-{t.losses}
                          {t.ties > 0 ? `-${t.ties}` : ""}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
              {showPlayerStandings && (!showTeamStandings || standingsTab === "players")
                ? playerStandings.map((p, idx) => (
                    <Pressable
                      key={p.userId}
                      onPress={() => router.push(`/user/${p.userId}` as any)}
                      style={[styles.standingRow, idx === 0 && styles.standingRowGold, idx === 1 && styles.standingRowSilver, idx === 2 && styles.standingRowBronze]}
                    >
                      <Text style={styles.standingRank}>{idx + 1}</Text>
                      <Text style={styles.standingName}>{p.name}</Text>
                      <View style={styles.recordPill}>
                        <Text style={styles.standingWins}>
                          {p.wins}-{p.losses}
                          {p.ties > 0 ? `-${p.ties}` : ""}
                        </Text>
                      </View>
                    </Pressable>
                  ))
                : null}
            </>
          )}
        </View>
      ) : null}

      {completed.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent matches</Text>
          {completed.slice(0, 5).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/challenge/${c.id}` as any)}
              style={({ pressed }) => [styles.matchRow, pressSoftIcon(pressed)]}
            >
              <Text style={styles.matchTitle} numberOfLines={1}>
                {c.title || "Challenge"}
              </Text>
              <Text style={styles.matchMeta}>
                {teamNames.get(c.creator_team_id ?? "") ?? "—"} vs {teamNames.get(c.opponent_team_id ?? "") ?? "—"} •{" "}
                {c.winner_team_id ? (teamNames.get(c.winner_team_id) ?? "Winner") : "Tie"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", padding: space.lg, paddingTop: 60 },
  backIcon: { marginRight: space.lg },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  loadingText: { marginTop: space.md, color: colors.textMuted },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  backBtn: { marginTop: space.lg, padding: space.md, borderRadius: radius.sm, backgroundColor: colors.accent },
  backBtnText: { color: colors.text, fontWeight: "700" },
  profileCard: {
    marginHorizontal: space.lg,
    padding: space.xl,
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  avatarText: { color: colors.text, fontSize: 32, fontWeight: "900" },
  leagueName: { fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center" },
  description: { marginTop: space.sm, color: colors.textSecondary, fontSize: 15, textAlign: "center" },
  meta: { marginTop: space.sm, color: colors.textMuted, fontSize: 14 },
  nextGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  nextGameText: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  createChallengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  createChallengeText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  actions: { marginTop: space.xl, width: "100%" },
  primaryBtn: { padding: 14, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center" },
  primaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  secondaryBtn: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  dangerBtn: { padding: 14, borderRadius: radius.md, backgroundColor: "rgba(239,68,68,0.22)", alignItems: "center", borderWidth: 1, borderColor: "rgba(239,68,68,0.45)" },
  dangerBtnText: { color: colors.danger, fontWeight: "800", fontSize: 16 },
  disabled: { opacity: 0.5 },
  section: { padding: space.lg, paddingTop: 0 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: space.md },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingRowGold: { borderLeftWidth: 4, borderLeftColor: colors.gold, backgroundColor: colors.goldSurface },
  standingRowSilver: {
    borderLeftWidth: 4,
    borderLeftColor: colors.podiumSilver,
    backgroundColor: colors.podiumSilverSurface,
  },
  standingRowBronze: {
    borderLeftWidth: 4,
    borderLeftColor: colors.podiumBronze,
    backgroundColor: colors.podiumBronzeSurface,
  },
  standingRank: { color: colors.textMuted, fontSize: 14, width: 28, fontWeight: "800" },
  standingName: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  recordPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingWins: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  matchRow: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceElevated, marginBottom: space.sm, borderWidth: 1, borderColor: colors.border },
  matchTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  matchMeta: { marginTop: space.xs, color: colors.textMuted, fontSize: 13 },
  standingsExplainer: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: space.md,
    lineHeight: 17,
  },
  standingsEmpty: {
    alignItems: "center",
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingsEmptyTitle: { marginTop: space.md, color: colors.text, fontWeight: "800", fontSize: 16 },
  standingsEmptySub: { marginTop: space.xs, color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 },
  standingsTabRow: {
    flexDirection: "row",
    marginBottom: space.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.xs,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingsTab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm },
  standingsTabOn: { backgroundColor: colors.accentSurface },
  standingsTabText: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  standingsTabTextOn: { color: colors.text },
});
