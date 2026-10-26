// app/trivia/join.tsx - Enter code and display name, then go to room
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getTriviaRoomByCode,
  joinTriviaRoom,
} from "../../lib/backend/trivia";
import { useAuthStore } from "../../lib/data/authStore";
import { useTriviaSessionStore } from "../../lib/data/triviaSessionStore";

export default function TriviaJoinScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setParticipant = useTriviaSessionStore((s) => s.setParticipant);

  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState(
    profile?.display_name || profile?.username || ""
  );
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length < 4) {
      Alert.alert("Invalid code", "Enter the 6-character room code.");
      return;
    }
    const name = displayName.trim() || "Player";
    setLoading(true);
    try {
      const room = await getTriviaRoomByCode(trimmedCode);
      if (!room) {
        Alert.alert("Room not found", "Check the code and try again.");
        setLoading(false);
        return;
      }
      if (room.status !== "lobby") {
        Alert.alert("Game in progress", "This game has already started.");
        setLoading(false);
        return;
      }
      const participant = await joinTriviaRoom({
        roomId: room.id,
        userId: user?.id ?? null,
        displayName: name,
      });
      setParticipant(room.id, participant);
      router.replace(`/trivia/room/${trimmedCode}` as any);
    } catch (e: any) {
      Alert.alert("Join failed", e?.message ?? "Could not join room.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Pressable onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <View style={styles.form}>
        <Text style={styles.label}>Room code</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase())}
          placeholder="ABC123"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.codeInput}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <Text style={styles.label}>Your name</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
          maxLength={32}
        />
        <Pressable
          onPress={handleJoin}
          disabled={loading || code.trim().length < 4}
          style={[styles.joinBtn, (loading || code.trim().length < 4) && styles.joinBtnDisabled]}
        >
          <Text style={styles.joinBtnText}>{loading ? "Joining…" : "Join room"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060a14" },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
  form: { paddingHorizontal: 24, paddingTop: 24 },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 8,
  },
  codeInput: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 4,
    marginBottom: 20,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#fff",
    marginBottom: 28,
  },
  joinBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#6366f1",
    alignItems: "center",
  },
  joinBtnDisabled: { opacity: 0.5 },
  joinBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
});
