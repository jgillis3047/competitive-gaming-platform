// app/trivia/room/[code].tsx - Lobby: list participants, host starts game
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  getTriviaRoomByCode,
  joinTriviaRoom,
  listTriviaParticipants,
  startTriviaGame,
} from "../../../lib/backend/trivia";
import type { TriviaParticipant, TriviaRoom } from "../../../lib/backend/trivia";
import { useAuthStore } from "../../../lib/data/authStore";
import { colors } from "../../../lib/theme/colors";
import { useTriviaSessionStore } from "../../../lib/data/triviaSessionStore";

export default function TriviaRoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setParticipant = useTriviaSessionStore((s) => s.setParticipant);

  const [room, setRoom] = useState<TriviaRoom | null>(null);
  const [participants, setParticipants] = useState<TriviaParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!code) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const r = await getTriviaRoomByCode(code);
      if (!r) {
        Alert.alert("Room not found", "Invalid or expired room code.");
        router.back();
        return;
      }
      setRoom(r);
      if (r.status === "lobby") {
        const list = await listTriviaParticipants(r.id);
        setParticipants(list);
        // If host opened lobby and not yet in participants, auto-join as player
        if (user && r.host_user_id === user.id && !list.some((p) => p.user_id === user.id)) {
          try {
            const displayName = profile?.display_name || profile?.username || "Host";
            const p = await joinTriviaRoom({ roomId: r.id, userId: user.id, displayName });
            setParticipant(r.id, p);
            setParticipants((prev) => [...prev, p]);
          } catch {
            /* join failed — lobby still usable */
          }
        }
      }
      if (r.status === "in_progress" || r.status === "finished") {
        router.replace(`/trivia/game/${code}` as any);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load room.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [code, router, user, profile, setParticipant]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStart = async () => {
    if (!room || !user || room.host_user_id !== user.id) return;
    setStarting(true);
    try {
      await startTriviaGame(room.id, user.id);
      router.replace(`/trivia/game/${code}` as any);
    } catch (e: any) {
      Alert.alert("Start failed", e?.message ?? "Could not start game.");
    } finally {
      setStarting(false);
    }
  };

  const isHost = room && user && room.host_user_id === user.id;

  if (loading && !room) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading room…</Text>
      </View>
    );
  }

  if (!room) return null;

  const categoryName = (room as any).category?.name ?? "Trivia";

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.code}>{room.code}</Text>
        <Text style={styles.category}>{categoryName}</Text>
        <Text style={styles.count}>{participants.length} player{participants.length !== 1 ? "s" : ""}</Text>
      </View>

      <FlatList
        data={participants}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl tintColor="#fff" refreshing={refreshing} onRefresh={() => load(true)} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No players yet. Share the code to invite!</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.participantRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(item.display_name || "?").charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.participantName}>{item.display_name}</Text>
          </View>
        )}
      />

      {isHost && (
        <View style={styles.footer}>
          <Pressable
            onPress={handleStart}
            disabled={starting || participants.length < 1}
            style={[styles.startBtn, (starting || participants.length < 1) && styles.startBtnDisabled]}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="play" size={22} color="#fff" />
                <Text style={styles.startBtnText}>Start game</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#060a14" },
  loadingText: { marginTop: 12, color: "rgba(255,255,255,0.5)", fontSize: 14 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
  header: {
    alignItems: "center",
    paddingBottom: 24,
  },
  code: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.amberBright,
    letterSpacing: 6,
  },
  category: { marginTop: 8, color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: "700" },
  count: { marginTop: 4, color: "rgba(255,255,255,0.5)", fontSize: 14 },
  list: { paddingHorizontal: 24, paddingBottom: 100 },
  emptyText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    marginTop: 40,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(99,102,241,0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  participantName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#060a14",
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#22c55e",
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
});
