// app/phone-games/number-pattern.tsx - Complete sequences, fastest wins
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
import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { error as hapticError, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Number Pattern";

// [sequence, answer]
const PATTERNS: [number[], number][] = [
  [[2, 4, 6, 8], 10],
  [[1, 3, 5, 7], 9],
  [[3, 6, 9, 12], 15],
  [[5, 10, 15, 20], 25],
  [[1, 2, 4, 7], 11],
  [[2, 4, 8, 16], 32],
  [[10, 20, 30, 40], 50],
  [[1, 4, 9, 16], 25],
  [[1, 1, 2, 3, 5], 8],
  [[2, 3, 5, 7], 11],
];
const TOTAL = 5;

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

function pickPatterns(seed: number): typeof PATTERNS {
  const indices: number[] = [];
  const available = [...Array(PATTERNS.length).keys()];
  for (let n = 0; n < TOTAL && available.length > 0; n++) {
    seed = (seed * 9301 + 49297) % 233280;
    const i = Math.floor((seed / 233280) * available.length);
    indices.push(available.splice(i, 1)[0]);
  }
  return indices.map((i) => PATTERNS[i]);
}

export default function NumberPatternScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(!!challengeId);
  const [problems, setProblems] = useState<typeof PATTERNS>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inChallenge = !!challengeId;

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Numbers Pattern",
    challengeId
  );

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  const resetPractice = () => {
    setProblems(pickPatterns(Date.now() % 100000));
    setIdx(0);
    setSelected(null);
    setElapsed(0);
    setFinished(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const problem = problems[idx];
  const options = useMemo(() => {
    if (!problem) return [];
    const list = [problem[1], problem[1] + 1, problem[1] - 1, problem[1] + 2];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, [idx, problem]);

  useEffect(() => {
    if (!challengeId) {
      setProblems(pickPatterns(Date.now() % 100000));
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const { data: seedEvents } = await supabase
          .from("challenge_events")
          .select("id, type, payload, created_at")
          .eq("challenge_id", challengeId)
          .eq("type", "game_seed")
          .order("created_at", { ascending: true })
          .limit(1);
        const existing = (seedEvents?.[0] as SeedEvent | undefined) ?? null;
        let probs: typeof PATTERNS;
        if (existing?.payload?.game === "Number Pattern" && Array.isArray(existing.payload.problems)) {
          probs = existing.payload.problems;
        } else {
          const seed = Math.floor(Math.random() * 100000);
          probs = pickPatterns(seed);
          await supabase.from("challenge_events").insert({
            challenge_id: challengeId,
            type: "game_seed",
            actor_user_id: user?.id ?? null,
            body: "Game seed created.",
            payload: { game: "Number Pattern", problems: probs, seedVersion: 1 },
          });
        }
        if (mounted) setProblems(probs.length ? probs : pickPatterns(Date.now() % 100000));
      } catch {
        if (mounted) setProblems(pickPatterns(Date.now() % 100000));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [challengeId, user?.id]);

  useEffect(() => {
    if (loading) return;
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [loading]);

  const handlePick = async (val: number) => {
    if (!problem || finished) return;
    setSelected(val);
    const correct = val === problem[1];
    setTimeout(async () => {
      if (!correct) {
        hapticError();
        setTimeout(() => setSelected(null), 500);
        return;
      }
      hapticSuccess();
      if (idx + 1 >= TOTAL) {
        setFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);
        if (!inChallenge) {
          const s = await showPracticeResult(
            { score: TOTAL, timeSec: elapsed, timeLabel: `Time ${elapsed}s` },
            resetPractice
          );
          setProgress(s.progress);
          return;
        }
        if (!user?.id || submitting) return;
        setSubmitting(true);
        try {
          await submitChallengeResult({ challengeId: challengeId!, userId: user.id, score: elapsed, scoreSort: "asc" });
          const s = await showChallengeSubmitted({
            score: TOTAL,
            timeSec: elapsed,
            timeLabel: `Time ${elapsed}s`,
          });
          setProgress(s.progress);
        } catch (e: any) {
          Alert.alert("Submit failed", e?.message ?? "Could not submit.");
        } finally {
          setSubmitting(false);
        }
      } else {
        setIdx(idx + 1);
        setSelected(null);
      }
    }, 300);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Number Pattern", headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Number Pattern</Text>
        <Text style={styles.timer}>{elapsed}s</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Question {idx + 1}/{TOTAL}</Text>
        <Text style={styles.sequence}>
          {problem ? problem[0].join(", ") + ", ?" : "—"}
        </Text>
        <View style={styles.options}>
          {options.map((val) => (
            <Pressable
              key={val}
              onPress={() => handlePick(val)}
              disabled={finished || submitting}
              style={[
                styles.opt,
                selected === val && (val === problem?.[1] ? styles.optCorrect : styles.optWrong),
              ]}
            >
              <Text style={styles.optText}>{val}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: colors.textTertiary, fontSize: 14 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  topBtn: { marginRight: 12 },
  topBtnText: { color: colors.text, fontWeight: "700" },
  topTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  timer: { color: colors.warning, fontSize: 18, fontWeight: "800" },
  card: { margin: 16, padding: 20, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  label: { color: colors.textTertiary, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  sequence: { fontSize: 24, fontWeight: "800", color: colors.text, marginBottom: 8 },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 16 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  opt: {
    flex: 1,
    minWidth: 70,
    padding: 16,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  optCorrect: { borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.2)" },
  optWrong: { borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.2)" },
  optText: { color: colors.text, fontSize: 20, fontWeight: "800" },
});
