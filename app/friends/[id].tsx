// app/friends/[id].tsx - Friends list (mutual follows) for any user
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import Avatar from "../../lib/ui/Avatar";
import { useAuthStore } from "../../lib/data/authStore";
import { listFriendProfiles } from "../../lib/backend/friends";
import type { ProfileRow } from "../../lib/backend/profile";
import { getBlockedByUserIds, getBlockedUserIds } from "../../lib/backend/blockedUsers";
import { getProfileById } from "../../lib/backend/profile";

import { SkeletonAvatar, SkeletonText } from "../../lib/ui/Skeleton";
import { pressSoft, pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";

export default function FriendsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const viewedUserId = String(id ?? "");
  const myId = useAuthStore((s) => s.user?.id ?? null);
  const isMe = myId === viewedUserId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>("Friends");
  const [friends, setFriends] = useState<ProfileRow[]>([]);

  const load = useCallback(async () => {
    if (!viewedUserId) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const [targetProfile, blockedIds, blockedByIds] = await Promise.all([
        getProfileById(viewedUserId),
        myId ? getBlockedUserIds(myId) : Promise.resolve(new Set<string>()),
        myId ? getBlockedByUserIds(myId) : Promise.resolve(new Set<string>()),
      ]);

      const displayName =
        targetProfile?.display_name || targetProfile?.username || (isMe ? "You" : "Player");
      setTargetName(isMe ? "Your friends" : `${displayName}'s friends`);

      const friendRows = await listFriendProfiles(viewedUserId);

      // Hide users that are blocked either way by the viewer.
      const filtered = myId
        ? (friendRows ?? []).filter((p) => !blockedIds.has(p.id) && !blockedByIds.has(p.id))
        : friendRows ?? [];

      setFriends(filtered);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Could not load friends.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewedUserId, myId, isMe]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);

  const TopBar = (
    <View style={styles.topBar}>
      <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{targetName}</Text>
        <Text style={styles.subtitle}>Mutual friends</Text>
      </View>
    </View>
  );

  const FriendRow = ({ item }: { item: ProfileRow }) => {
    const name = item.display_name || item.username || "Player";
    return (
      <Pressable
        onPress={() => router.push(`/user/${item.id}` as any)}
        style={({ pressed }) => [styles.row, pressSubtle(pressed)]}
      >
        <Avatar imageUrl={item.avatar_url ?? null} name={name} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {name}
          </Text>
          {item.username ? <Text style={styles.rowSub}>@{item.username}</Text> : <Text style={styles.rowSub}> </Text>}
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.4)" />
      </Pressable>
    );
  };

  const SkeletonRow = ({ index }: { index: number }) => {
    return (
      <View style={styles.row} key={index}>
        <SkeletonAvatar size={44} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonText lines={1} lastLineWidth={"70%"} />
          <SkeletonText lines={1} lastLineWidth={"40%"} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {TopBar}

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonRow key={i} index={i} />
          ))}
        </View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Pressable onPress={load} style={({ pressed }) => [styles.retryBtn, pressSoft(pressed)]}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyTitle}>No friends yet</Text>
          <Text style={styles.emptySub}>When people add each other, they show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={FriendRow}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: { marginRight: 12 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff" },
  subtitle: { marginTop: 2, fontSize: 13, color: "#9aa1c6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  errorText: { color: "#FCA5A5", fontSize: 16, textAlign: "center" },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: "#6366f1" },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "800", color: "#fff" },
  emptySub: { marginTop: 6, fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  rowSub: { marginTop: 2, color: "rgba(255,255,255,0.45)", fontSize: 12 },
  sep: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
});

