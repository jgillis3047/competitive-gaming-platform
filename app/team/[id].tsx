// app/team/[id].tsx — Crew profile v1
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Avatar from "../../lib/ui/Avatar";
import CrewTabBar, { type CrewTabKey } from "../../lib/ui/CrewTabBar";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { searchProfilesByUsername } from "../../lib/backend/profile";
import { fetchTeamKingBadges } from "../../lib/backend/kingLeaderboard";
import {
  acceptTeamInvite,
  cancelTeamInvite,
  createTeamInvite,
  declineTeamInvite,
  deleteTeam,
  getPendingInviteForUserAndTeam,
  getTeamById,
  getTeamChallenges,
  getTeamMembers,
  getTeamPostCount,
  getTeamPosts,
  leaveTeam,
  listPendingInvitesForTeam,
  type TeamChallengeRow,
  type TeamInviteWithExtras,
  type TeamWithExtras,
} from "../../lib/backend/teams";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { CREW_INVITE_ONLY_JOIN } from "../../lib/theme/crewCopy";
import { radius, space } from "../../lib/theme/spacing";
import EmptyState from "../../lib/ui/EmptyState";
import { pressSoft, pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";

export default function TeamProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const teamId = String(id ?? "");
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [team, setTeam] = useState<TeamWithExtras | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<TeamChallengeRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInviteWithExtras[]>([]);
  const [myPendingInvite, setMyPendingInvite] = useState<TeamInviteWithExtras | null>(null);
  const [kingBadges, setKingBadges] = useState<{ title: string; scope_key: string }[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [teamPosts, setTeamPosts] = useState<any[]>([]);
  const [tab, setTab] = useState<CrewTabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!teamId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [t, m, ch, pi, myPi, kb, pc, posts] = await Promise.all([
        getTeamById(teamId),
        getTeamMembers(teamId),
        getTeamChallenges(teamId),
        listPendingInvitesForTeam(teamId),
        myId ? getPendingInviteForUserAndTeam(myId, teamId) : Promise.resolve(null),
        fetchTeamKingBadges(teamId).catch(() => []),
        getTeamPostCount(teamId),
        getTeamPosts(teamId, 20),
      ]);
      setTeam(t ?? null);
      setMembers(m ?? []);
      setChallenges(ch ?? []);
      setPendingInvites(pi ?? []);
      setMyPendingInvite(myPi ?? null);
      setKingBadges(kb ?? []);
      setPostCount(pc);
      setTeamPosts(posts ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load crew.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, myId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLeave = async () => {
    if (!myId) return;
    Alert.alert("Leave crew?", "Are you sure?", [
      { text: "Cancel", style: "cancel" as const },
      {
        text: "Leave",
        style: "destructive" as const,
        onPress: () => {
          setBusy(true);
          leaveTeam({ teamId, userId: myId })
            .then(() => router.back())
            .catch((e: any) => Alert.alert("Leave failed", e?.message ?? "Could not leave."))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const handleDelete = async () => {
    if (!myId || !team || team.created_by !== myId) return;
    Alert.alert("Delete crew?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" as const },
      {
        text: "Delete",
        style: "destructive" as const,
        onPress: () => {
          setBusy(true);
          deleteTeam({ teamId, userId: myId })
            .then(() => router.back())
            .catch((e: any) => Alert.alert("Delete failed", e?.message ?? "Could not delete."))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const myMember = members.find((m) => m.user_id === myId);
  const isMember = !!myMember;
  const isOwner = team?.created_by === myId;
  const isOwnerOrAdmin = isOwner || myMember?.role === "admin";
  const creatorName = team?.creator?.display_name || team?.creator?.username || "Unknown";

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchProfilesByUsername(q, 15);
      setSearchResults(results.filter((p) => p.id !== myId));
    } finally {
      setSearching(false);
    }
  }, [searchQuery, myId]);

  const handleSendInvite = async (invitedUserId: string) => {
    if (!myId) return;
    try {
      setBusy(true);
      await createTeamInvite({ teamId, invitedUserId, invitedByUserId: myId });
      await load();
      setInviteModalVisible(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch (e: any) {
      Alert.alert("Invite failed", e?.message ?? "Could not send invite.");
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!myId || !myPendingInvite) return;
    try {
      setBusy(true);
      await acceptTeamInvite(myPendingInvite.id, myId);
      await load();
    } catch (e: any) {
      Alert.alert("Accept failed", e?.message ?? "Could not accept.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!myId || !myPendingInvite) return;
    try {
      setBusy(true);
      await declineTeamInvite(myPendingInvite.id, myId);
      await load();
    } catch (e: any) {
      Alert.alert("Decline failed", e?.message ?? "Could not decline.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (invite: TeamInviteWithExtras) => {
    if (!myId) return;
    try {
      setBusy(true);
      await cancelTeamInvite(invite.id, myId);
      await load();
    } catch (e: any) {
      Alert.alert("Cancel failed", e?.message ?? "Could not cancel invite.");
    } finally {
      setBusy(false);
    }
  };

  const completed = challenges.filter((c) => String(c.status).toLowerCase() === "completed");
  const active = challenges.filter((c) =>
    ["open", "accepted", "in-progress"].includes(String(c.status).toLowerCase())
  );
  const wins = completed.filter((c) => c.winner_team_id === teamId).length;
  const nextGame = active[0] ?? null;
  const handle = team?.slug ? `@${team.slug}` : null;

  if (loading && !team) {
    return (
      <ScreenCanvas>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </ScreenCanvas>
    );
  }

  if (!team) {
    return (
      <ScreenCanvas>
        <View style={styles.center}>
          <Text style={styles.errorText}>Crew not found</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        </View>
      </ScreenCanvas>
    );
  }

  const OverviewTab = (
    <View style={{ gap: 12 }}>
      {team.description ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>About</Text>
          <Text style={styles.panelBody}>{team.description}</Text>
        </View>
      ) : null}

      {nextGame ? (
        <Pressable
          onPress={() => router.push(`/challenge/${nextGame.id}` as any)}
          style={({ pressed }) => [styles.nextGameBtn, pressSoft(pressed)]}
        >
          <Ionicons name="game-controller-outline" size={18} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={styles.nextGameText} numberOfLines={1}>
            Next: {nextGame.title || "Challenge"} • {(nextGame.game_type ?? "game").replace(/_/g, " ")}
          </Text>
        </Pressable>
      ) : null}

      {kingBadges.length > 0 ? (
        <View style={[styles.panel, styles.crownPanel]}>
          <View style={styles.panelHeaderRow}>
            <Ionicons name="ribbon" size={18} color={colors.gold} />
            <Text style={styles.panelTitle}>Crew crowns</Text>
          </View>
          {kingBadges.slice(0, 3).map((b) => (
            <View key={b.scope_key} style={styles.crownRow}>
              <Text style={styles.crownEmoji}>👑</Text>
              <Text style={styles.crownText} numberOfLines={2}>{b.title}</Text>
            </View>
          ))}
          {kingBadges.length > 3 ? (
            <Pressable onPress={() => setTab("crowns")} style={({ pressed }) => [pressSubtle(pressed)]}>
              <Text style={styles.seeMore}>See all {kingBadges.length} crowns</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {completed.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent matches</Text>
          {completed.slice(0, 5).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/challenge/${c.id}` as any)}
              style={({ pressed }) => [styles.matchRow, pressSoft(pressed)]}
            >
              <Text style={styles.matchTitle} numberOfLines={1}>{c.title || "Challenge"}</Text>
              <Text style={styles.matchMeta}>
                {(c.game_type ?? "game").replace(/_/g, " ")} • {c.winner_team_id === teamId ? "W" : "L"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          icon={<Ionicons name="trophy-outline" size={28} color={colors.textMuted} />}
          title="No matches yet"
          subtitle="Create a crew challenge to start competing together."
        />
      )}

      {isOwnerOrAdmin && pendingInvites.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Pending invites</Text>
          {pendingInvites.map((inv) => {
            const u = (inv.invited_user ?? {}) as { display_name?: string | null; username?: string | null };
            const name = u.display_name || u.username || "Unknown";
            return (
              <View key={inv.id} style={styles.matchRow}>
                <Text style={styles.matchTitle} numberOfLines={1}>{name}</Text>
                <Pressable
                  onPress={() => handleCancelInvite(inv)}
                  disabled={busy}
                  style={({ pressed }) => [styles.cancelInviteBtn, pressSoftIcon(pressed)]}
                >
                  <Text style={styles.cancelInviteText}>Cancel</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  const MembersTab = (
    <View style={{ gap: 8 }}>
      {members.map((item) => {
        const user = item.user ?? {};
        const name = user.display_name || user.username || "Unknown";
        return (
          <Pressable
            key={item.id}
            onPress={() => user.id && router.push(`/user/${user.id}` as any)}
            style={({ pressed }) => [styles.memberRow, pressSoft(pressed)]}
          >
            <Avatar imageUrl={user.avatar_url} name={name} size={40} />
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{name}</Text>
              <Text style={styles.memberRole}>{item.role}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );

  const PostsTab =
    teamPosts.length > 0 ? (
      <View style={{ gap: 8 }}>
        {teamPosts.map((p) => {
          const author = p.author ?? {};
          const authorName = author.display_name || author.username || "Member";
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/post/${p.id}` as any)}
              style={({ pressed }) => [styles.postRow, pressSoft(pressed)]}
            >
              <Avatar imageUrl={author.avatar_url} name={authorName} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.postAuthor} numberOfLines={1}>{authorName}</Text>
                <Text style={styles.postBody} numberOfLines={2}>{p.body || p.caption || "Post"}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    ) : (
      <EmptyState
        icon={<Ionicons name="images-outline" size={28} color={colors.textMuted} />}
        title="No posts yet"
        subtitle="When crew members share highlights, they'll show up here."
      />
    );

  const CrownsTab =
    kingBadges.length > 0 ? (
      <View style={[styles.panel, styles.crownPanel]}>
        {kingBadges.map((b) => (
          <View key={b.scope_key} style={styles.crownRow}>
            <Text style={styles.crownEmoji}>👑</Text>
            <Text style={styles.crownText} numberOfLines={2}>{b.title}</Text>
          </View>
        ))}
      </View>
    ) : (
      <EmptyState
        icon={<Ionicons name="ribbon-outline" size={28} color={colors.gold} />}
        title="No crowns yet"
        subtitle="Claim court and city titles as a crew to earn crowns."
      />
    );

  return (
    <ScreenCanvas variant="gold">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backIcon, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>Crew</Text>
          <Text style={styles.appSubtitle}>Group identity — crowns, members & highlights</Text>
        </View>
        <Pressable onPress={() => load(true)} style={({ pressed }) => [styles.refreshBtn, pressSoftIcon(pressed)]}>
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={22} color={colors.text} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={colors.accent} refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.cover}>
          <View style={styles.heroCenter}>
            <View style={styles.avatarRing}>
              <Avatar imageUrl={team.avatar_url} name={team.name} size={88} />
            </View>
            <Text style={styles.teamName}>{team.name}</Text>
            {handle ? <Text style={styles.handle}>{handle}</Text> : null}
            <Text style={styles.meta}>Created by {creatorName}</Text>
          </View>

          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statBarValue}>{members.length}</Text>
              <Text style={styles.statBarLabel}>Members</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statBarValue}>{wins}</Text>
              <Text style={styles.statBarLabel}>Wins</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statBarValue}>{kingBadges.length}</Text>
              <Text style={styles.statBarLabel}>Crowns</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statBarValue}>{postCount}</Text>
              <Text style={styles.statBarLabel}>Posts</Text>
            </View>
          </View>

          {isMember ? (
            <View style={styles.heroButtons}>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/create", params: { creator_team_id: teamId } } as any)}
                style={({ pressed }) => [styles.heroBtnPrimary, pressSoft(pressed)]}
              >
                <Text style={styles.heroBtnPrimaryText}>Challenge</Text>
              </Pressable>
              {isOwnerOrAdmin ? (
                <Pressable
                  onPress={() => setInviteModalVisible(true)}
                  style={({ pressed }) => [styles.heroBtn, pressSoft(pressed)]}
                >
                  <Text style={styles.heroBtnText}>Invite</Text>
                </Pressable>
              ) : null}
              {!isOwner ? (
                <Pressable
                  onPress={handleLeave}
                  disabled={busy}
                  style={({ pressed }) => [styles.heroBtn, pressSoft(pressed), busy && styles.disabled]}
                >
                  <Text style={styles.heroBtnText}>Leave</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleDelete}
                  disabled={busy}
                  style={({ pressed }) => [styles.heroBtnDanger, pressSoft(pressed), busy && styles.disabled]}
                >
                  <Text style={styles.heroBtnDangerText}>Delete</Text>
                </Pressable>
              )}
            </View>
          ) : isOwnerOrAdmin ? (
            <Pressable
              onPress={() => setInviteModalVisible(true)}
              style={({ pressed }) => [styles.heroBtnPrimary, styles.heroBtnSolo, pressSoft(pressed)]}
            >
              <Text style={styles.heroBtnPrimaryText}>Invite players</Text>
            </Pressable>
          ) : myPendingInvite ? (
            <View style={styles.inviteActionsRow}>
              <Pressable onPress={handleAcceptInvite} disabled={busy} style={[styles.primaryBtn, styles.flex1, busy && styles.disabled]}>
                <Text style={styles.primaryBtnText}>{busy ? "…" : "Accept invite"}</Text>
              </Pressable>
              <Pressable onPress={handleDeclineInvite} disabled={busy} style={[styles.secondaryBtn, styles.flex1, busy && styles.disabled]}>
                <Text style={styles.secondaryBtnText}>Decline</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.inviteOnlyBox}>
              <Text style={styles.inviteOnlyText}>{CREW_INVITE_ONLY_JOIN}</Text>
            </View>
          )}
        </View>

        <CrewTabBar tab={tab} onChange={setTab} />

        <View style={styles.tabContent}>
          {tab === "overview" ? OverviewTab : null}
          {tab === "members" ? MembersTab : null}
          {tab === "posts" ? PostsTab : null}
          {tab === "crowns" ? CrownsTab : null}
        </View>
      </ScrollView>

      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite to crew</Text>
              <Pressable
                onPress={() => {
                  setInviteModalVisible(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                style={styles.modalClose}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by username..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
            />
            <Pressable onPress={handleSearch} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
            {searching ? (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 16 }} />
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                style={styles.searchList}
                renderItem={({ item }) => {
                  const name = item.display_name || item.username || "Unknown";
                  const alreadyInvited = pendingInvites.some((pi) => pi.invited_user_id === item.id);
                  return (
                    <View style={styles.searchRow}>
                      <Avatar imageUrl={item.avatar_url} name={name} size={36} />
                      <Text style={styles.searchRowName} numberOfLines={1}>{name}</Text>
                      {item.username ? <Text style={styles.searchRowUsername}>@{item.username}</Text> : null}
                      <Pressable
                        onPress={() => !alreadyInvited && handleSendInvite(item.id)}
                        disabled={busy || alreadyInvited}
                        style={[styles.inviteRowBtn, (busy || alreadyInvited) && styles.disabled]}
                      >
                        <Text style={styles.inviteRowBtnText}>{alreadyInvited ? "Invited" : "Invite"}</Text>
                      </Pressable>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: 56,
    paddingBottom: space.md,
  },
  backIcon: { marginRight: space.md },
  appTitle: { fontSize: 22, fontWeight: "900", color: colors.text },
  appSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  refreshBtn: { padding: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  loadingText: { marginTop: 12, color: colors.textMuted },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  backBtn: { marginTop: 16, padding: 12, borderRadius: radius.md, backgroundColor: colors.accent },
  backBtnText: { color: colors.text, fontWeight: "700" },
  cover: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroCenter: { alignItems: "center" },
  avatarRing: {
    padding: 3,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: colors.accent,
    marginBottom: 12,
  },
  teamName: { fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center" },
  handle: { marginTop: 4, color: colors.accentMuted, fontSize: 14, fontWeight: "700" },
  meta: { marginTop: 6, color: colors.textMuted, fontSize: 13 },
  statsBar: {
    flexDirection: "row",
    marginTop: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statItem: { flex: 1, alignItems: "center" },
  statBarValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  statBarLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  heroButtons: { flexDirection: "row", gap: 8, marginTop: 16 },
  heroBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBtnText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  heroBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  heroBtnPrimaryText: { color: colors.text, fontWeight: "900", fontSize: 14 },
  heroBtnSolo: { marginTop: 16 },
  heroBtnDanger: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(239,68,68,0.15)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
  },
  heroBtnDangerText: { color: "#ef4444", fontWeight: "800", fontSize: 14 },
  inviteActionsRow: { flexDirection: "row", gap: 12, marginTop: 16 },
  flex1: { flex: 1 },
  inviteOnlyBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inviteOnlyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  primaryBtn: { padding: 14, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center" },
  primaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 15 },
  secondaryBtn: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: "center" },
  secondaryBtnText: { color: colors.text, fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
  tabContent: { paddingHorizontal: space.lg },
  panel: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  crownPanel: {
    borderColor: colors.goldBorderSoft,
    backgroundColor: colors.goldSurfaceFaint,
  },
  panelHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  panelBody: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  crownRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  crownEmoji: { fontSize: 18 },
  crownText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
  seeMore: { color: colors.accentMuted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  nextGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  nextGameText: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  matchRow: {
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  matchTitle: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  matchMeta: { color: colors.textMuted, fontSize: 13 },
  cancelInviteBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  cancelInviteText: { color: colors.heat, fontSize: 14, fontWeight: "700" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberInfo: { marginLeft: 14, flex: 1 },
  memberName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  memberRole: { marginTop: 2, color: colors.textMuted, fontSize: 13, textTransform: "capitalize" },
  postRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postAuthor: { color: colors.text, fontSize: 14, fontWeight: "800" },
  postBody: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  modalClose: { padding: 4 },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBtn: { padding: 12, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center", marginBottom: 16 },
  searchBtnText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  searchList: { maxHeight: 280 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchRowName: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1, marginLeft: 12 },
  searchRowUsername: { color: colors.textMuted, fontSize: 13, marginRight: 8 },
  inviteRowBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, backgroundColor: colors.accent },
  inviteRowBtnText: { color: colors.text, fontWeight: "700", fontSize: 13 },
});
