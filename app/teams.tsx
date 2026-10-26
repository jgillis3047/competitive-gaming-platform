// app/teams.tsx - Crews & Leagues (opened from Profile)
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { listRecentLeagues, listLeaguesForUser } from "../lib/backend/leagues";
import type { LeagueWithExtras } from "../lib/backend/leagues";
import {
  listPendingInvitesForUser,
  listRecentTeams,
  listTeamsForUser,
  acceptTeamInvite,
  declineTeamInvite,
} from "../lib/backend/teams";
import type { TeamWithExtras, TeamInviteWithExtras } from "../lib/backend/teams";
import { useAuthStore } from "../lib/data/authStore";
import { CREWS_AND_LEAGUES, CREATE_CREW } from "../lib/theme/crewCopy";

import { pressSoft, pressSoftIcon } from "../lib/ui/pressableStyles";

type Tab = "crews" | "leagues";

export default function TeamsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width <= 360;
  const myId = useAuthStore((s) => s.user?.id ?? null);

  const [tab, setTab] = useState<Tab>("crews");
  const [teams, setTeams] = useState<TeamWithExtras[]>([]);
  const [leagues, setLeagues] = useState<LeagueWithExtras[]>([]);
  const [invites, setInvites] = useState<TeamInviteWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      if (myId) {
        const [myTeams, myLeagues, myInvites] = await Promise.all([
          listTeamsForUser(myId),
          listLeaguesForUser(myId),
          listPendingInvitesForUser(myId),
        ]);
        setTeams(myTeams);
        setLeagues(myLeagues);
        setInvites(myInvites);
      } else {
        const [recTeams, recLeagues] = await Promise.all([
          listRecentTeams(20),
          listRecentLeagues(20),
        ]);
        setTeams(recTeams);
        setLeagues(recLeagues);
        setInvites([]);
      }
    } catch (e: any) {
      console.warn("[Teams] load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [myId]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = (t: TeamWithExtras | LeagueWithExtras) =>
    t.creator?.display_name || t.creator?.username || "Unknown";

  const handleAcceptInvite = async (invite: TeamInviteWithExtras) => {
    if (!myId) return;
    setBusyInviteId(invite.id);
    try {
      await acceptTeamInvite(invite.id, myId);
      await load(true);
    } catch (e: any) {
      Alert.alert("Accept failed", e?.message ?? "Could not accept.");
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDeclineInvite = async (invite: TeamInviteWithExtras) => {
    if (!myId) return;
    setBusyInviteId(invite.id);
    try {
      await declineTeamInvite(invite.id, myId);
      await load(true);
    } catch (e: any) {
      Alert.alert("Decline failed", e?.message ?? "Could not decline.");
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, compact && { paddingTop: 50, paddingBottom: 12 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, compact && { fontSize: 20 }]}>{CREWS_AND_LEAGUES}</Text>
          <Text style={[styles.subtitle, compact && { fontSize: 12 }]}>Create a crew or league — crews are invite-only</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setTab("crews")}
          style={[styles.tab, tab === "crews" && styles.tabActive]}
        >
          <Ionicons name="people" size={18} color={tab === "crews" ? "#fff" : "rgba(255,255,255,0.6)"} />
          <Text style={[styles.tabText, compact && { fontSize: 13 }, tab === "crews" && styles.tabTextActive]}>Crews</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("leagues")}
          style={[styles.tab, tab === "leagues" && styles.tabActive]}
        >
          <Ionicons name="trophy" size={18} color={tab === "leagues" ? "#fff" : "rgba(255,255,255,0.6)"} />
          <Text style={[styles.tabText, compact && { fontSize: 13 }, tab === "leagues" && styles.tabTextActive]}>Leagues</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push("/team/create" as any)}
          style={({ pressed }) => [styles.createBtn, pressSoft(pressed)]}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={[styles.createBtnText, compact && { fontSize: 12 }]}>{CREATE_CREW}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/league/create" as any)}
          style={({ pressed }) => [styles.createBtn, pressSoft(pressed)]}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={[styles.createBtnText, compact && { fontSize: 12 }]}>Create League</Text>
        </Pressable>
      </View>

      {loading && teams.length === 0 && leagues.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : (
        <FlatList<(TeamWithExtras | LeagueWithExtras)>
          data={tab === "crews" ? teams : leagues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={() => load(true)} />
          }
          ListHeaderComponent={
            tab === "crews" && invites.length > 0 ? (
              <View style={styles.invitesSection}>
                <Text style={styles.invitesSectionTitle}>Crew invites</Text>
                {invites.map((inv) => {
                  const teamName = (inv as any).team?.name ?? "Crew";
                  const inviterName = (inv as any).inviter?.display_name ?? (inv as any).inviter?.username ?? "Someone";
                  return (
                    <View key={inv.id} style={styles.inviteCard}>
                      <Pressable
                        onPress={() => router.push(`/team/${inv.team_id}` as any)}
                        style={({ pressed }) => [pressSoftIcon(pressed)]}
                      >
                        <Text style={styles.inviteTeamName} numberOfLines={1}>{teamName}</Text>
                        <Text style={styles.inviteMeta}>{inviterName} invited you</Text>
                      </Pressable>
                      <View style={styles.inviteActions}>
                        <Pressable
                          onPress={() => handleAcceptInvite(inv)}
                          disabled={busyInviteId !== null}
                          style={[styles.inviteAcceptBtn, busyInviteId !== null && styles.disabled]}
                        >
                          <Text style={styles.inviteAcceptText}>Accept</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeclineInvite(inv)}
                          disabled={busyInviteId !== null}
                          style={[styles.inviteDeclineBtn, busyInviteId !== null && styles.disabled]}
                        >
                          <Text style={styles.inviteDeclineText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {tab === "crews" ? "No crews yet." : "No leagues yet."}
              </Text>
              <Text style={styles.emptySub}>
                {tab === "crews"
                  ? "Create a crew and invite players — you'll need at least one invite to get started."
                  : "Create a league with the button above, or open one from Search."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isCrew = tab === "crews";
            const t = item as TeamWithExtras | LeagueWithExtras;
            const count = isCrew
              ? (t as TeamWithExtras).member_count ?? 0
              : (t as LeagueWithExtras).member_count ?? 0;
            const countLabel = `${count} members`;

            return (
              <Pressable
                onPress={() =>
                  router.push(isCrew ? (`/team/${t.id}` as any) : (`/league/${t.id}` as any))
                }
                style={({ pressed }) => [styles.card, pressSoft(pressed)]}
              >
                <View style={styles.cardRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(t.name ?? "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, compact && { fontSize: 16 }]} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.cardMeta}>
                      by {displayName(t)} • {countLabel}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: { marginRight: 12 },
  headerCenter: { flex: 1 },
  headerRight: { width: 24 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  subtitle: { marginTop: 2, fontSize: 13, color: "rgba(255,255,255,0.5)" },
  tabRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 16, flexWrap: "wrap" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    minWidth: 130,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tabActive: { backgroundColor: "rgba(99,102,241,0.3)" },
  tabText: { color: "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 14 },
  tabTextActive: { color: "#fff" },
  actions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexGrow: 1,
    minWidth: 150,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#6366f1",
  },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: "rgba(255,255,255,0.5)", fontSize: 14 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "700" },
  emptySub: { marginTop: 8, color: "rgba(255,255,255,0.4)", fontSize: 14 },
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(99,102,241,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  cardBody: { flex: 1 },
  cardTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  cardMeta: { marginTop: 4, color: "rgba(255,255,255,0.5)", fontSize: 13 },
  invitesSection: { marginHorizontal: 20, marginBottom: 20 },
  invitesSectionTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 12 },
  inviteCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(99,102,241,0.15)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
    marginBottom: 12,
  },
  inviteTeamName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  inviteMeta: { marginTop: 4, color: "rgba(255,255,255,0.6)", fontSize: 13 },
  inviteActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  inviteAcceptBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#6366f1", alignItems: "center" },
  inviteAcceptText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  inviteDeclineBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center" },
  inviteDeclineText: { color: "rgba(255,255,255,0.8)", fontWeight: "700", fontSize: 14 },
  disabled: { opacity: 0.5 },
});
