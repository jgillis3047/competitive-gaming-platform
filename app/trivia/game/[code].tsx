// app/trivia/game/[code].tsx - Game: host advances, players answer
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  advanceTriviaQuestion,
  getTriviaRoomByCode,
  getTriviaQuestions,
  listTriviaParticipants,
  submitTriviaAnswer,
} from "../../../lib/backend/trivia";
import type { TriviaParticipant, TriviaQuestion, TriviaRoom } from "../../../lib/backend/trivia";
import { useAuthStore } from "../../../lib/data/authStore";
import { colors } from "../../../lib/theme/colors";
import { useTriviaSessionStore } from "../../../lib/data/triviaSessionStore";

export default function TriviaGameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [room, setRoom] = useState<TriviaRoom | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [participants, setParticipants] = useState<TriviaParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [answered, setAnswered] = useState<number | null>(null);

  const getParticipant = useTriviaSessionStore((s) => s.getParticipant);

  const participant = useMemo(() => {
    if (!room) return null;
    const stored = getParticipant(room.id);
    if (stored) return stored;
    return participants.find((p) => p.user_id === user?.id) ?? null;
  }, [room, participants, user?.id, getParticipant]);

  const isHost = room && user && room.host_user_id === user.id;
  const currentIndex = room?.current_question_index ?? 0;
  const totalQuestions = room?.total_questions ?? 5;
  const currentQuestion = questions[currentIndex] ?? null;
  const isFinished = room?.status === "finished" || currentIndex >= totalQuestions;

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try {
      const r = await getTriviaRoomByCode(code);
      if (!r) {
        Alert.alert("Room not found", "Invalid or expired room code.");
        router.back();
        return;
      }
      setRoom(r);
      const [qs, ps] = await Promise.all([
        getTriviaQuestions(r.category_id, r.total_questions, r.id),
        listTriviaParticipants(r.id),
      ]);
      setQuestions(qs);
      setParticipants(ps);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not load game.");
    } finally {
      setLoading(false);
    }
  }, [code, router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAdvance = async () => {
    if (!room || !user || !isHost) return;
    setAdvancing(true);
    try {
      const { finished } = await advanceTriviaQuestion(room.id, user.id);
      await load();
      if (finished) setAnswered(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not advance.");
    } finally {
      setAdvancing(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    if (!room || !participant || !currentQuestion || answered !== null) return;
    setAnswered(currentIndex);
    try {
      await submitTriviaAnswer({
        roomId: room.id,
        participantId: participant.id,
        questionIndex: currentIndex,
        answer,
        correctAnswer: currentQuestion.correct_answer,
        points: currentQuestion.points,
      });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not submit answer.");
    }
  };

  if (loading && !room) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading game…</Text>
      </View>
    );
  }

  if (!room) return null;

  const categoryName = (room as any).category?.name ?? "Trivia";

  if (isFinished) {
    const sorted = [...participants].sort((a, b) => b.score - a.score);
    return (
      <View style={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.finishedCard}>
          <Ionicons name="trophy" size={64} color={colors.amberBright} />
          <Text style={styles.finishedTitle}>Game over</Text>
          <Text style={styles.leaderLabel}>Final scores</Text>
          <ScrollView style={styles.leaderList}>
            {sorted.map((p, i) => (
              <View key={p.id} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>#{i + 1}</Text>
                <Text style={styles.leaderName}>{p.display_name}</Text>
                <Text style={styles.leaderScore}>{p.score} pts</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  if (!currentQuestion) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Waiting for next question…</Text>
      </View>
    );
  }

  const options = Array.isArray(currentQuestion.options)
    ? currentQuestion.options
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>{categoryName}</Text>
        <Text style={styles.topProgress}>
          {currentIndex + 1} / {totalQuestions}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.questionText}>{currentQuestion.question_text}</Text>

        {currentQuestion.media_type === "image" && currentQuestion.media_url && (
          <Image
            source={{ uri: currentQuestion.media_url }}
            style={styles.media}
            resizeMode="contain"
          />
        )}

        <View style={styles.options}>
          {options.map((opt, i) => (
            <Pressable
              key={i}
              onPress={() => handleAnswer(opt)}
              disabled={answered !== null}
              style={[
                styles.optionBtn,
                answered !== null && styles.optionBtnDisabled,
              ]}
            >
              <Text style={styles.optionText}>{opt}</Text>
            </Pressable>
          ))}
        </View>

        {participant && answered === currentIndex && (
          <Text style={styles.answeredHint}>Answer submitted!</Text>
        )}
      </ScrollView>

      {isHost && (
        <View style={styles.footer}>
          <Pressable
            onPress={handleAdvance}
            disabled={advancing}
            style={[styles.nextBtn, advancing && styles.nextBtnDisabled]}
          >
            {advancing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={22} color="#fff" />
                <Text style={styles.nextBtnText}>
                  {currentIndex + 1 >= totalQuestions ? "Finish" : "Next question"}
                </Text>
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#060a14",
  },
  loadingText: { marginTop: 12, color: "rgba(255,255,255,0.5)", fontSize: 14 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: { padding: 8 },
  backText: { color: "#fff", fontWeight: "700", marginLeft: 8 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 12,
  },
  topTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  topProgress: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  questionText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 20,
    lineHeight: 30,
  },
  media: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  options: { gap: 12 },
  optionBtn: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.25)",
    borderWidth: 2,
    borderColor: "rgba(99,102,241,0.4)",
  },
  optionBtnDisabled: { opacity: 0.6 },
  optionText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  answeredHint: {
    marginTop: 20,
    fontSize: 15,
    color: "#22c55e",
    fontWeight: "700",
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "#060a14",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#6366f1",
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  finishedCard: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  finishedTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#fff",
    marginTop: 16,
  },
  leaderLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    marginTop: 32,
    marginBottom: 16,
  },
  leaderList: { width: "100%", maxHeight: 400 },
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  leaderRank: {
    width: 40,
    fontSize: 16,
    fontWeight: "800",
    color: colors.amberBright,
  },
  leaderName: { flex: 1, fontSize: 17, fontWeight: "700", color: "#fff" },
  leaderScore: { fontSize: 16, fontWeight: "800", color: "#22c55e" },
});
