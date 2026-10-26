// app/phone-games/math-race.tsx
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { submitChallengeScore } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { error as hapticError, selection as hapticSelection, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Math Race";

type Question = {
  a: number;
  b: number;
  op: "+" | "−";
  answer: number;
};

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildQuestions(count: number): Question[] {
  const qs: Question[] = [];
  for (let i = 0; i < count; i++) {
    const op: Question["op"] = Math.random() < 0.5 ? "+" : "−";
    let a = randInt(2, 19);
    let b = randInt(2, 19);
    if (op === "−" && b > a) [a, b] = [b, a];
    const answer = op === "+" ? a + b : a - b;
    qs.push({ a, b, op, answer });
  }
  return qs;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

const TOTAL = 10;

export default function MathRaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(!!challengeId);
  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions(TOTAL));
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const q = useMemo(() => questions[idx] ?? null, [questions, idx]);
  const inChallenge = !!challengeId;
  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Math Race",
    challengeId
  );

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  // Shared seed: fetch or create questions for challenge
  useEffect(() => {
    if (!challengeId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const { data: seedEvents, error: seedErr } = await supabase
          .from("challenge_events")
          .select("id, type, payload, created_at")
          .eq("challenge_id", challengeId)
          .eq("type", "game_seed")
          .order("created_at", { ascending: true })
          .limit(1);

        if (seedErr) throw seedErr;
        const existing = (seedEvents?.[0] as SeedEvent | undefined) ?? null;

        if (existing?.payload?.game === "Math Race" && Array.isArray(existing.payload.questions)) {
          const qs = existing.payload.questions as Question[];
          if (qs.length >= TOTAL && mounted) {
            setQuestions(qs.slice(0, TOTAL));
            setLoading(false);
            return;
          }
        }

        const newQuestions = buildQuestions(TOTAL);
        const { error: insErr } = await supabase.from("challenge_events").insert({
          challenge_id: challengeId,
          type: "game_seed",
          actor_user_id: user?.id ?? null,
          body: "Game seed created.",
          payload: { game: "Math Race", questions: newQuestions, seedVersion: 1 },
        });

        if (insErr) {
          const { data: seed2 } = await supabase
            .from("challenge_events")
            .select("id, type, payload")
            .eq("challenge_id", challengeId)
            .eq("type", "game_seed")
            .order("created_at", { ascending: true })
            .limit(1);
          const ex2 = (seed2?.[0] as SeedEvent | undefined) ?? null;
          const qs = ex2?.payload?.questions;
          if (Array.isArray(qs) && qs.length >= TOTAL && mounted) {
            setQuestions(qs.slice(0, TOTAL));
          } else if (mounted) {
            setQuestions(newQuestions);
          }
        } else if (mounted) {
          setQuestions(newQuestions);
        }
      } catch {
        if (mounted) setQuestions(buildQuestions(TOTAL));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [challengeId, user?.id]);

  useEffect(() => {
    if (loading) return;
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [loading, challengeId]);

  const resetPractice = () => {
    if (inChallenge) return;
    setQuestions(buildQuestions(TOTAL));
    setIdx(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const answers = useMemo(() => {
    if (!q) return [];
    const opts = new Set<number>();
    opts.add(q.answer);
    while (opts.size < 4) {
      const jitter = randInt(-10, 10);
      const c = q.answer + jitter;
      if (c >= 0 && c !== q.answer) opts.add(c);
    }
    const arr = Array.from(opts);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [q]);

  const SUBMIT_TIMEOUT_MS = 30_000;

  const finishGame = async (finalScore: number) => {
    setFinished(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (!inChallenge) {
      const s = await showPracticeResult(
        {
          score: finalScore,
          timeSec: elapsed,
          scoreLabel: `Score ${finalScore}/${TOTAL}`,
          timeLabel: `Time ${formatTime(elapsed)}`,
        },
        resetPractice
      );
      setProgress(s.progress);
      return;
    }
    if (!user?.id) {
      Alert.alert("Sign in required", "You must be logged in to submit results.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), SUBMIT_TIMEOUT_MS)
      );
      await Promise.race([
        submitChallengeScore(challengeId!, user.id, finalScore),
        timeoutPromise,
      ]);
      const s = await showChallengeSubmitted({
        score: finalScore,
        timeSec: elapsed,
        scoreLabel: `Score ${finalScore}/${TOTAL}`,
        timeLabel: `Time ${formatTime(elapsed)}`,
      });
      setProgress(s.progress);
    } catch (e: any) {
      const msg = e?.message ?? "Could not submit result.";
      Alert.alert("Submit failed", msg, [
        { text: "Retry", onPress: () => finishGame(finalScore) },
        { text: "Go back", onPress: () => router.replace(`/challenge/${challengeId}` as any) },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const chooseAnswer = async (value: number) => {
    if (!q || finished) return;
    setSelected(value);
    if (value === q.answer) hapticSelection();
    else hapticError();
    const nextScore = score + (value === q.answer ? 1 : 0);
    setTimeout(async () => {
      setScore(nextScore);
      setSelected(null);
      if (idx + 1 >= TOTAL) await finishGame(nextScore);
      else setIdx(idx + 1);
    }, 250);
  };

  const confirmExit = () => {
    if (!inChallenge) return router.back();
    Alert.alert("Leave game?", "You can come back later to finish.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading questions…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Math Race", headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={confirmExit} style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Math Race</Text>
        <View style={styles.timerBox}>
          <Text style={styles.timer}>{formatTime(elapsed)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>{inChallenge ? "CHALLENGE" : "PRACTICE"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Question</Text>
          <Text style={styles.value}>{Math.min(idx + 1, TOTAL)}/{TOTAL}</Text>
        </View>
        <View style={styles.questionBox}>
          <Text style={styles.questionText}>{q ? `${q.a} ${q.op} ${q.b} = ?` : "—"}</Text>
        </View>
        <Text style={styles.label}>Pick an answer</Text>
        <View style={styles.grid}>
          {answers.map((a) => {
            const isSelected = selected === a;
            const disabled = finished || submitting;
            return (
              <Pressable
                key={a}
                onPress={() => chooseAnswer(a)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.choice,
                  isSelected && styles.choiceSelected,
                  disabled && styles.choiceDisabled,
                  pressed && !disabled && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.choiceText}>{a}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.row, styles.scoreRow]}>
          <Text style={styles.label}>Score</Text>
          <Text style={styles.value}>{score}</Text>
        </View>
        {submitting && (
          <View style={styles.submitRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.muted}>Submitting…</Text>
          </View>
        )}
        {!inChallenge ? (
          <Pressable style={({ pressed }) => [styles.secondary, pressSoft(pressed)]} onPress={resetPractice}>
            <Text style={styles.secondaryText}>New Practice Run</Text>
          </Pressable>
        ) : null}
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 50, paddingHorizontal: 16 },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.textSecondary, marginTop: 12, fontWeight: "800" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  topBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.borderStrong },
  topBtnText: { color: colors.text, fontWeight: "800" },
  topTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  timerBox: { minWidth: 72, alignItems: "flex-end" },
  timer: { color: colors.text, fontWeight: "900", fontSize: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modePill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.accentSurface, borderWidth: 1, borderColor: colors.accentBorder, marginBottom: 14 },
  modePillText: { color: colors.text, fontWeight: "900", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.textSecondary, fontWeight: "800" },
  value: { color: colors.text, fontWeight: "900" },
  questionBox: {
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginVertical: 14,
    alignItems: "center",
  },
  questionText: { color: colors.text, fontSize: 28, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  choice: {
    width: "47%",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  choiceSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentSurface },
  choiceDisabled: { opacity: 0.6 },
  choiceText: { color: colors.text, fontWeight: "900", fontSize: 20 },
  scoreRow: { marginTop: 16 },
  submitRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 },
  muted: { color: colors.textMuted, fontWeight: "800" },
  secondary: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
  },
  secondaryText: { color: colors.text, fontWeight: "900" },
  hint: { color: colors.textMuted, marginTop: 14, textAlign: "center", fontSize: 13 },
});
