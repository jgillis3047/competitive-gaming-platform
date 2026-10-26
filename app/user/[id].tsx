// app/user/[id].tsx - Public user profile (viewer-facing, matches own profile layout)
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

import ChallengeCard from "../components/ChallengeCard";
import PulseRecentActivityCard from "../components/PulseRecentActivityCard";
import Avatar from "../../lib/ui/Avatar";
import RatingHero from "../../lib/ui/RatingHero";
import ProfileTabBar, { type ProfileTabKey } from "../../lib/ui/ProfileTabBar";
import { getPublicProfileData, type PublicProfileData } from "../../lib/backend/profile";
import { getOrCreateThreadByUsers } from "../../lib/backend/threadActions";
import { getRatingStandings, getUserGameRatings, type UserGameRating } from "../../lib/backend/ratings";
import { addFriend, removeFriend, getFriendshipStatus, type FriendshipStatus } from "../../lib/backend/friends";
import { blockUser, unblockUser } from "../../lib/backend/blockedUsers";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getBadgeDefinition, type BadgeDefinition } from "../../lib/data/badgeDefinitions";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";
import EmptyState from "../../lib/ui/EmptyState";
import { getRankLabel, getRankTier } from "../../lib/utils/eloRating";

type ProfileTab = ProfileTabKey;

export default function PublicUserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id ?? "");
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const isMe = myId === userId;

  const [data, setData] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [followBusy, setFollowBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [friendship, setFriendship] = useState<FriendshipStatus>({
    iRequestedThem: false,
    theyRequestedMe: false,
    areFriends: false,
  });
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [ratingStandings, setRatingStandings] = useState<{ globalRank: number | null; globalTotal: number | null }>({
    globalRank: null,
    globalTotal: null,
  });
  const [gameRatings, setGameRatings] = useState<UserGameRating[]>([]);
  const [messageBusy, setMessageBusy] = useState(false);

  const openMessageThread = useCallback(async () => {
    if (!myId || !userId || isMe) return;
    setMessageBusy(true);
    try {
      const threadId = await getOrCreateThreadByUsers(myId, userId);
      router.push(`/matches/thread/${threadId}` as any);
    } catch (e: any) {
      Alert.alert("Message", e?.message ?? "Could not open conversation.");
    } finally {
      setMessageBusy(false);
    }
  }, [myId, userId, isMe, router]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const d = await getPublicProfileData(userId, myId);
      setData(d);
      const profileRating =
        typeof d?.profile?.rating === "number" ? d.profile.rating : d?.stats?.rating ?? 1000;
      try {
        const [standings, perGame] = await Promise.all([
          getRatingStandings(userId, profileRating),
          getUserGameRatings(userId),
        ]);
        setRatingStandings(standings);
        setGameRatings(perGame);
      } catch {
        setRatingStandings({ globalRank: null, globalTotal: null });
        setGameRatings([]);
      }
      try {
        const { data: postsData } = await supabase
          .from("posts")
          .select("id, body, caption, post_media(*)")
          .eq("user_id", userId)
          .is("parent_post_id", null)
          .order("created_at", { ascending: false })
          .limit(24);
        setUserPosts(postsData ?? []);
      } catch {
        setUserPosts([]);
      }
      if (myId && myId !== userId) {
        const fs = await getFriendshipStatus(myId, userId);
        setFriendship(fs);
      }
    } catch (e: any) {
      setLoadError(e?.message ?? "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, [userId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data?.profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if ((!data || !data.profile) && !loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{loadError ?? "User not found"}</Text>
        <Pressable onPress={() => load()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>{loadError ? "Try again" : "Back"}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { marginTop: 12 }]}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (data!.blockStatus.theyBlockedMe) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtnTop, pressSoftIcon(pressed)]}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.appTitle}>Profile</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>You can&apos;t view this profile</Text>
          <Text style={styles.loadingText}>You have been blocked by this user.</Text>
        </View>
      </View>
    );
  }

  const d = data!;
  const profile = d.profile!;
  const { stats, record, perGameStats, badges, challenges, teams, leagues, friendCounts, blockStatus } = d;
  const displayName = profile.display_name || profile.username || "Player";
  const username = profile.username ? `@${profile.username}` : "";
  const rating = typeof profile.rating === "number" ? profile.rating : (stats?.rating ?? 1000);
  const recentChallenges = challenges.slice(0, 10);

  const handleFollowPress = async () => {
    if (isMe || followBusy || !myId) return;
    setFollowBusy(true);
    try {
      if (friendship.iRequestedThem) await removeFriend(userId);
      else await addFriend(userId);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong.");
    } finally {
      setFollowBusy(false);
    }
  };

  const getFriendButtonText = () => {
    if (followBusy) return "…";
    if (friendship.areFriends) return "Friends";
    if (friendship.iRequestedThem) return "Pending";
    if (friendship.theyRequestedMe) return "Add Back";
    return "Add Friend";
  };

  const handleBlockPress = async () => {
    if (isMe || blockBusy || !myId) return;
    setBlockBusy(true);
    try {
      if (blockStatus.iBlockedThem) await unblockUser(userId);
      else await blockUser(userId);
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong.");
    } finally {
      setBlockBusy(false);
    }
  };

  const TopBar = (
    <View style={styles.topBar}>
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtnTop, pressSoftIcon(pressed)]}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.appTitle}>{displayName}</Text>
        <Text style={styles.appSubtitle}>Profile</Text>
      </View>
      <Pressable onPress={() => load()} style={({ pressed }) => [styles.refreshBtn, pressSoftIcon(pressed)]}>
        {loading ? (
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
        <View style={styles.avatarRing}>
          <Avatar imageUrl={profile.avatar_url} name={displayName} size={88} />
        </View>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        <Text style={styles.username} numberOfLines={1}>{username}</Text>
        <RatingHero
          rating={rating}
          globalRank={ratingStandings.globalRank}
          globalTotal={ratingStandings.globalTotal}
        />
      </View>

      <View style={styles.statsBar}>
        <Pressable
          disabled={!myId}
          onPress={() => myId && router.push(`/friends/${userId}` as any)}
          style={({ pressed }) => [styles.statItem, pressSubtle(pressed), !myId && { opacity: 0.5 }]}
        >
          <Text style={styles.statBarValue}>{friendCounts?.friends ?? 0}</Text>
          <Text style={styles.statBarLabel}>
            {(friendCounts?.friends ?? 0) === 0 ? "Invite friends" : "Friends"}
          </Text>
        </Pressable>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statBarValue}>{badges.length}</Text>
          <Text style={styles.statBarLabel}>Badges</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statBarValue}>{stats?.postCount ?? userPosts.length}</Text>
          <Text style={styles.statBarLabel}>Posts</Text>
        </View>
      </View>

      <View style={styles.heroButtons}>
        {isMe ? (
          <Pressable
            onPress={() => router.replace("/profile")}
            style={({ pressed }) => [styles.heroBtnPrimary, pressSoft(pressed)]}
          >
            <Text style={styles.heroBtnPrimaryText}>My profile</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={handleFollowPress}
              disabled={followBusy}
              style={({ pressed }) => [
                friendship.areFriends ? styles.heroBtn : styles.heroBtnPrimary,
                (pressed || followBusy) && { opacity: 0.9 },
              ]}
            >
              <Text style={friendship.areFriends ? styles.heroBtnText : styles.heroBtnPrimaryText}>
                {getFriendButtonText()}
              </Text>
            </Pressable>
            <Pressable
              onPress={openMessageThread}
              disabled={messageBusy}
              style={({ pressed }) => [styles.messageBtn, (pressed || messageBusy) && { opacity: 0.9 }]}
            >
              <Ionicons name="chatbubble" size={16} color="#fff" />
              <Text style={styles.messageBtnText}>{messageBusy ? "…" : "Message"}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/(tabs)/create", params: { inviteUserId: userId } } as any)}
              style={({ pressed }) => [styles.challengeBtn, pressSoft(pressed)]}
            >
              <Ionicons name="game-controller" size={16} color="#fff" />
              <Text style={styles.challengeBtnText}>Challenge</Text>
            </Pressable>
            <Pressable
              onPress={handleBlockPress}
              disabled={blockBusy}
              style={({ pressed }) => [styles.blockBtn, (pressed || blockBusy) && { opacity: 0.9 }]}
            >
              <Text style={styles.blockBtnText}>
                {blockBusy ? "…" : blockStatus.iBlockedThem ? "Unblock" : "Block"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );

  const Tabs = <ProfileTabBar tab={tab} onChange={setTab} />;

  const Overview = (
    <View style={{ gap: 12 }}>
      <View style={styles.cardsRow}>
        <StatCard
          label="Record"
          value={`${record.wins}-${record.losses}`}
          hint={`${record.ties} ties`}
        />
        <StatCard
          label="Win Rate"
          value={`${record.winRate}%`}
          hint={`${record.totalPlayed} played`}
        />
        <StatCard label="Streak" value={`${record.streak}`} hint="wins in a row" />
      </View>

      {teams.length > 0 ? (
        <View style={styles.flatSection}>
          <Text style={styles.flatSectionTitle}>Member of</Text>
          <View style={styles.crewChipRow}>
            {teams.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push(`/team/${t.id}` as any)}
                style={({ pressed }) => [styles.crewChip, pressSoft(pressed)]}
              >
                <Avatar imageUrl={t.avatar_url} name={t.name} size={28} />
                <Text style={styles.crewChipText} numberOfLines={1}>{t.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {leagues.length > 0 ? (
        <View style={styles.flatSection}>
          <Text style={styles.flatSectionTitle}>Leagues</Text>
          <View style={{ gap: 4 }}>
            {leagues.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => router.push(`/league/${l.id}` as any)}
                style={({ pressed }) => [styles.flatLinkRow, pressSoft(pressed)]}
              >
                <Text style={styles.flatLinkText}>{l.name}</Text>
                <Text style={styles.linkRowMeta}>{l.member_count ?? 0} members ›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.flatSection}>
        <Text style={styles.flatSectionTitle}>Badges</Text>
        {badges.length > 0 ? (
          <View style={styles.badgesGrid}>
            {badges.map((b) => {
              const def = getBadgeDefinition(b.key);
              if (!def) return null;
              return (
                <Pressable
                  key={b.key}
                  onPress={() => setSelectedBadge(def)}
                  style={({ pressed }) => [styles.badgeTile, pressSoftIcon(pressed)]}
                >
                  <View style={[styles.badgeTileRing, { borderColor: def.color }]}>
                    <View style={[styles.badgeTileIconBg, { backgroundColor: `${def.color}30` }]}>
                      <Ionicons name={def.icon as any} size={18} color={def.color} />
                    </View>
                  </View>
                  <Text style={[styles.badgeTileLabel, { color: def.color }]} numberOfLines={1}>
                    {b.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.badgeHint}>No badges earned yet</Text>
        )}
      </View>

      {perGameStats.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>By Game</Text>
          {perGameStats.map((g) => (
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

      {recentChallenges.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="trophy-outline" size={40} color={colors.textMuted} />}
          title="No activity yet"
          subtitle="When they play matches, results will show up here."
        />
      ) : (
        <View style={{ gap: 8 }}>
          {recentChallenges.map((ch: any) =>
            String(ch.status).toLowerCase() === "completed" ? (
              <PulseRecentActivityCard key={String(ch.id)} challenge={ch} viewerId={myId} />
            ) : (
              <ChallengeCard
                key={String(ch.id)}
                challenge={ch}
                onPress={() => router.push({ pathname: "/challenge/[id]", params: { id: String(ch.id) } } as any)}
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
      {challenges.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="pulse-outline" size={40} color={colors.textMuted} />}
          title="Nothing here yet"
          subtitle="Challenges will appear here when they play."
        />
      ) : (
        <View style={{ gap: 8 }}>
          {challenges.slice(0, 25).map((ch: any) =>
            String(ch.status).toLowerCase() === "completed" ? (
              <PulseRecentActivityCard key={String(ch.id)} challenge={ch} viewerId={myId} />
            ) : (
              <ChallengeCard
                key={String(ch.id)}
                challenge={ch}
                onPress={() => router.push({ pathname: "/challenge/[id]", params: { id: String(ch.id) } } as any)}
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
          ELO-based — upsets against higher-rated players earn the biggest gains.
        </Text>
        <View style={styles.statGrid}>
          <MiniStat label="Rating" value={`${rating}`} />
          <MiniStat label="Rank" value={getRankLabel(rating)} />
          {ratingStandings.globalRank != null ? (
            <MiniStat label="Worldwide" value={`#${ratingStandings.globalRank.toLocaleString()}`} />
          ) : null}
          <MiniStat label="Wins" value={`${record.wins}`} />
          <MiniStat label="Losses" value={`${record.losses}`} />
          <MiniStat label="Win Rate" value={`${record.winRate}%`} />
        </View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Per-game ratings</Text>
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
        ) : perGameStats.length > 0 ? (
          perGameStats.map((g) => (
            <View key={g.game} style={styles.gameStatRow}>
              <Text style={styles.gameStatLabel}>{g.game}</Text>
              <Text style={styles.gameStatValue}>
                {g.wins}W – {g.losses}L{g.ties > 0 ? ` – ${g.ties}T` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.badgeHint}>No rated games yet.</Text>
        )}
      </View>
    </View>
  );

  const Posts = (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Media</Text>
        <Text style={styles.sectionHint}>{stats?.postCount ?? userPosts.length} posts</Text>
      </View>

      {userPosts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No posts yet</Text>
          <Text style={styles.emptySub}>Once they publish posts, media will show up here.</Text>
        </View>
      ) : (
        <View style={styles.postsMosaic}>
          {(() => {
            const featured = userPosts[0];
            const secondary = userPosts.slice(1, 5);
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
          <Pressable onPress={() => setSelectedBadge(null)} style={styles.closeModalBtn}>
            <Text style={styles.closeModalBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  ) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} contentInsetAdjustmentBehavior="always">
      {TopBar}
      {Cover}
      {Tabs}
      {tab === "overview" ? Overview : null}
      {tab === "posts" ? Posts : null}
      {tab === "activity" ? Activity : null}
      {tab === "stats" ? Stats : null}
      <View style={{ height: 28 }} />
      {BadgeModal}
    </ScrollView>
  );
}

function TabChip({
  label,
  selected,
  onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabChip,
        selected && styles.tabChipSelected,
        pressSoft(pressed),
      ]}
    >
      <Text style={[styles.tabChipText, selected && styles.tabChipTextSelected]}>{label}</Text>
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
  scrollContent: { paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  loadingText: { marginTop: 12, color: colors.textMuted },
  errorText: { color: colors.danger, fontSize: 16, textAlign: "center" },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.accent },
  retryBtnText: { color: colors.text, fontWeight: "700" },
  backBtn: { marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: colors.accent },
  backBtnText: { color: colors.text, fontWeight: "700" },

  topBar: {
    paddingTop: 18,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtnTop: { marginRight: 12 },
  appTitle: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: 0.1 },
  appSubtitle: { marginTop: 2, fontSize: 13, color: colors.textTertiary },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
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
    marginBottom: 12,
  },
  heroCenter: { alignItems: "center", marginBottom: 14 },
  avatarRing: {
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
  heroButtons: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  heroBtnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  heroBtnPrimaryText: { color: colors.text, fontWeight: "900", fontSize: 13 },
  followBtnDisabled: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accentSurface,
    opacity: 0.9,
  },
  followBtnText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  heroBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heroBtnText: { color: colors.textSecondary, fontWeight: "800", fontSize: 13 },
  blockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  blockBtnText: { color: colors.danger, fontWeight: "800", fontSize: 13 },
  tabsRow: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabChipSelected: { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder },
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
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  linkRowText: { flex: 1, color: colors.text, fontWeight: "800", fontSize: 14 },
  linkRowMeta: { color: colors.textMuted, fontSize: 12 },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  badgeTile: { width: 72, alignItems: "center" },
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
  flatSection: { marginTop: 4, gap: 8 },
  flatSectionTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  flatLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  flatLinkText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
  crewChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  crewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  crewChipText: { color: colors.text, fontWeight: "800", fontSize: 13, flexShrink: 1 },
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
  gameStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  gameStatLabel: { color: colors.text, fontWeight: "800", fontSize: 14 },
  gameStatValue: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
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
  postsMosaic: { gap: 8 },
  postsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  postThumbnailImage: { width: "100%", height: "100%", resizeMode: "cover" },
  postThumbnailText: { flex: 1, padding: 8, justifyContent: "center" },
  postThumbnailBody: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

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
    backgroundColor: "#0c1022",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2747",
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
  closeModalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  closeModalBtnText: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    fontSize: 14,
  },
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.35)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.55)",
  },
  messageBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  challengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#10b981",
  },
  challengeBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
});
