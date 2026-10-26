// app/global-rankings.tsx — App-wide ladders (not per-arena crowns)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "./components/AppHeader";
import {
  getFriendsLeaderboard,
  getGlobalLeaderboard,
  getArenaGameLeaderboard,
  getEgameCategoryLeaderboard,
  type GameLeaderboardEntry,
  type LeaderboardEntry,
  type LeaderboardType,
} from "../lib/backend/leaderboards";
import { EGAME_CATEGORIES, GAME_CATEGORIES, type LeaderboardCategory } from "../lib/data/leaderboardTaxonomy";
import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";
import { space } from "../lib/theme/spacing";
import { pressSoft } from "../lib/ui/pressableStyles";
import Avatar from "../lib/ui/Avatar";
import { SkeletonLeaderboardRow } from "../lib/ui/Skeleton";
import { lightTap } from "../lib/utils/haptics";
import {
  GLOBAL_LEGENDS_GAMES,
  GLOBAL_RANKINGS_SUBTITLE,
  GLOBAL_RANKINGS_TITLE,
  LEGENDS_PERSPECTIVE_CREW,
  LEGENDS_PERSPECTIVE_INDIVIDUAL,
  LEGENDS_PICK_COPY,
  type LegendsGameKey,
} from "../lib/theme/arenaCopy";

const ARENA_TYPES: { key: LeaderboardType; label: string; icon: string; suffix: string }[] = [
  { key: "wins", label: "Wins", icon: "trophy", suffix: " wins" },
  { key: "rating", label: "Rating", icon: "star", suffix: "" },
  { key: "streak", label: "Streak", icon: "flame", suffix: " streak" },
  { key: "winRate", label: "Win %", icon: "trending-up", suffix: "%" },
];

type GlobalGameKey = Exclude<LegendsGameKey, "territory">;

export default function GlobalRankingsScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);

  const [legendsGame, setLegendsGame] = useState<GlobalGameKey | null>(null);
  const [rankingsMode, setRankingsMode] = useState<"overall" | "byGame">("byGame");
  const [teamMode, setTeamMode] = useState(false);

  const [arenaType, setArenaType] = useState<LeaderboardType>("wins");
  const [arenaScope, setArenaScope] = useState<"global" | "friends">("global");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [arenaLoading, setArenaLoading] = useState(true);
  const [arenaRefreshing, setArenaRefreshing] = useState(false);

  const [gameScope, setGameScope] = useState<"arenaGame" | "egame">("arenaGame");
  const [gameCategory, setGameCategory] = useState<string>("Chess");
  const [gameEntries, setGameEntries] = useState<GameLeaderboardEntry[]>([]);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameRefreshing, setGameRefreshing] = useState(false);

  const gameCategoryOptions: LeaderboardCategory[] = useMemo(() => EGAME_CATEGORIES, []);

  const loadArena = useCallback(async () => {
    setArenaLoading(true);
    try {
      const data =
        arenaScope === "friends" && userId
          ? await getFriendsLeaderboard(userId, arenaType)
          : await getGlobalLeaderboard(arenaType);
      setEntries(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setArenaLoading(false);
    }
  }, [arenaType, arenaScope, userId]);

  const loadGames = useCallback(async () => {
    setGameLoading(true);
    try {
      if (gameScope === "arenaGame") {
        const rows = await getArenaGameLeaderboard(gameCategory, "global", userId ?? null, 50);
        setGameEntries(
          rows.map((r) => ({
            rank: r.rank,
            subjectId: r.userId,
            subjectLabel: r.displayName || r.username || "Player",
            avatarUrl: r.avatarUrl,
            value: r.value,
            isTeam: false,
          }))
        );
      } else {
        const rows = await getEgameCategoryLeaderboard(
          gameCategoryOptions.find((c) => c.slug === gameCategory)?.slug ?? gameCategoryOptions[0]?.slug ?? "",
          teamMode,
          50
        );
        setGameEntries(rows);
      }
    } finally {
      setGameLoading(false);
    }
  }, [gameScope, gameCategory, userId, gameCategoryOptions, teamMode]);

  useEffect(() => {
    if (!legendsGame) return;
    if (legendsGame === "all_matches") {
      setRankingsMode("overall");
    } else {
      setRankingsMode("byGame");
      setGameScope(legendsGame === "esports" ? "egame" : "arenaGame");
      if (legendsGame === "esports" && gameCategoryOptions.length) {
        setGameCategory(gameCategoryOptions[0].slug);
        setTeamMode(false);
      }
      if (legendsGame === "in_app") {
        setGameCategory("Chess");
        setTeamMode(false);
      }
    }
  }, [legendsGame, gameCategoryOptions]);

  useEffect(() => {
    if (legendsGame === "all_matches" && rankingsMode === "overall") void loadArena();
  }, [legendsGame, rankingsMode, loadArena]);

  useEffect(() => {
    if (!legendsGame || legendsGame === "all_matches" || rankingsMode !== "byGame") return;
    void loadGames();
  }, [legendsGame, rankingsMode, loadGames, teamMode]);

  const currentArenaType = ARENA_TYPES.find((t) => t.key === arenaType)!;
  const esportsGameLabel = useMemo(() => {
    const cat = gameCategoryOptions.find((c) => c.slug === gameCategory);
    return cat?.title.replace(/^eg_/, "").replace(/_/g, " ") ?? gameCategory;
  }, [gameCategory, gameCategoryOptions]);

  return (
    <View style={styles.container}>
      <AppHeader />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.topBarText}>
          <Text style={styles.title}>{GLOBAL_RANKINGS_TITLE}</Text>
          <Text style={styles.subtitle}>{GLOBAL_RANKINGS_SUBTITLE}</Text>
        </View>
      </View>

      {!legendsGame ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroCopy}>{LEGENDS_PICK_COPY}</Text>
            <Text style={styles.heroHint}>
              Court crowns and kings are on Explore — tap any arena for place-specific legends.
            </Text>
          </View>
          <View style={styles.gameGrid}>
            {GLOBAL_LEGENDS_GAMES.map((g) => (
              <Pressable
                key={g.key}
                onPress={() => {
                  lightTap();
                  setLegendsGame(g.key as GlobalGameKey);
                }}
                style={({ pressed }) => [styles.gameCard, pressSoft(pressed)]}
              >
                <Ionicons name={g.icon as any} size={22} color={colors.gold} />
                <Text style={styles.gameLabel}>{g.label}</Text>
                <Text style={styles.gameSub}>{g.sublabel}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : legendsGame === "all_matches" ? (
        <>
          <Pressable onPress={() => setLegendsGame(null)} style={styles.backLink}>
            <Text style={styles.backLinkText}>← All categories</Text>
          </Pressable>
          <View style={styles.scopeRow}>
            <Pressable
              onPress={() => {
                lightTap();
                setArenaScope("global");
              }}
              style={[styles.scopeBtn, arenaScope === "global" && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, arenaScope === "global" && styles.scopeTextActive]}>Global</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                lightTap();
                setArenaScope("friends");
              }}
              style={[styles.scopeBtn, arenaScope === "friends" && styles.scopeBtnActive]}
            >
              <Text style={[styles.scopeText, arenaScope === "friends" && styles.scopeTextActive]}>Friends</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {ARENA_TYPES.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => {
                  lightTap();
                  setArenaType(t.key);
                }}
                style={[styles.typeTab, arenaType === t.key && styles.typeTabActive]}
              >
                <Ionicons name={t.icon as any} size={16} color={arenaType === t.key ? "#fff" : colors.textMuted} />
                <Text style={[styles.typeTabText, arenaType === t.key && styles.typeTabTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: space.lg }}
            refreshControl={
              <RefreshControl refreshing={arenaRefreshing} onRefresh={async () => { setArenaRefreshing(true); await loadArena(); setArenaRefreshing(false); }} tintColor={colors.accent} />
            }
          >
            {arenaLoading ? (
              [1, 2, 3, 4, 5].map((i) => <SkeletonLeaderboardRow key={i} />)
            ) : entries.length === 0 ? (
              <Text style={styles.empty}>No data yet — play matches to climb.</Text>
            ) : (
              entries.map((entry, i) => (
                <Pressable
                  key={entry.userId}
                  onPress={() => router.push(`/user/${entry.userId}` as any)}
                  style={[styles.row, entry.userId === userId && styles.rowMe]}
                >
                  <View style={[styles.rankBadge, i === 0 && styles.rank1]}>
                    <Text style={styles.rankText}>{entry.rank}</Text>
                  </View>
                  <Avatar imageUrl={entry.avatarUrl} name={entry.displayName || "?"} size={40} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.displayName || entry.username || "Player"}
                  </Text>
                  <Text style={styles.rowValue}>
                    {entry.value.toLocaleString()}
                    {currentArenaType.suffix}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </>
      ) : (
        <>
          <Pressable onPress={() => setLegendsGame(null)} style={styles.backLink}>
            <Text style={styles.backLinkText}>← All categories</Text>
          </Pressable>
          {legendsGame === "esports" ? (
            <View style={styles.scopeRow}>
              <Pressable
                onPress={() => {
                  lightTap();
                  setTeamMode(false);
                }}
                style={[styles.scopeBtn, !teamMode && styles.scopeBtnActive]}
              >
                <Text style={[styles.scopeText, !teamMode && styles.scopeTextActive]}>
                  {LEGENDS_PERSPECTIVE_INDIVIDUAL}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  lightTap();
                  setTeamMode(true);
                }}
                style={[styles.scopeBtn, teamMode && styles.scopeBtnActive]}
              >
                <Text style={[styles.scopeText, teamMode && styles.scopeTextActive]}>{LEGENDS_PERSPECTIVE_CREW}</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {(legendsGame === "in_app" ? GAME_CATEGORIES : gameCategoryOptions.map((c) => c.slug)).map((g) => {
              const slug = typeof g === "string" ? g : g;
              const label =
                legendsGame === "in_app"
                  ? g
                  : gameCategoryOptions.find((c) => c.slug === g)?.title.replace(/^eg_/, "").replace(/_/g, " ") ?? g;
              return (
                <Pressable
                  key={slug}
                  onPress={() => {
                    lightTap();
                    setGameCategory(slug);
                  }}
                  style={[styles.chip, gameCategory === slug && styles.chipActive]}
                >
                  <Text style={[styles.chipText, gameCategory === slug && styles.chipTextActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: space.lg }}
            refreshControl={
              <RefreshControl
                refreshing={gameRefreshing}
                onRefresh={async () => {
                  setGameRefreshing(true);
                  await loadGames();
                  setGameRefreshing(false);
                }}
                tintColor={colors.accent}
              />
            }
          >
            {gameLoading ? (
              [1, 2, 3, 4, 5].map((i) => <SkeletonLeaderboardRow key={i} />)
            ) : gameEntries.length === 0 ? (
              <Text style={styles.empty}>No leaders yet for this game.</Text>
            ) : (
              gameEntries.map((entry, i) => (
                <Pressable
                  key={entry.subjectId}
                  onPress={() =>
                    entry.isTeam
                      ? router.push(`/team/${entry.subjectId}` as any)
                      : router.push(`/user/${entry.subjectId}` as any)
                  }
                  style={styles.row}
                >
                  <View style={[styles.rankBadge, i === 0 && styles.rank1]}>
                    <Text style={styles.rankText}>{entry.rank}</Text>
                  </View>
                  <Avatar imageUrl={entry.avatarUrl} name={entry.subjectLabel} size={40} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.subjectLabel}
                  </Text>
                  <Text style={styles.rowValue}>{entry.value.toLocaleString()}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: 10,
  },
  backBtn: { padding: 4 },
  topBarText: { flex: 1 },
  title: { fontSize: 24, fontWeight: "900", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  heroCard: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCopy: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  heroHint: { color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 },
  gameGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: space.lg,
  },
  gameCard: {
    width: "47%",
    flexGrow: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  gameLabel: { color: colors.text, fontWeight: "900", fontSize: 15 },
  gameSub: { color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  backLink: { paddingHorizontal: space.lg, paddingVertical: 8 },
  backLinkText: { color: colors.accentMuted, fontWeight: "800", fontSize: 13 },
  scopeRow: {
    flexDirection: "row",
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  scopeBtnActive: { backgroundColor: colors.accent },
  scopeText: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  scopeTextActive: { color: "#fff" },
  chipRow: { paddingHorizontal: space.lg, gap: 8, paddingBottom: space.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: "#fff" },
  typeTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeTabText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  typeTabTextActive: { color: "#fff" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMe: { backgroundColor: "rgba(99,102,241,0.08)" },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rank1: { backgroundColor: colors.goldSurfaceMuted },
  rankText: { color: colors.text, fontWeight: "900", fontSize: 13 },
  rowName: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 15 },
  rowValue: { color: colors.accentMuted, fontWeight: "800", fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 32 },
});
