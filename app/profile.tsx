// app/profile.tsx - My profile (stack screen)
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ChallengeCard from "./components/ChallengeCard";
import PulseRecentActivityCard from "./components/PulseRecentActivityCard";
import Avatar from "../lib/ui/Avatar";
import RatingHero from "../lib/ui/RatingHero";
import ProfileTabBar, { type ProfileTabKey } from "../lib/ui/ProfileTabBar";

import { removeAvatar, uploadAvatar } from "../lib/backend/avatarService";
import { getRatingStandings, getUserGameRatings, type UserGameRating } from "../lib/backend/ratings";
import { supabase } from "../lib/backend/supabaseClient";
import { fetchUserKingBadges } from "../lib/backend/kingLeaderboard";
import { getFriendCounts } from "../lib/backend/friends";
import { listTeamsForUser } from "../lib/backend/teams";
import type { TeamWithExtras } from "../lib/backend/teams";
import { useAuthStore } from "../lib/data/authStore";
import type { Challenge, ChallengeStatus } from "../lib/data/challengeStore";
import { useChallengeStore } from "../lib/data/challengeStore";
import { useWalletStore } from "../lib/data/walletStore";
import {
  getBadgeDefinition,
  computeEarnedBadges,
  type BadgeDefinition,
} from "../lib/data/badgeDefinitions";
import { colors } from "../lib/theme/colors";
import { statusColors } from "../lib/theme/statusColors";
import EmptyState from "../lib/ui/EmptyState";
import ScreenCanvas from "../lib/ui/ScreenCanvas";
import { pressSoft, pressSoftIcon, pressSubtle } from "../lib/ui/pressableStyles";
import { getRankLabel, getRankTier } from "../lib/utils/eloRating";

type ProfileTab = ProfileTabKey;

function formatMoney(amount: number | null | undefined) {
  return `$${(Number(amount ?? 0) / 100).toFixed(2)}`;
}

function normalizeStatus(s: any): ChallengeStatus {
  // Keep it defensive; your DB/store might use different tokens.
  const v = String(s ?? "").toLowerCase();
  if (v === "open") return "open" as any;
  if (v === "accepted") return "accepted" as any;
  if (v === "in-progress" || v === "in_progress") return ("in_progress" as any);
  if (v === "completed") return "completed" as any;
  if (v === "cancelled") return "cancelled" as any;
  if (v === "expired") return "expired" as any;
  return (s as ChallengeStatus) ?? ("open" as any);
}

export default function ProfileScreen() {
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const initialized = useAuthStore((s) => s.initialized);
  const logout = useAuthStore((s) => s.logout);

  const challenges = useChallengeStore((s) => s.challenges || []);
  const setChallenges = useChallengeStore((s) => s.setChallenges);

  const balance = useWalletStore((s) => s.balance);
  const refreshWallet = useWalletStore((s) => s.refresh);
  const loadWallet = useWalletStore((s) => s.loadFromBackend);

  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [tab, setTab] = useState<ProfileTab>("overview");
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userBadges, setUserBadges] = useState<{ badge_key: string; earned_at: string }[]>([]);
  const [kingBadges, setKingBadges] = useState<{ title: string; scope_key: string }[]>([]);
  const [friendsCount, setFriendsCount] = useState(0);
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [myTeams, setMyTeams] = useState<TeamWithExtras[]>([]);
  const [ratingStandings, setRatingStandings] = useState<{ globalRank: number | null; globalTotal: number | null }>({
    globalRank: null,
    globalTotal: null,
  });
  const [gameRatings, setGameRatings] = useState<UserGameRating[]>([]);

  useEffect(() => {
    if (!initialized) return;
    if (!user?.id) router.replace("/auth/login");
  }, [initialized, user?.id, router]);

  const handleChangePhoto = useCallback(async () => {
    if (!user?.id || avatarBusy) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow access to your photos to change your avatar.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setAvatarBusy(true);
      try {
        await uploadAvatar({ userId: user.id, localUri: result.assets[0].uri });
        await refreshProfile();
        Alert.alert("Photo updated", "Your profile photo has been saved.");
      } catch (e: any) {
        Alert.alert("Upload failed", e?.message ?? "Could not update avatar.");
      } finally {
        setAvatarBusy(false);
      }
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Could not update avatar.");
      setAvatarBusy(false);
    }
  }, [user?.id, avatarBusy, refreshProfile]);

  const handleRemovePhoto = useCallback(async () => {
    if (!user?.id || avatarBusy) return;
    try {
      setAvatarBusy(true);
      await removeAvatar(user.id);
      await refreshProfile();
    } catch (e: any) {
      Alert.alert("Remove failed", e?.message ?? "Could not remove avatar.");
    } finally {
      setAvatarBusy(false);
    }
  }, [user?.id, avatarBusy, refreshProfile]);

  const handleAvatarPress = useCallback(() => {
    if (!user?.id || avatarBusy) return;
    const buttons: { text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[] = [
      { text: "Change photo", onPress: handleChangePhoto },
    ];
    if (profile?.avatar_url) {
      buttons.push({ text: "Remove photo", style: "destructive", onPress: handleRemovePhoto });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile photo", undefined, buttons);
  }, [user?.id, profile?.avatar_url, avatarBusy, handleChangePhoto, handleRemovePhoto]);

  const displayName =
    profile?.display_name || profile?.username || user?.email || "Player";

  const username =
    profile?.username
      ? `@${profile.username}`
      : user?.email
        ? `@${String(user.email).split("@")[0]}`
        : "@player";

  const rating = Number(profile?.rating ?? 1000);

  const refreshFromBackend = useCallback(async () => {
    if (!user?.id) return;

    setBusy(true);
    setErrorMsg(null);

    // Wallet refresh (do not block UI on failure)
    try {
      await loadWallet();
      await refreshWallet();
    } catch (e) {
      console.warn("[Profile] wallet refresh failed:", e);
    }

    try {
      // 1) Get challenge IDs where user participated
      const { data: playerRows } = await supabase
        .from("challenge_players")
        .select("challenge_id")
        .eq("user_id", user.id);
      const playedIds = Array.from(new Set((playerRows ?? []).map((r: any) => String(r.challenge_id))));

      // 2) Fetch challenges: created by user
      const { data: createdData } = await supabase
        .from("challenges")
        .select("id, title, status, game_type, entry_fee_cents, winner_user_id, created_at, created_by, opponent_user_id")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      // 3) Fetch challenges: user participated (not creator)
      let playedData: any[] = [];
      if (playedIds.length) {
        const { data: pd } = await supabase
          .from("challenges")
          .select("id, title, status, game_type, entry_fee_cents, winner_user_id, created_at, created_by, opponent_user_id")
          .in("id", playedIds)
          .order("created_at", { ascending: false })
          .limit(50);
        playedData = pd ?? [];
      }

      const byId = new Map<string, any>();
      for (const r of createdData ?? []) byId.set(String(r.id), r);
      for (const r of playedData) byId.set(String(r.id), r);
      const rows = Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );

      const mapped: Challenge[] = rows.map((row: any) => {
        const entryFeeCents =
          typeof row.entry_fee_cents === "number" && !Number.isNaN(row.entry_fee_cents)
            ? row.entry_fee_cents
            : 0;

        return {
          id: String(row.id),
          title: row.title ?? "Untitled challenge",
          gameType: row.game_type ?? "Custom Game",
          createdBy: "", // if you later add created_by / creator id, fill it here
          players: "",
          entryFee: entryFeeCents > 0 ? formatMoney(entryFeeCents) : "Entry Free",
          entryFeeCents,
          entry_fee_cents: entryFeeCents,
          status: normalizeStatus(row.status),
          myScore: undefined,
          opponentScore: undefined,
          winner_user_id: row.winner_user_id ?? null,
          created_by: row.created_by ?? null,
          opponent_user_id: row.opponent_user_id ?? null,
        } as any;
      });

      setChallenges(mapped);

      // Load user badges from user_badges table
      const { data: badgeRows } = await supabase
        .from("user_badges")
        .select("badge_key, earned_at")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false });
      setUserBadges((badgeRows ?? []) as any[]);

      try {
        const kb = await fetchUserKingBadges(user.id);
        setKingBadges(kb);
      } catch {
        setKingBadges([]);
      }

      // Load friends count
      try {
        const counts = await getFriendCounts(user.id);
        setFriendsCount(counts.friends);
      } catch { /* ignore */ }

      try {
        const teams = await listTeamsForUser(user.id);
        setMyTeams(teams);
      } catch {
        setMyTeams([]);
      }

      try {
        const { syncEarnedBadgesToFeed } = await import("../lib/backend/badgeFeedSync");
        await syncEarnedBadgesToFeed(user.id);
      } catch {
        /* non-fatal */
      }

      // Load my posts
      try {
        const { data: postsData } = await supabase
          .from("posts")
          .select("*, post_media(*)")
          .eq("user_id", user.id)
          .is("parent_post_id", null)
          .order("created_at", { ascending: false })
          .limit(20);
        setMyPosts(postsData ?? []);
      } catch { /* ignore */ }

      try {
        const currentRating = Number(useAuthStore.getState().profile?.rating ?? 1000);
        const [standings, perGame] = await Promise.all([
          getRatingStandings(user.id, currentRating),
          getUserGameRatings(user.id),
        ]);
        setRatingStandings(standings);
        setGameRatings(perGame);
      } catch {
        setRatingStandings({ globalRank: null, globalTotal: null });
        setGameRatings([]);
      }
    } catch (e: any) {
      console.error("[Profile] refresh challenges error:", e);
      setErrorMsg(e?.message ?? "Could not refresh profile data.");
    } finally {
      setBusy(false);
    }
  }, [user?.id, loadWallet, refreshWallet, setChallenges]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      refreshFromBackend();
    }, [user?.id, refreshFromBackend])
  );

  const computed = useMemo(() => {
    const completed = challenges.filter((c) => String(c.status).toLowerCase() === "completed");

    let wins = 0,
      losses = 0,
      ties = 0;

    for (const c of completed as any[]) {
      if (c.winner_user_id === user?.id) wins += 1;
      else if (c.winner_user_id == null) ties += 1;
      else losses += 1;
    }

    const totalPlayed = wins + losses + ties;
    const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;

    // streak = consecutive wins from most-recent completed (assumes your list is newest-first)
    let streak = 0;
    for (const c of completed as any[]) {
      if (c.winner_user_id === user?.id) streak += 1;
      else break;
    }

    const open = challenges.filter((c) => String(c.status).toLowerCase() === "open").length;
    const active = challenges.filter((c) => {
      const s = String(c.status).toLowerCase();
      return s === "accepted" || s === "in-progress" || s === "in_progress";
    }).length;

    const recent = challenges.slice(0, 10);

    // Per-game stats: { gameType: { wins, losses, ties } }
    const perGame: Record<string, { wins: number; losses: number; ties: number }> = {};
    for (const c of completed as any[]) {
      const game = String(c.gameType ?? "Other").trim() || "Other";
      if (!perGame[game]) perGame[game] = { wins: 0, losses: 0, ties: 0 };
      if (c.winner_user_id === user?.id) perGame[game].wins += 1;
      else if (c.winner_user_id == null) perGame[game].ties += 1;
      else perGame[game].losses += 1;
    }
    const perGameStats = Object.entries(perGame)
      .map(([game, s]) => ({ game, ...s }))
      .sort((a, b) => (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties));

    const recentWins = (completed as any[])
      .filter((c) => c.winner_user_id === user?.id)
      .slice(0, 3);

    const topGame = perGameStats[0] ?? null;

    const rivalryMap = new Map<string, { wins: number; losses: number }>();
    for (const c of completed as any[]) {
      const uid = user?.id;
      if (!uid) continue;
      const opp =
        c.created_by === uid
          ? c.opponent_user_id
          : c.created_by && c.created_by !== uid
            ? c.created_by
            : c.opponent_user_id && c.opponent_user_id !== uid
              ? c.opponent_user_id
              : null;
      if (!opp) continue;
      const cur = rivalryMap.get(opp) ?? { wins: 0, losses: 0 };
      if (c.winner_user_id === uid) cur.wins += 1;
      else if (c.winner_user_id && c.winner_user_id !== uid) cur.losses += 1;
      rivalryMap.set(opp, cur);
    }
    const topRivals = [...rivalryMap.entries()]
      .map(([id, s]) => ({ opponentId: id, ...s, total: s.wins + s.losses }))
      .filter((r) => r.total >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    // Compute earned badges using the badge definitions system
    const earnedBadges = computeEarnedBadges({
      wins,
      totalPlayed,
      winRate,
      streak,
      maxStreak: streak,
      accountCreatedAt: profile?.created_at ?? undefined,
    });

    return {
      wins,
      losses,
      ties,
      totalPlayed,
      winRate,
      streak,
      open,
      active,
      recent,
      perGameStats,
      earnedBadges,
      recentWins,
      topGame,
      topRivals,
    };
  }, [challenges, user?.id, profile?.created_at]);

  const spotKingBadges = useMemo(
    () => kingBadges.filter((k) => k.scope_key.startsWith("court|") || k.scope_key.startsWith("city|")),
    [kingBadges]
  );
  const gameTitleBadges = useMemo(
    () => kingBadges.filter((k) => k.scope_key.startsWith("egame|")),
    [kingBadges]
  );

  const handleLogout = async () => {
    try {
      await logout();
      setChallenges([]);
      router.replace("/auth/login");
    } catch (e) {
      console.error("[Profile] logout failed", e);
    }
  };

  const TopBar = (
    <View style={styles.topBar}>
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.appTitle}>Profile</Text>
        <Text style={styles.appSubtitle}>Your competitive identity — crowns, rivals & highlights</Text>
      </View>
      <Pressable
        onPress={() => refreshFromBackend()}
        style={({ pressed }) => [styles.refreshBtn, pressSoftIcon(pressed)]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <Ionicons name="refresh" size={22} color="#fff" />
        )}
      </Pressable>
    </View>
  );

  const Cover = (
    <View style={styles.cover}>
      <View style={styles.heroCenter}>
        <Pressable
          onPress={handleAvatarPress}
          disabled={!user?.id || avatarBusy}
          style={({ pressed }) => [styles.avatarHeroWrap, pressed && !avatarBusy && { opacity: 0.9 }]}
        >
          <View style={styles.avatarRing}>
            <Avatar
              key={profile?.avatar_url ?? "no-avatar"}
              imageUrl={profile?.avatar_url}
              name={displayName}
              size={88}
            />
            {avatarBusy ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color={colors.text} />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={16} color={colors.text} />
              </View>
            )}
          </View>
        </Pressable>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.username}>{username}</Text>
        <RatingHero
          rating={rating}
          globalRank={ratingStandings.globalRank}
          globalTotal={ratingStandings.globalTotal}
        />
        {spotKingBadges.length > 0 ? (
          <View style={styles.crownHeroPill}>
            <Ionicons name="ribbon" size={16} color={colors.gold} />
            <Text style={styles.crownHeroText}>
              {spotKingBadges.length === 1
                ? `King of ${spotKingBadges[0].title}`
                : `${spotKingBadges.length} crowns held`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statsBar}>
        <Pressable
          onPress={() => user?.id && router.push(`/friends/${user.id}` as any)}
          style={({ pressed }) => [styles.statItem, pressSubtle(pressed)]}
        >
          <Text style={styles.statBarValue}>{friendsCount}</Text>
          <Text style={styles.statBarLabel}>{friendsCount === 0 ? "Invite friends" : "Friends"}</Text>
        </Pressable>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statBarValue}>
            {
              new Set([
                ...userBadges.map((b) => b.badge_key),
                ...computed.earnedBadges.map((b) => b.key),
                ...kingBadges.map((k) => `king:${k.scope_key}`),
              ]).size
            }
          </Text>
          <Text style={styles.statBarLabel}>Badges</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statBarValue}>{myPosts.length}</Text>
          <Text style={styles.statBarLabel}>Posts</Text>
        </View>
      </View>

      <View style={styles.heroButtons}>
        <Pressable
          onPress={() => user?.id && router.push(`/friends/${user.id}` as any)}
          disabled={!user?.id}
          style={({ pressed }) => [styles.heroBtn, pressSoft(pressed), !user?.id && { opacity: 0.5 }]}
        >
          <Text style={styles.heroBtnText}>Friends</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/edit-profile" as any)}
          style={({ pressed }) => [styles.heroBtn, pressSoft(pressed)]}
        >
          <Text style={styles.heroBtnText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/leaderboards" as any)}
          style={({ pressed }) => [styles.heroBtn, pressSoft(pressed)]}
        >
          <Text style={styles.heroBtnText}>Explore</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/matches" as any)}
          style={({ pressed }) => [styles.heroBtnPrimary, pressSoft(pressed)]}
        >
          <Text style={styles.heroBtnPrimaryText}>Matches</Text>
        </Pressable>
      </View>
    </View>
  );

  const Tabs = <ProfileTabBar tab={tab} onChange={setTab} />;

  const Overview = (
    <View style={{ gap: 12 }}>
      <View style={[styles.panel, styles.storyPanel]}>
        <View style={styles.storyHeader}>
          <Ionicons name="sparkles" size={20} color={colors.gold} />
          <Text style={styles.panelTitle}>Your story</Text>
        </View>
        {computed.streak > 1 ? (
          <View style={styles.streakHighlight}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakTitle}>{computed.streak}-win streak</Text>
              <Text style={styles.badgeHint}>Hottest run right now — keep the crown energy going.</Text>
            </View>
          </View>
        ) : null}
        {computed.topGame ? (
          <View style={styles.storyRow}>
            <Ionicons name="game-controller" size={18} color={colors.accent} />
            <Text style={styles.storyRowText}>
              Top game: <Text style={styles.storyRowStrong}>{computed.topGame.game}</Text> ({computed.topGame.wins}W-
              {computed.topGame.losses}L)
            </Text>
          </View>
        ) : null}
        {spotKingBadges.length > 0 ? (
          <View style={styles.storyRow}>
            <Ionicons name="ribbon" size={18} color={colors.gold} />
            <Text style={styles.storyRowText}>
              {spotKingBadges.length} claimed spot{spotKingBadges.length === 1 ? "" : "s"} — territory on the map
            </Text>
          </View>
        ) : null}
        {computed.recentWins.length > 0 ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={styles.storySectionLabel}>Recent wins</Text>
            {computed.recentWins.map((c: any) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: "/challenge/[id]", params: { id: c.id } } as any)}
                style={({ pressed }) => [styles.recentWinRow, pressSoft(pressed)]}
              >
                <Text style={styles.recentWinEmoji}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentWinTitle} numberOfLines={1}>
                    {c.title ?? c.gameType ?? "Match win"}
                  </Text>
                  <Text style={styles.recentWinMeta}>{c.gameType ?? "Game"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.badgeHint}>Win your first match — your highlight reel starts here.</Text>
        )}
        {computed.topRivals.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={styles.storySectionLabel}>Rivalry history</Text>
            {computed.topRivals.map((r) => (
              <Pressable
                key={r.opponentId}
                onPress={() => router.push(`/user/${r.opponentId}` as any)}
                style={({ pressed }) => [styles.recentWinRow, pressSoft(pressed)]}
              >
                <Text style={styles.recentWinEmoji}>⚔️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentWinTitle}>Head-to-head</Text>
                  <Text style={styles.recentWinMeta}>
                    You {r.wins}–{r.losses} · {r.total} matches
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.cardsRow}>
        <StatCard
          label="Record"
          value={`${computed.wins}-${computed.losses}`}
          hint={`${computed.ties} ties`}
        />
        <StatCard
          label="Win Rate"
          value={`${computed.winRate}%`}
          hint={`${computed.totalPlayed} played`}
        />
        <StatCard label="Streak" value={`${computed.streak}`} hint="wins in a row" />
      </View>

      {spotKingBadges.length > 0 ? (
        <View style={[styles.panel, styles.crownPanel]}>
          <View style={styles.crownPanelHeader}>
            <Ionicons name="ribbon" size={22} color={colors.gold} />
            <Text style={styles.crownPanelTitle}>Your crowns</Text>
          </View>
          <Text style={styles.badgeHint}>Territory you hold right now — defend it or lose it to a challenger.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {spotKingBadges.map((k) => (
              <View key={k.scope_key} style={styles.kingBadgeChip}>
                <Ionicons name="ribbon" size={16} color={colors.gold} />
                <Text style={styles.kingBadgeChipText} numberOfLines={2}>
                  {k.title}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={[styles.panel, styles.crownPanelMuted]}>
          <View style={styles.crownPanelHeader}>
            <Ionicons name="ribbon-outline" size={22} color={colors.textMuted} />
            <Text style={styles.crownPanelTitle}>No crowns yet</Text>
          </View>
          <Text style={styles.badgeHint}>
            Claim a spot on Explore — become king of a park, gym, or campus.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/leaderboards" as any)}
            style={({ pressed }) => [styles.crownCta, pressSoft(pressed)]}
          >
            <Text style={styles.crownCtaText}>Explore nearby spots</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.flatSection}>
        <Text style={styles.flatSectionTitle}>Crews & leagues</Text>
        <Text style={styles.badgeHint}>
          Create a crew, invite friends when you're ready — run squad challenges and claim crowns together.
        </Text>
        <View style={styles.teamsCtaRow}>
          <Pressable
            onPress={() => router.push("/team/create" as any)}
            style={({ pressed }) => [styles.teamsCtaPrimary, pressSoft(pressed)]}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.teamsCtaPrimaryText}>Create a crew</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/teams" as any)}
            style={({ pressed }) => [styles.teamsCtaSecondary, pressSoft(pressed)]}
          >
            <Ionicons name="people-outline" size={18} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.teamsCtaSecondaryText}>My crews & invites</Text>
          </Pressable>
        </View>
        {myTeams.length > 0 ? (
          <View style={{ marginTop: 14, gap: 8 }}>
            {myTeams.slice(0, 3).map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/team/${t.id}` as any)}
                style={({ pressed }) => [styles.teamPreviewRow, pressSoft(pressed)]}
              >
                <Avatar imageUrl={t.avatar_url} name={t.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamPreviewName} numberOfLines={1}>{t.name}</Text>
                  <Text style={styles.teamPreviewMeta}>{t.member_count ?? 0} members</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>
            ))}
            {myTeams.length > 3 ? (
              <Pressable onPress={() => router.push("/teams" as any)} style={({ pressed }) => [pressSubtle(pressed)]}>
                <Text style={styles.teamPreviewMore}>See all {myTeams.length} crews</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable onPress={() => router.push("/team/create" as any)} style={({ pressed }) => [styles.flatLinkRow, pressSoft(pressed)]}>
            <Text style={styles.flatLinkText}>No crews yet · Create one</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Account</Text>
        <Text style={styles.badgeHint}>Wallet and shop are here when you need them — compete first.</Text>
        <View style={styles.accountLinksRow}>
          <Pressable
            onPress={() => router.push("/wallet")}
            style={({ pressed }) => [styles.accountLink, pressSoft(pressed)]}
          >
            <Ionicons name="wallet-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLinkTitle}>Wallet</Text>
              <Text style={styles.accountLinkSub}>{formatMoney(balance)} balance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/shop" as any)}
            style={({ pressed }) => [styles.accountLink, pressSoft(pressed)]}
          >
            <Ionicons name="cart-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLinkTitle}>Shop</Text>
              <Text style={styles.accountLinkSub}>Add funds, gift cards, marketplace</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/orders")}
            style={({ pressed }) => [styles.accountLink, pressSoft(pressed)]}
          >
            <Ionicons name="receipt-outline" size={20} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLinkTitle}>Orders</Text>
              <Text style={styles.accountLinkSub}>Purchase history</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <Pressable
            onPress={() => router.push("/referrals" as any)}
            style={({ pressed }) => [styles.quickActionBtn, pressSoft(pressed)]}
          >
            <Ionicons name="people" size={18} color="#10b981" />
            <Text style={styles.quickActionText}>Invite Friends</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/daily-rewards" as any)}
            style={({ pressed }) => [styles.quickActionBtn, pressSoft(pressed)]}
          >
            <Ionicons name="gift-outline" size={18} color={colors.amberBright} />
            <Text style={styles.quickActionText}>Daily reward</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.panelTitle}>Media</Text>
          <Pressable onPress={() => setTab("posts")} style={({ pressed }) => [pressSubtle(pressed)]}>
            <Text style={styles.createPostLink}>View all</Text>
          </Pressable>
        </View>
        {myPosts.length === 0 ? (
          <EmptyState
            icon={<Ionicons name="images-outline" size={36} color={colors.textMuted} />}
            title="No posts yet"
            subtitle="Share your first highlight from Pulse."
            actionLabel="Open Pulse"
            onAction={() => router.push("/(tabs)/feed" as any)}
          />
        ) : (
          <View style={styles.mediaStrip}>
            {myPosts.slice(0, 3).map((post: any) => {
              const media = post.post_media?.[0];
              const hasImage = media?.media_type === "image" && media?.storage_path;
              return (
                <Pressable
                  key={`media-${post.id}`}
                  onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } } as any)}
                  style={({ pressed }) => [styles.mediaCard, pressSoftIcon(pressed)]}
                >
                  {hasImage ? (
                    <Image
                      source={{ uri: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${media.storage_path}` }}
                      style={styles.mediaCardImage}
                    />
                  ) : (
                    <View style={styles.mediaCardTextWrap}>
                      <Text style={styles.mediaCardText} numberOfLines={3}>
                        {post.body || post.caption || "Post"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {gameTitleBadges.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Game title badges</Text>
          <Text style={styles.badgeHint}>App-wide game and e-game titles you currently hold.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {gameTitleBadges.map((k) => (
              <View key={k.scope_key} style={styles.kingBadgeChip}>
                <Ionicons name="game-controller" size={16} color={colors.accent} />
                <Text style={styles.kingBadgeChipText} numberOfLines={2}>
                  {k.title}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Badges — flat section */}
      <View style={styles.flatSection}>
        <Text style={styles.flatSectionTitle}>Badges</Text>
        <View style={styles.badgesGrid}>
          {(() => {
            const earnedByKey = new Map(userBadges.map((ub) => [ub.badge_key, ub.earned_at]));
            const allBadges: { def: BadgeDefinition; earnedAt?: string }[] = [];
            for (const b of computed.earnedBadges) {
              allBadges.push({ def: b, earnedAt: earnedByKey.get(b.key) });
            }
            for (const ub of userBadges) {
              if (!computed.earnedBadges.some((eb) => eb.key === ub.badge_key)) {
                const def = getBadgeDefinition(ub.badge_key);
                if (def) allBadges.push({ def, earnedAt: ub.earned_at });
              }
            }
            if (allBadges.length === 0) {
              return (
                <EmptyState
                  icon={<Ionicons name="ribbon-outline" size={36} color={colors.textMuted} />}
                  title="No badges yet"
                  subtitle="Win matches to unlock your first badge."
                  actionLabel="Find a match"
                  onAction={() => router.push("/(tabs)/create" as any)}
                />
              );
            }
            return allBadges.map(({ def, earnedAt }) => (
              <Pressable
                key={def.key}
                onPress={() => setSelectedBadge(def)}
                style={({ pressed }) => [styles.badgeTile, pressSoftIcon(pressed)]}
              >
                <View style={[styles.badgeTileRing, { borderColor: def.color }]}>
                  <View style={[styles.badgeTileIconBg, { backgroundColor: `${def.color}30` }]}>
                    <Ionicons name={def.icon as any} size={18} color={def.color} />
                  </View>
                </View>
                <Text style={[styles.badgeTileLabel, { color: def.color }]} numberOfLines={1}>
                  {def.label}
                </Text>
                {earnedAt ? (
                  <Text style={styles.badgeTileEarned}>
                    Earned {new Date(earnedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </Text>
                ) : null}
              </Pressable>
            ));
          })()}
        </View>
      </View>

      {/* Per-game W-L — flat when no ELO rows yet */}
      {computed.perGameStats.length > 0 && gameRatings.length === 0 ? (
        <View style={styles.flatSection}>
          <Text style={styles.flatSectionTitle}>By game (record)</Text>
          {computed.perGameStats.map((g) => (
            <View key={g.game} style={styles.gameStatRow}>
              <Text style={styles.gameStatLabel}>{g.game}</Text>
              <Text style={styles.gameStatValue}>
                {g.wins}W – {g.losses}L{g.ties > 0 ? ` – ${g.ties}T` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Text style={styles.sectionHint}>Last 10 challenges</Text>
      </View>

      {busy && challenges.length === 0 ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading your profile…</Text>
        </View>
      ) : computed.recent.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Ionicons name="trophy-outline" size={40} color={colors.textMuted} />}
            title="No challenges yet"
            subtitle={"Create one from the Create tab and it'll show up here."}
            actionLabel="Create challenge"
            onAction={() => router.push("/create" as any)}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {computed.recent.map((ch: any) =>
            String(ch.status).toLowerCase() === "completed" ? (
              <PulseRecentActivityCard key={String(ch.id)} challenge={ch} viewerId={user?.id} />
            ) : (
              <ChallengeCard
                key={String(ch.id)}
                challenge={ch}
                onPress={() =>
                  router.push({
                    pathname: "/challenge/[id]",
                    params: { id: String(ch.id) },
                  })
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );

  const Activity = (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>All Activity</Text>
        <Text style={styles.sectionHint}>Newest first</Text>
      </View>

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      {busy && challenges.length === 0 ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading activity…</Text>
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Ionicons name="pulse-outline" size={40} color={colors.textMuted} />}
            title="Nothing here yet"
            subtitle={"Once you create or play challenges, they'll appear here."}
            actionLabel="Create challenge"
            onAction={() => router.push("/create" as any)}
          />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {challenges.slice(0, 25).map((ch: any) =>
            String(ch.status).toLowerCase() === "completed" ? (
              <PulseRecentActivityCard key={String(ch.id)} challenge={ch} viewerId={user?.id} />
            ) : (
              <ChallengeCard
                key={String(ch.id)}
                challenge={ch}
                onPress={() =>
                  router.push({
                    pathname: "/challenge/[id]",
                    params: { id: String(ch.id) },
                  })
                }
              />
            )
          )}
        </View>
      )}
    </View>
  );

  const Stats = (
    <View style={{ gap: 12 }}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Overall rating</Text>
        <Text style={styles.eloHint}>
          ELO-based — beating higher-rated opponents earns more points. Everyone starts at 1000.
        </Text>
        <View style={styles.statGrid}>
          <MiniStat label="Rating" value={`${rating}`} />
          <MiniStat label="Rank" value={getRankLabel(rating)} />
          {ratingStandings.globalRank != null ? (
            <MiniStat label="Worldwide" value={`#${ratingStandings.globalRank.toLocaleString()}`} />
          ) : null}
          <MiniStat label="Wins" value={`${computed.wins}`} />
          <MiniStat label="Losses" value={`${computed.losses}`} />
          <MiniStat label="Win Rate" value={`${computed.winRate}%`} />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Per-game ratings</Text>
        <Text style={styles.eloHint}>Skill is tracked separately for each game type.</Text>
        {gameRatings.length > 0 ? (
          gameRatings.map((g) => {
            const tier = getRankTier(g.rating);
            return (
              <View key={g.gameType} style={styles.gameRatingRow}>
                <Text style={styles.gameRatingEmoji}>{tier.emblem}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gameStatLabel}>{g.gameTitle}</Text>
                  <Text style={[styles.gameRatingRank, { color: tier.color }]}>{getRankLabel(g.rating)}</Text>
                </View>
                <Text style={styles.gameRatingValue}>{g.rating}</Text>
              </View>
            );
          })
        ) : computed.perGameStats.length > 0 ? (
          computed.perGameStats.map((g) => (
            <View key={g.game} style={styles.gameStatRow}>
              <Text style={styles.gameStatLabel}>{g.game}</Text>
              <Text style={styles.gameStatValue}>
                {g.wins}W – {g.losses}L{g.ties > 0 ? ` – ${g.ties}T` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.badgeHint}>Play ranked matches to build per-game ratings.</Text>
        )}
      </View>

      <View style={styles.flatSection}>
        <Text style={styles.flatSectionTitle}>Rank tiers</Text>
        <Text style={styles.badgeHint}>Bronze &lt;800 · Silver 800–999 · Gold 1000–1199 · Platinum 1200–1399 · Diamond 1400–1599 · Legend 1600+</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Wallet</Text>
        <Text style={styles.bigBalance}>{formatMoney(balance)}</Text>
        <Text style={styles.panelHint}>This matches your Wallet tab balance.</Text>
      </View>

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
    </View>
  );

  const Posts = (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>My Posts</Text>
        <Pressable onPress={() => router.push("/(tabs)/create" as any)}>
          <Text style={styles.createPostLink}>+ New Post</Text>
        </Pressable>
      </View>

      {myPosts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Ionicons name="images-outline" size={40} color={colors.textMuted} />}
            title="No posts yet"
            subtitle="Share highlights and wins from the Feed tab."
            actionLabel="Open Feed"
            onAction={() => router.push("/(tabs)/feed" as any)}
          />
        </View>
      ) : (
        <View style={styles.postsMosaic}>
          {(() => {
            const featured = myPosts[0];
            const secondary = myPosts.slice(1, 5);
            const renderTile = (post: any, style: any) => {
              const media = post.post_media?.[0];
              const hasImage = media?.media_type === "image" && media?.storage_path;
              return (
                <Pressable
                  key={post.id}
                  onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } } as any)}
                  style={({ pressed }) => [style, pressSoftIcon(pressed)]}
                >
                  {hasImage ? (
                    <Image
                      source={{ uri: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${media.storage_path}` }}
                      style={styles.postThumbnailImage}
                    />
                  ) : (
                    <View style={styles.postThumbnailText}>
                      <Text style={styles.postThumbnailBody} numberOfLines={3}>
                        {post.body || post.caption || "Post"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            };
            return (
              <>
                {featured ? renderTile(featured, styles.postFeatured) : null}
                <View style={styles.postsGrid}>
                  {secondary.map((post: any) => renderTile(post, styles.postThumbnail))}
                </View>
              </>
            );
          })()}
        </View>
      )}
    </View>
  );

  const handleShareBadge = async (badge: BadgeDefinition) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.id) {
        Alert.alert("Error", "You must be signed in to share.");
        return;
      }
      const body = `I just earned the "${badge.label}" badge! ${badge.description}`;
      const { error } = await supabase.from("posts").insert({
        user_id: authUser.id,
        body,
        kind: "highlight",
        visibility: "public",
        payload: { badge_key: badge.key, type: "achievement" },
      });
      if (error) throw error;
      Alert.alert("Posted!", "Your achievement has been shared.");
      setSelectedBadge(null);
      refreshFromBackend();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not share badge.");
    }
  };

  const BadgeModal = selectedBadge ? (
    <Modal transparent animationType="fade" visible={!!selectedBadge} onRequestClose={() => setSelectedBadge(null)}>
      <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.modalBadgeIcon, { backgroundColor: `${selectedBadge.color}30` }]}>
            <Ionicons name={selectedBadge.icon as any} size={40} color={selectedBadge.color} />
          </View>
          <Text style={styles.modalBadgeLabel}>{selectedBadge.label}</Text>
          <Text style={styles.modalBadgeDesc}>{selectedBadge.description}</Text>
          <View style={styles.modalBadgeReq}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.modalBadgeReqText}>{selectedBadge.requirement}</Text>
          </View>
          <View style={styles.modalActions}>
            <Pressable
              onPress={() => handleShareBadge(selectedBadge)}
              style={({ pressed }) => [styles.shareBtn, pressSoft(pressed)]}
            >
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Share Achievement</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedBadge(null)} style={styles.closeModalBtn}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return (
    <ScreenCanvas variant="gold">
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="always">
      {TopBar}
      {Cover}
      {Tabs}

      {tab === "overview" ? Overview : null}
      {tab === "posts" ? Posts : null}
      {tab === "activity" ? Activity : null}
      {tab === "stats" ? Stats : null}

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>

      <View style={{ height: 28 }} />

      {BadgeModal}
    </ScrollView>
    </ScreenCanvas>
  );
}

function TabChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabChip,
        selected && styles.tabChipSelected,
        pressSoft(pressed),
      ]}
    >
      <Text style={[styles.tabChipText, selected && styles.tabChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },

  topBar: {
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { marginRight: 12 },
  appTitle: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: 0.1 },
  appSubtitle: { marginTop: 2, fontSize: 13, color: colors.textTertiary },

  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  cover: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
    padding: 20,
    paddingBottom: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 14,
  },
  heroCenter: {
    alignItems: "center",
    marginBottom: 14,
  },
  avatarHeroWrap: { alignSelf: "center" },
  avatarRing: {
    position: "relative",
    padding: 4,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  statItem: { alignItems: "center", flex: 1 },
  statBarValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statBarLabel: { color: colors.textTertiary, fontSize: 11, fontWeight: "800", marginTop: 2 },
  statDivider: { width: 1, height: 24, backgroundColor: colors.line },
  coverGlowA: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: "rgba(79,109,245,0.08)",
    top: -120,
    left: -80,
  },
  coverGlowB: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(59,130,246,0.06)",
    bottom: -160,
    right: -120,
  },

  coverTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 10 },
  username: { color: colors.textTertiary, marginTop: 4, fontSize: 14, fontWeight: "700" },

  ratingPill: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 8,
  },
  ratingNumber: { fontWeight: "900", fontSize: 16, color: colors.text },
  ratingLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: "800" },

  avatarRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEditBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  heroButtons: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  heroBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heroBtnText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  heroBtnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accentCTA,
  },
  heroBtnPrimaryText: { color: colors.text, fontWeight: "900", fontSize: 13 },

  tabsRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabChipSelected: { backgroundColor: colors.accentChip, borderColor: colors.accentChipBorder },
  tabChipText: { color: colors.textTertiary, fontSize: 12, fontWeight: "900" },
  tabChipTextSelected: { color: colors.text },

  cardsRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  statCard: {
    width: "31%",
    minWidth: 96,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 10,
  },
  statLabel: { color: colors.textTertiary, fontSize: 11, marginBottom: 2, fontWeight: "800" },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "900" },
  statHint: { color: colors.textMuted, marginTop: 2, fontSize: 11, fontWeight: "700" },

  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 10 },
  storyPanel: {
    borderColor: colors.goldBorderSoft,
    backgroundColor: colors.goldSurfaceMuted,
  },
  storyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  streakHighlight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: statusColors.hot.bg,
    borderWidth: 1,
    borderColor: statusColors.hot.border,
  },
  streakEmoji: { fontSize: 24 },
  streakTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  storyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  storyRowText: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  storyRowStrong: { color: colors.text, fontWeight: "900" },
  storySectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  recentWinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentWinEmoji: { fontSize: 18 },
  recentWinTitle: { color: colors.text, fontWeight: "800", fontSize: 14 },
  recentWinMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
  flatSection: { marginTop: 4, gap: 8 },
  flatSectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  flatLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  flatLinkText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
  teamsCtaRow: { marginTop: 12, gap: 10 },
  teamsCtaPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  teamsCtaPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  teamsCtaSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  teamsCtaSecondaryText: { color: colors.accent, fontWeight: "800", fontSize: 15 },
  teamPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  teamPreviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.accent}35`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  teamPreviewAvatarText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  teamPreviewName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  teamPreviewMeta: { marginTop: 2, color: colors.textTertiary, fontSize: 12, fontWeight: "700" },
  teamPreviewMore: { color: colors.accent, fontSize: 14, fontWeight: "800", textAlign: "center", paddingVertical: 4 },

  quickActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickActionText: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  badgeTile: {
    width: 72,
    alignItems: "center",
  },
  badgeTileRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTileIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTileLabel: { marginTop: 6, fontSize: 11, fontWeight: "900", textAlign: "center" },
  badgeTileEarned: { marginTop: 2, fontSize: 10, color: colors.textTertiary, fontWeight: "700" },
  badgeHint: { color: colors.textMuted, fontSize: 13, fontStyle: "italic" },
  crownHeroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  crownHeroText: { color: colors.gold, fontSize: 13, fontWeight: "800" },
  crownPanel: {
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldSurfaceFaint,
  },
  crownPanelMuted: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  crownPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  crownPanelTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  crownCta: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  crownCtaText: { color: colors.gold, fontWeight: "800", fontSize: 14 },
  accountLinksRow: { marginTop: 8, gap: 8 },
  accountLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  accountLinkTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  accountLinkSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  kingBadgeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorderStrong,
  },
  kingBadgeChipText: { color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 },
  gameStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameStatLabel: { color: colors.text, fontWeight: "800", fontSize: 14 },
  gameStatValue: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
  eloHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    marginBottom: 10,
  },
  gameRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gameRatingEmoji: { fontSize: 22, width: 28, textAlign: "center" },
  gameRatingRank: { fontSize: 12, fontWeight: "800", marginTop: 2 },
  gameRatingValue: { color: colors.text, fontWeight: "900", fontSize: 18 },
  panelHint: { marginTop: 6, color: colors.textTertiary, fontSize: 12, fontWeight: "700" },
  bigBalance: { marginTop: 10, color: colors.text, fontSize: 26, fontWeight: "900" },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  sectionHint: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },

  emptyWrap: { paddingVertical: 16 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  emptySub: { marginTop: 6, color: colors.textTertiary, fontSize: 13, lineHeight: 18 },

  centerWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  loadingText: { marginTop: 10, color: colors.textTertiary, fontSize: 13, fontWeight: "800" },

  statGrid: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  miniStat: {
    width: "31%",
    minWidth: 100,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 10,
  },
  miniLabel: { color: colors.textTertiary, fontSize: 12, fontWeight: "800" },
  miniValue: { marginTop: 6, color: colors.text, fontSize: 18, fontWeight: "900" },
  mediaStrip: { flexDirection: "row", gap: 8 },
  mediaCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  mediaCardImage: { width: "100%", height: "100%", resizeMode: "cover" },
  mediaCardTextWrap: { flex: 1, padding: 8, justifyContent: "center" },
  mediaCardText: { color: colors.textSecondary, fontSize: 11, fontWeight: "700" },

  errorText: { color: "#ff7b7b", marginTop: 8, fontSize: 13, fontWeight: "800" },

  logoutButton: {
    marginTop: 18,
    marginBottom: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.danger,
  },
  logoutText: { color: colors.text, fontWeight: "900", fontSize: 16 },

  createPostLink: { color: colors.accent, fontWeight: "800", fontSize: 14 },

  postsMosaic: {
    gap: 8,
  },
  postsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  postFeatured: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  postThumbnail: {
    width: "48.5%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  postThumbnailImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  postThumbnailText: {
    flex: 1,
    padding: 8,
    justifyContent: "center",
  },
  postThumbnailBody: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalBadgeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalBadgeLabel: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  modalBadgeDesc: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },
  modalBadgeReq: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  modalBadgeReqText: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "700",
  },
  modalActions: {
    width: "100%",
    gap: 10,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  shareBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  closeModalBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  closeModalBtnText: {
    color: "rgba(255,255,255,0.6)",
    fontWeight: "700",
    fontSize: 14,
  },
});
