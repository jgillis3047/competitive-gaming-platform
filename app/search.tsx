// app/search.tsx - Intentional search: competitors, crews, arenas (not social browsing)
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Avatar from "../lib/ui/Avatar";
import { searchProfilesByUsername } from "../lib/backend/profile";
import type { ProfileRow } from "../lib/backend/profile";
import { getBlockedUserIds } from "../lib/backend/blockedUsers";
import { searchTeams } from "../lib/backend/teams";
import type { TeamWithExtras } from "../lib/backend/teams";
import { searchLeagues } from "../lib/backend/leagues";
import type { LeagueWithExtras } from "../lib/backend/leagues";
import { searchCourts, type CourtRow } from "../lib/backend/courts";
import { searchChallenges } from "../lib/backend/challenges";
import type { Challenge } from "../lib/data/challengeStore";
import { searchPosts, getLikesForPosts, type PostWithExtras } from "../lib/backend/posts";
import { getOrCreateThreadByUsers } from "../lib/backend/threadActions";
import { useAuthStore } from "../lib/data/authStore";
import {
  SEARCH_EMPTY_HINT,
  SEARCH_PLACEHOLDER,
  SEARCH_SECTION_COMPETITORS,
  SEARCH_SECTION_CREWS,
  SEARCH_SECTION_OPEN_MATCHES,
} from "../lib/theme/arenaCopy";
import { colors } from "../lib/theme/colors";
import { pressSoft, pressSoftIcon, pressSubtle } from "../lib/ui/pressableStyles";
import PostCard from "./components/PostCard";

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ compose?: string }>();
  const composeMode = String(params.compose ?? "") === "message";
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [query, setQuery] = useState("");
  const [openingThreadFor, setOpeningThreadFor] = useState<string | null>(null);
  const [people, setPeople] = useState<ProfileRow[]>([]);
  const [teams, setTeams] = useState<TeamWithExtras[]>([]);
  const [leagues, setLeagues] = useState<LeagueWithExtras[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<PostWithExtras[]>([]);
  const [courts, setCourts] = useState<CourtRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMessageThread = useCallback(
    async (targetUserId: string) => {
      if (!myId) {
        Alert.alert("Sign in required", "Log in to send messages.");
        return;
      }
      if (targetUserId === myId) return;

      setOpeningThreadFor(targetUserId);
      try {
        const threadId = await getOrCreateThreadByUsers(myId, targetUserId);
        router.back();
        router.push(`/matches/thread/${threadId}` as any);
      } catch (e: any) {
        Alert.alert("Message", e?.message ?? "Could not open conversation.");
      } finally {
        setOpeningThreadFor(null);
      }
    },
    [myId, router]
  );

  const runSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setPeople([]);
      setTeams([]);
      setLeagues([]);
      setChallenges([]);
      setPosts([]);
      setCourts([]);
      setErrorMsg(null);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [blockedIds, blockedByIds, p, t, l, c, postResults, courtResults] = await Promise.all([
        getBlockedUserIds(myId ?? null),
        myId ? import("../lib/backend/blockedUsers").then((m) => m.getBlockedByUserIds(myId)) : Promise.resolve(new Set<string>()),
        searchProfilesByUsername(q, 10),
        searchTeams(q, 10),
        searchLeagues(q, 10),
        searchChallenges(q, 10),
        searchPosts(q, 10),
        searchCourts(q, 10),
      ]);
      const hideUser = (id: string) => id === myId || blockedIds.has(id) || blockedByIds.has(id);
      setPeople((p ?? []).filter((x: ProfileRow) => !hideUser(x.id)));
      setTeams(t ?? []);
      setLeagues(l ?? []);
      setChallenges(c ?? []);
      setCourts(courtResults ?? []);

      const postList = postResults ?? [];
      if (postList.length > 0 && myId) {
        const ids = postList.map((x) => x.id);
        const { counts, liked } = await getLikesForPosts(ids, myId);
        setPosts(
          postList.map((po) => ({
            ...po,
            likeCount: counts[po.id] ?? 0,
            likedByMe: liked.has(po.id),
          }))
        );
      } else {
        setPosts(postList);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]);
      setTeams([]);
      setLeagues([]);
      setChallenges([]);
      setPosts([]);
      setCourts([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(q), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const total = people.length + teams.length + leagues.length + challenges.length + posts.length + courts.length;
  const showEmpty = query.trim().length >= 2 && !loading && total === 0 && !errorMsg;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={SEARCH_PLACEHOLDER}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>

      {composeMode ? (
        <View style={styles.composeBanner}>
          <Ionicons name="chatbubble-ellipses" size={18} color={colors.accentMuted} />
          <Text style={styles.composeBannerText}>Search for someone to message</Text>
        </View>
      ) : null}

      {query.trim().length < 2 && !loading ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hintText}>
            {composeMode ? "Type a username to start a conversation." : SEARCH_EMPTY_HINT}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable
            onPress={() => runSearch(query.trim())}
            style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : showEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No results for &quot;{query.trim()}&quot;</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {people.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {composeMode ? "People" : SEARCH_SECTION_COMPETITORS}
              </Text>
              {people.map((p) => {
                const name = p.display_name || p.username || "Unknown";
                const opening = openingThreadFor === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      if (composeMode) {
                        openMessageThread(p.id);
                        return;
                      }
                      router.back();
                      router.push(`/user/${p.id}` as any);
                    }}
                    style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
                  >
                    <Avatar imageUrl={p.avatar_url} name={name} size={44} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{name}</Text>
                      {p.username ? <Text style={styles.rowSub}>@{p.username}</Text> : null}
                    </View>
                    {composeMode ? (
                      opening ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <View style={styles.messageChip}>
                          <Text style={styles.messageChipText}>Message</Text>
                        </View>
                      )
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {!composeMode && teams.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{SEARCH_SECTION_CREWS}</Text>
              {teams.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => { router.back(); router.push(`/team/${t.id}` as any); }}
                  style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
                >
                  <Avatar imageUrl={t.avatar_url} name={t.name} size={44} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.rowSub}>{t.member_count ?? 0} members</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {!composeMode && courts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Arenas</Text>
              {courts.map((court) => (
                <Pressable
                  key={court.id}
                  onPress={() => {
                    router.back();
                    router.push(`/courts/${court.id}` as any);
                  }}
                  style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons name="location" size={20} color={colors.gold} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{court.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[court.city, court.state].filter(Boolean).join(", ") || "Open for crowns & records"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {!composeMode && challenges.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{SEARCH_SECTION_OPEN_MATCHES}</Text>
              {challenges.map((ch) => (
                <Pressable
                  key={ch.id}
                  onPress={() => { router.back(); router.push({ pathname: "/challenge/[id]", params: { id: ch.id } } as any); }}
                  style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons name="flash-outline" size={18} color={colors.accentMuted} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{ch.title}</Text>
                    <Text style={styles.rowSub}>
                      {ch.gameType} · {formatUSDFromCents(ch.entryFeeCents ?? ch.entry_fee_cents ?? 0)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {!composeMode && leagues.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Leagues</Text>
              {leagues.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => { router.back(); router.push(`/league/${l.id}` as any); }}
                  style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
                >
                  <View style={styles.iconWrap}>
                    <Text style={styles.iconText}>{(l.name ?? "?").charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{l.name}</Text>
                    <Text style={styles.rowSub}>{l.member_count ?? 0} members</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {!composeMode && posts.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Posts</Text>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLikeSuccess={() => runSearch(query.trim())}
                  onCommentSuccess={() => runSearch(query.trim())}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: { marginRight: 8 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textMuted, fontSize: 16 },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center", marginBottom: 12 },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: colors.text, fontWeight: "700" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: "800", marginBottom: 10, textTransform: "uppercase" },
  hintWrap: { paddingHorizontal: 20, paddingTop: 24 },
  hintText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  composeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
  },
  composeBannerText: { color: colors.textSecondary, fontWeight: "800", fontSize: 13 },
  messageChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.25)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.45)",
  },
  messageChipText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  rowSub: { marginTop: 2, color: colors.textMuted, fontSize: 13 },
});
