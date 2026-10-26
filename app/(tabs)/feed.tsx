// app/(tabs)/feed.tsx — Pulse: unified local competition activity (not livestreaming)
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import AppHeader from "../components/AppHeader";
import PulseCrewsTab from "../components/PulseCrewsTab";
import PulseCrownsTab from "../components/PulseCrownsTab";
import PulsePeopleTab from "../components/PulsePeopleTab";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import ChallengeCard from "../components/ChallengeCard";
import PulseRecentActivityCard from "../components/PulseRecentActivityCard";
import PostCard from "../components/PostCard";
import PulseTabBar, { type PulseTabKey } from "../../lib/ui/PulseTabBar";

import { fetchRecentChallenges } from "../../lib/backend/challenges";
import { fetchFeedGameStats, gameTypeKeyFromChallenge, type GameFeedStats } from "../../lib/backend/challengeFeedStats";
import { repairMyActiveChallenges } from "../../lib/backend/challengeActions";
import { expireOpenChallenges } from "../../lib/backend/expireOpenChallenges";
import { syncEarnedBadgesToFeed } from "../../lib/backend/badgeFeedSync";
import {
  createGlobalPost,
  fetchPublicFeed,
  getLikesForPosts,
  type PendingMedia,
  type PostWithExtras,
} from "../../lib/backend/posts";
import type { ChallengeStatus } from "../../lib/data/challengeStore";
import { useAuthStore } from "../../lib/data/authStore";
import { useChallengeStore } from "../../lib/data/challengeStore";
import EmptyState from "../../lib/ui/EmptyState";
import { pressSoft, pressSubtle } from "../../lib/ui/pressableStyles";
import { SkeletonCard, SkeletonChallengeCard } from "../../lib/ui/Skeleton";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { fetchSpotsActivityNear } from "../../lib/backend/spotsActivity";
import { humanizeFetchError } from "../../lib/utils/networkErrors";
import { isCompetitionPost } from "../../lib/utils/competitionPosts";
import { resolveForegroundLatLng } from "../../lib/utils/resolveForegroundLatLng";
import { getFriendIds } from "../../lib/backend/friends";
import { lightTap } from "../../lib/utils/haptics";
import {
  PULSE_SUBTITLE,
  PULSE_TAB_TITLE,
} from "../../lib/theme/arenaCopy";

function normalize(s: string) {
  return (s ?? "").trim().toLowerCase();
}

function isLiveStatus(status: ChallengeStatus) {
  return status === "accepted" || status === "in-progress" || status === "checked-in";
}

type FeedFilter = "all" | "live" | "open";

type FeedItem =
  | { type: "post"; data: PostWithExtras; presentation?: "default" | "recent" }
  | { type: "challenge"; data: any; presentation?: "default" | "recent" };

function parseActivityTs(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function challengeActivityTs(c: any): number {
  const status = String(c?.status ?? "").toLowerCase();
  if (status === "completed") {
    return parseActivityTs(c?.completed_at ?? c?.updated_at ?? c?.created_at);
  }
  return parseActivityTs(c?.updated_at ?? c?.created_at);
}

function postActivityTs(p: PostWithExtras): number {
  return parseActivityTs((p as { updated_at?: string | null }).updated_at ?? p?.created_at);
}

function challengeToFeedItem(c: any): FeedItem {
  const status = String(c?.status ?? "").toLowerCase();
  if (status === "open" || isLiveStatus(c.status)) {
    return { type: "challenge", data: c, presentation: "default" };
  }
  return { type: "challenge", data: c, presentation: "recent" };
}

function pickEntryCents(c: any): number {
  const n = Number(c?.entry_fee_cents ?? c?.entryFeeCents ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatUsdShort(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Same game + creator + title → one row with multiple entry tiers (reduces duplicate-card noise). */
function openChallengeGroupKey(c: any): string {
  const creator = String(c?.created_by ?? "").trim();
  const game = String(c?.gameType ?? c?.game_type ?? "").trim().toLowerCase();
  const title = String(c?.title ?? "").trim().toLowerCase();
  return `${creator}|${game}|${title}`;
}

function collapseOpenChallengeTiers(openList: any[]): any[] {
  const groups = new Map<string, any[]>();
  for (const c of openList) {
    const k = openChallengeGroupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const out: any[] = [];
  for (const [, arr] of groups) {
    arr.sort((a, b) => pickEntryCents(a) - pickEntryCents(b));
    const primary = { ...arr[0] };
    if (arr.length > 1) {
      const tiers = arr.map((x) => formatUsdShort(pickEntryCents(x)));
      primary._feedTierSummary = `${arr.length} entry levels · ${tiers.join(" · ")}`;
    }
    out.push(primary);
  }
  return out;
}

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const challenges = useChallengeStore((s) => s.challenges ?? []);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<PostWithExtras[]>([]);

  const [composerText, setComposerText] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  const [posting, setPosting] = useState(false);
  const [postComposerOpen, setPostComposerOpen] = useState(false);
  const [gameStatsByKey, setGameStatsByKey] = useState<Map<string, GameFeedStats>>(() => new Map());
  const [spotsActivityLines, setSpotsActivityLines] = useState<string[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [pulseTab, setPulseTab] = useState<PulseTabKey>("feed");

  const didRunRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const { lat, lng } = await resolveForegroundLatLng();
        const lines = await fetchSpotsActivityNear(lat, lng, 50);
        if (!cancelled) setSpotsActivityLines(lines);
      } catch {
        /* location optional for arena feed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!myId) {
      setFriendIds([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ids = await getFriendIds(myId);
        if (!cancelled) setFriendIds(ids);
      } catch {
        if (!cancelled) setFriendIds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myId]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await fetchPublicFeed({
        limit: 50,
        includeChallengePosts: true,
      });
      const raw = data ?? [];
      setPosts(raw);

      if (myId) {
        syncEarnedBadgesToFeed(myId).catch(() => {});
      }

      if (data?.length && myId) {
        const ids = data.map((p) => p.id);
        const { counts, liked } = await getLikesForPosts(ids, myId);
        setPosts((prev) =>
          prev.map((p) => ({
            ...p,
            likeCount: counts[p.id] ?? 0,
            likedByMe: liked.has(p.id),
          }))
        );
      }
    } catch (err: any) {
      setErrorMsg(humanizeFetchError(err, "Could not load posts."));
    }
  }, [myId]);

  const loadChallenges = useCallback(async () => {
    try {
      if (myId) {
        await repairMyActiveChallenges(myId).catch(() => 0);
      }
      const [remote, stats] = await Promise.all([fetchRecentChallenges(), fetchFeedGameStats()]);
      useChallengeStore.setState({ challenges: remote });
      setGameStatsByKey(stats);
    } catch (err: any) {
      console.error("[Feed] loadChallenges error:", err);
      setErrorMsg(humanizeFetchError(err, "Could not load challenges."));
    }
  }, [myId]);

  const loadAll = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);
      try {
        await Promise.all([loadPosts(), loadChallenges()]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadPosts, loadChallenges]
  );

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
    (async () => {
      try {
        await expireOpenChallenges();
      } catch (e) {
        console.warn("[Feed] expireOpenChallenges:", e);
      }
      await loadAll(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadPosts(), loadChallenges()]);
    }, [loadPosts, loadChallenges])
  );

  const handleRefresh = () => loadAll(true);

  const handleAddMedia = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow access to your photos to add images or videos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.length) return;
      const added: PendingMedia[] = result.assets.map((a) => ({
        uri: a.uri,
        mediaType: a.type === "video" ? "video" : "image",
        width: a.width ?? undefined,
        height: a.height ?? undefined,
        durationMs: a.duration ?? undefined,
      }));
      setPendingMedia((prev) => [...prev, ...added].slice(0, 5));
    } catch (e: any) {
      Alert.alert("Couldn't open library", e?.message ?? "Please try again.");
    }
  }, []);

  const handleRemoveMedia = useCallback((index: number) => {
    setPendingMedia((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePost = useCallback(async () => {
    const body = composerText.trim();
    const hasMedia = pendingMedia.length > 0;
    if ((!body && !hasMedia) || !myId) return;
    setPosting(true);
    try {
      await createGlobalPost({
        user_id: myId,
        body: body || " ",
        visibility: "public",
        kind: "highlight",
        media: hasMedia ? pendingMedia : undefined,
      });
      setComposerText("");
      setPendingMedia([]);
      Keyboard.dismiss();
      await loadPosts();
      await loadChallenges();
      setPostComposerOpen(false);
    } catch (e: any) {
      Alert.alert("Couldn't post", e?.message ?? "Please try again.");
    } finally {
      setPosting(false);
    }
  }, [composerText, pendingMedia, myId, loadPosts, loadChallenges]);

  const canPost = (composerText.trim().length > 0 || pendingMedia.length > 0) && !!myId;

  const handleOpenChallenge = useCallback((id: string) => router.push(`/challenge/${id}`), [router]);

  const challengeMatchesQuery = useCallback(
    (c: any) => {
      const q = normalize(query);
      if (!q.length) return true;
      const hay = normalize(
        `${c.title} ${c.gameType} ${c.createdBy} ${c.players} ${c.status} ${c.entryFee}`
      );
      return hay.includes(q);
    },
    [query]
  );

  const postMatchesQuery = useCallback(
    (p: PostWithExtras) => {
      const q = normalize(query);
      if (!q.length) return true;
      const hay = normalize(
        `${p.body ?? ""} ${p.caption ?? ""} ${p.author?.username ?? ""} ${p.author?.display_name ?? ""}`
      );
      return hay.includes(q);
    },
    [query]
  );

  const counts = useMemo(() => {
    let open = 0,
      live = 0;
    for (const c of challenges) {
      if (c.status === "open") open += 1;
      else if (isLiveStatus(c.status)) live += 1;
    }
    return { open, live };
  }, [challenges]);

  const challengesForQuery = useMemo(
    () => challenges.filter(challengeMatchesQuery),
    [challenges, challengeMatchesQuery]
  );

  const feedItems = useMemo((): FeedItem[] => {
    const qc = challengesForQuery;
    const postList = posts.filter(postMatchesQuery).filter(isCompetitionPost);

    const liveList = qc
      .filter((c) => isLiveStatus(c.status))
      .sort((a, b) => challengeActivityTs(b) - challengeActivityTs(a));

    const openRaw = qc
      .filter((c) => c.status === "open")
      .sort((a, b) => challengeActivityTs(b) - challengeActivityTs(a));
    const openList = collapseOpenChallengeTiers(openRaw);

    const out: FeedItem[] = [];

    if (feedFilter === "live") {
      liveList.forEach((c) => out.push(challengeToFeedItem(c)));
      return out;
    }

    if (feedFilter === "open") {
      openList.forEach((c) => out.push(challengeToFeedItem(c)));
      return out;
    }

    type Sortable = { ts: number; item: FeedItem };
    const merged: Sortable[] = [
      ...qc.map((c) => ({ ts: challengeActivityTs(c), item: challengeToFeedItem(c) })),
      ...postList.map((p) => ({
        ts: postActivityTs(p),
        item: { type: "post" as const, data: p, presentation: "recent" as const },
      })),
    ];
    merged.sort((a, b) => b.ts - a.ts);
    merged.forEach((x) => out.push(x.item));

    return out;
  }, [posts, challengesForQuery, postMatchesQuery, feedFilter]);

  const hasFeedBody = useMemo(
    () => feedItems.some((i) => i.type === "challenge" || i.type === "post"),
    [feedItems]
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      if (item.type === "post") {
        if (item.presentation === "recent") {
          return (
            <View style={styles.itemWrap}>
              <PulseRecentActivityCard post={item.data} viewerId={myId} friendIds={friendIds} />
            </View>
          );
        }
        return (
          <View style={styles.itemWrap}>
            <PostCard
              post={item.data}
              onLikeSuccess={loadPosts}
              onCommentSuccess={loadPosts}
            />
          </View>
        );
      }
      if (item.presentation === "recent") {
        return (
          <View style={styles.itemWrap}>
            <PulseRecentActivityCard challenge={item.data} viewerId={myId} friendIds={friendIds} />
          </View>
        );
      }
      const gk = gameTypeKeyFromChallenge(item.data);
      const gameStats = gk ? gameStatsByKey.get(gk) : undefined;
      return (
        <View style={styles.itemWrap}>
          <ChallengeCard
            challenge={item.data}
            onPress={() => handleOpenChallenge(item.data.id)}
            showCta
            viewerId={myId}
            gameStats={gameStats}
          />
        </View>
      );
    },
    [loadPosts, handleOpenChallenge, myId, gameStatsByKey]
  );

  const keyExtractor = (item: FeedItem, index: number) => {
    if (item.type === "post") return `post-${item.data.id}`;
    if (item.type === "challenge") return `challenge-${item.data.id}`;
    return `item-${index}`;
  };

  const toggleFeedFilter = useCallback((next: Exclude<FeedFilter, "all">) => {
    lightTap();
    setFeedFilter((current) => (current === next ? "all" : next));
  }, []);

  const feedSearchPlaceholder = "Filter feed…";

  const openPostComposer = useCallback(() => {
    if (!myId) {
      router.push("/auth/login" as any);
      return;
    }
    setPostComposerOpen(true);
  }, [myId, router]);

  const PulseChrome = (
    <>
      <AppHeader
        feedSearch={
          pulseTab === "feed"
            ? {
                value: query,
                onChangeText: setQuery,
                placeholder: feedSearchPlaceholder,
              }
            : null
        }
      />

      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Ionicons name="pulse" size={22} color={colors.gold} style={{ marginRight: 6 }} />
            <Text style={styles.appTitle}>{PULSE_TAB_TITLE}</Text>
          </View>
          <Text style={styles.appSubtitle}>{PULSE_SUBTITLE}</Text>
        </View>
        <Pressable
          onPress={openPostComposer}
          accessibilityRole="button"
          accessibilityLabel="Share a highlight"
          style={({ pressed }) => [styles.composeIconBtn, pressSubtle(pressed)]}
        >
          <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <PulseTabBar tab={pulseTab} onChange={setPulseTab} />
    </>
  );

  const FeedListHeader = pulseTab === "feed" ? (
    <View style={styles.headerWrap}>
      <View style={styles.compactPulseRow}>
        <Pressable
          onPress={() => toggleFeedFilter("live")}
          accessibilityRole="button"
          accessibilityState={{ selected: feedFilter === "live" }}
          style={({ pressed }) => [
            styles.compactPulseChip,
            feedFilter === "live" && styles.compactPulseChipOn,
            pressed && styles.filterChipPressed,
          ]}
        >
          <Text style={[styles.compactPulseText, feedFilter === "live" && styles.compactPulseTextOn]}>
            🔥 {counts.live} Live
          </Text>
        </Pressable>
        <Pressable
          onPress={() => toggleFeedFilter("open")}
          accessibilityRole="button"
          accessibilityState={{ selected: feedFilter === "open" }}
          style={({ pressed }) => [
            styles.compactPulseChip,
            feedFilter === "open" && styles.compactPulseChipOn,
            pressed && styles.filterChipPressed,
          ]}
        >
          <Text style={[styles.compactPulseText, feedFilter === "open" && styles.compactPulseTextOn]}>
            ⚪ {counts.open} Open
          </Text>
        </Pressable>
      </View>

      {feedFilter !== "all" ? (
        <Text style={styles.filterHint}>
          {feedFilter === "live" ? "Live matches" : "Open challenges"} · tap again for all
        </Text>
      ) : null}

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      {!loading && !hasFeedBody ? (
        normalize(query).length ? (
          <Text style={styles.forYouHint}>
            Nothing matches your search — try another keyword or pull to refresh.
          </Text>
        ) : feedFilter === "live" ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={<Ionicons name="radio-button-on-outline" size={44} color={colors.textMuted} />}
              title="No active matches"
              subtitle="When competitions are in play, they'll show up here."
              actionLabel="Show all updates"
              onAction={() => setFeedFilter("all")}
            />
          </View>
        ) : feedFilter === "open" ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={<Ionicons name="add-circle-outline" size={44} color={colors.textMuted} />}
              title="No open challenges"
              subtitle="When someone posts a joinable challenge, it'll appear here."
              actionLabel="Show all updates"
              onAction={() => setFeedFilter("all")}
            />
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={<Ionicons name="pulse-outline" size={44} color={colors.textMuted} />}
              title="Nothing active yet"
              subtitle="When matches start, crowns change, or challenges open nearby, they'll flow here."
              actionLabel="Start match"
              onAction={() => router.push("/(tabs)/create" as any)}
            />
          </View>
        )
      ) : null}
    </View>
  ) : null;

  return (
    <ScreenCanvas variant="heat">
      {pulseTab !== "feed" ? (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl tintColor={colors.text} refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <View style={styles.headerWrap}>{PulseChrome}</View>
          {pulseTab === "people" ? <PulsePeopleTab /> : null}
          {pulseTab === "crews" ? <PulseCrewsTab /> : null}
          {pulseTab === "crowns" ? <PulseCrownsTab /> : null}
        </ScrollView>
      ) : loading && !hasFeedBody ? (
        <View style={styles.centerWrap}>
          <View style={styles.headerWrap}>{PulseChrome}</View>
          <SkeletonCard />
          <View style={{ height: space.md }} />
          <SkeletonChallengeCard />
          <Text style={styles.loadingText}>Loading the arena…</Text>
        </View>
      ) : (
        <FlatList
          data={feedItems}
          keyExtractor={keyExtractor}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              {PulseChrome}
              {FeedListHeader}
            </View>
          }
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              tintColor={colors.text}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        />
      )}

      <Modal
        visible={postComposerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPostComposerOpen(false)}
      >
        <View
          style={[styles.postModalWrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        >
          <View style={styles.postModalHeader}>
            <Pressable
              onPress={() => setPostComposerOpen(false)}
              style={({ pressed }) => [styles.postModalClose, pressSoft(pressed)]}
            >
              <Text style={styles.postModalCloseText}>Cancel</Text>
            </Pressable>
            <Text style={styles.postModalTitle}>Competition highlight</Text>
            <View style={{ width: 56 }} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.postModalBody}
          >
            <ComposerBlock
              composerText={composerText}
              setComposerText={setComposerText}
              pendingMedia={pendingMedia}
              onRemoveMedia={handleRemoveMedia}
              onAddMedia={handleAddMedia}
              onPost={handlePost}
              onChallenge={() => {
                setPostComposerOpen(false);
                router.push("/create");
              }}
              canPost={canPost}
              posting={posting}
              myId={myId}
            />
          </ScrollView>
        </View>
      </Modal>
    </ScreenCanvas>
  );
}

function ComposerBlock({
  composerText,
  setComposerText,
  pendingMedia,
  onRemoveMedia,
  onAddMedia,
  onPost,
  onChallenge,
  canPost,
  posting,
  myId,
}: {
  composerText: string;
  setComposerText: (t: string) => void;
  pendingMedia: PendingMedia[];
  onRemoveMedia: (i: number) => void;
  onAddMedia: () => void;
  onPost: () => void;
  onChallenge: () => void;
  canPost: boolean;
  posting: boolean;
  myId: string | null;
}) {
  return (
    <View style={styles.composer}>
      <TextInput
        value={composerText}
        onChangeText={setComposerText}
        placeholder="Share a highlight…"
        placeholderTextColor={colors.textTertiary}
        style={styles.composerInput}
        multiline
        maxLength={500}
        editable={!!myId}
      />
      {pendingMedia.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.mediaPreviewRow}
          contentContainerStyle={styles.mediaPreviewContent}
        >
          {pendingMedia.map((m, i) => (
            <View key={i} style={styles.mediaPreviewWrap}>
              {m.mediaType === "image" ? (
                <Image source={{ uri: m.uri }} style={styles.mediaPreview} contentFit="cover" />
              ) : (
                <View style={[styles.mediaPreview, styles.mediaPreviewVideo]}>
                  <Ionicons name="videocam" size={24} color="#9aa1c6" />
                </View>
              )}
              <Pressable
                onPress={() => onRemoveMedia(i)}
                style={styles.mediaPreviewRemove}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.composerActions}>
        <Pressable
          onPress={onAddMedia}
          style={({ pressed }) => [styles.composerBtnMedia, pressSoft(pressed)]}
        >
          <Ionicons name="images" size={18} color="#9aa1c6" />
          <Text style={styles.composerBtnMediaText}>Photo</Text>
        </Pressable>
        <Pressable
          onPress={onChallenge}
          style={({ pressed }) => [
            styles.composerBtn,
            styles.composerBtnChallenge,
            pressSoft(pressed),
          ]}
        >
          <Ionicons name="trophy" size={18} color="#fff" />
          <Text style={styles.composerBtnText}>Challenge</Text>
        </Pressable>
        <Pressable
          onPress={onPost}
          disabled={!canPost || posting}
          style={({ pressed }) => [
            styles.composerBtn,
            styles.composerBtnPost,
            (pressed || posting) && { opacity: 0.9 },
            (!canPost || posting) && styles.composerBtnDisabled,
          ]}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.composerBtnText}>Publish</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  listContent: { paddingBottom: space.xxl },
  separator: { height: 10 },
  itemWrap: { paddingHorizontal: space.lg },

  headerWrap: { paddingTop: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  forYouHint: {
    marginTop: space.sm,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    fontWeight: "600",
  },

  sectionHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 16,
  },

  trendingRow: { paddingHorizontal: space.lg, gap: 10, paddingBottom: 8 },
  trendingChipWrap: { alignItems: "stretch" },
  trendingChip: {
    width: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    padding: 12,
  },
  trendingTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trendingName: { color: colors.text, fontWeight: "900", fontSize: 13 },
  trendingMeta: { color: colors.textMuted, fontWeight: "700", fontSize: 11, marginTop: 1 },
  trendingIconPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.15)",
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  trendingPrize: { marginTop: 10, color: colors.gold, fontWeight: "900", fontSize: 12 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.md,
    marginBottom: space.md,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  composeIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  appTitle: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: 0.1 },
  appSubtitle: { marginTop: 2, fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  compactPulseRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: space.sm,
  },
  compactPulseChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  compactPulseChipOn: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  compactPulseText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  compactPulseTextOn: {
    color: colors.text,
  },
  filterChipPressed: { opacity: 0.88 },
  filterHint: {
    marginBottom: space.md,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
    fontWeight: "600",
  },

  composer: {
    marginTop: 0,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 14,
  },
  composerInput: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 40,
    paddingVertical: 4,
  },
  mediaPreviewRow: { marginTop: 10 },
  mediaPreviewContent: { gap: space.sm, paddingRight: space.sm },
  mediaPreviewWrap: { position: "relative" },
  mediaPreview: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.line },
  mediaPreviewVideo: { alignItems: "center", justifyContent: "center" },
  mediaPreviewRemove: { position: "absolute", top: -6, right: -6 },
  composerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: space.md,
  },
  composerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: 10,
  },
  composerBtnChallenge: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  composerBtnMedia: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: space.md,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  composerBtnMediaText: { color: colors.textTertiary, fontWeight: "700", fontSize: 14 },
  composerBtnPost: {
    flex: 1,
    backgroundColor: colors.accentCTA,
  },
  composerBtnDisabled: { opacity: 0.45 },
  composerBtnText: { color: colors.text, fontWeight: "800", fontSize: 14 },

  errorText: { color: colors.danger, marginTop: 10, fontSize: 13, fontWeight: "700" },

  emptyWrap: { marginTop: space.md, paddingHorizontal: space.sm },

  centerWrap: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
  },
  loadingText: {
    marginTop: space.md,
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  postModalWrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  postModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  postModalClose: { paddingVertical: 8, paddingHorizontal: 4 },
  postModalCloseText: { color: colors.accent, fontSize: 16, fontWeight: "700" },
  postModalTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  postModalBody: { padding: space.lg, paddingBottom: space.xxl },
});
