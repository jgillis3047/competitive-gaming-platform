// app/phone-games/unscramble.tsx - Unscramble 5 words, fastest wins
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { getDictionaryWordsOfLength } from "../../lib/data/wordsDictionary";
import { error as hapticError, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Unscramble Word";
const WORD_LEN = 5;
const TOTAL = 5;

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

function scrambleWord(word: string): string {
  if (word.length <= 1) return word;
  let scrambled = word
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
  let tries = 0;
  while (scrambled === word && tries < 12) {
    scrambled = word
      .split("")
      .sort(() => Math.random() - 0.5)
      .join("");
    tries++;
  }
  return scrambled;
}

function buildPuzzle(seed: number, pool: string[]): string[] {
  if (pool.length < TOTAL) {
    throw new Error(`Need at least ${TOTAL} words in the dictionary pool.`);
  }
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const indices: number[] = [];
  const used = new Set<number>();
  while (indices.length < TOTAL) {
    const i = Math.floor(rng() * pool.length);
    if (!used.has(i)) {
      used.add(i);
      indices.push(i);
    }
  }
  return indices.map((i) => pool[i].toUpperCase());
}

export default function UnscrambleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [dictReady, setDictReady] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [scrambled, setScrambled] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordPoolRef = useRef<string[]>([]);

  const inChallenge = !!challengeId;

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Unscramble Words",
    challengeId
  );

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pool = await getDictionaryWordsOfLength(WORD_LEN);
        if (!pool.length) {
          throw new Error(`No ${WORD_LEN}-letter words found in dictionary.`);
        }
        wordPoolRef.current = pool;
        if (mounted) setDictReady(true);
      } catch (e: any) {
        if (mounted) {
          Alert.alert(
            "Dictionary unavailable",
            e?.message ?? "Could not load the offline word list. Run npm run fetch:words and restart.",
            [{ text: "OK", onPress: () => router.back() }]
          );
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const applyPuzzle = useCallback((ws: string[], scr?: string[]) => {
    setWords(ws);
    setScrambled(scr ?? ws.map((w) => scrambleWord(w)));
    setIdx(0);
    setInput("");
    setElapsed(0);
    setFinished(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  }, []);

  const resetPractice = useCallback(() => {
    const pool = wordPoolRef.current;
    if (!pool.length) return;
    const ws = buildPuzzle(Date.now() % 233280, pool);
    applyPuzzle(ws);
  }, [applyPuzzle]);

  const loadGame = useCallback(async () => {
    const pool = wordPoolRef.current;
    if (!pool.length) return;

    if (!challengeId) {
      const ws = buildPuzzle(Date.now() % 233280, pool);
      applyPuzzle(ws);
      setLoading(false);
      return;
    }

    try {
      const { data: seedEvents } = await supabase
        .from("challenge_events")
        .select("id, type, payload, created_at")
        .eq("challenge_id", challengeId)
        .eq("type", "game_seed")
        .order("created_at", { ascending: true })
        .limit(1);

      const existing = (seedEvents?.[0] as SeedEvent | undefined) ?? null;

      if (existing?.payload?.game === "Unscramble Word" && Array.isArray(existing.payload.words)) {
        const ws = existing.payload.words.slice(0, TOTAL).map((w: string) => String(w).toUpperCase());
        const scr = Array.isArray(existing.payload.scrambled)
          ? existing.payload.scrambled.slice(0, TOTAL).map((w: string) => String(w).toUpperCase())
          : ws.map((w) => scrambleWord(w));
        applyPuzzle(ws, scr);
      } else {
        const seed = Math.floor(Math.random() * 233280);
        const ws = buildPuzzle(seed, pool);
        const scr = ws.map((w) => scrambleWord(w));
        await supabase.from("challenge_events").insert({
          challenge_id: challengeId,
          type: "game_seed",
          actor_user_id: user?.id ?? null,
          body: "Game seed created.",
          payload: { game: "Unscramble Word", words: ws, scrambled: scr, seed, seedVersion: 2 },
        });
        applyPuzzle(ws, scr);
      }
    } catch {
      const ws = buildPuzzle(Date.now() % 233280, pool);
      applyPuzzle(ws);
    } finally {
      setLoading(false);
    }
  }, [applyPuzzle, challengeId, user?.id]);

  useEffect(() => {
    if (!dictReady) return;
    void loadGame();
  }, [dictReady, loadGame]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  const currentWord = words[idx];
  const currentScrambled = scrambled[idx];

  const handleSubmit = async () => {
    const guess = input.trim().toUpperCase();
    if (!currentWord || guess !== currentWord) {
      hapticError();
      return;
    }
    hapticSuccess();
    if (idx + 1 >= TOTAL) {
      setFinished(true);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (!inChallenge) {
        const s = await showPracticeResult(
          {
            score: TOTAL,
            timeSec: elapsed,
            timeLabel: `Time ${elapsed}s`,
          },
          resetPractice
        );
        setProgress(s.progress);
        return;
      }
      if (!user?.id || submitting) return;
      setSubmitting(true);
      try {
        await submitChallengeResult({
          challengeId: challengeId!,
          userId: user.id,
          score: elapsed,
          scoreSort: "asc",
        });
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
      setInput("");
      setIdx(idx + 1);
    }
  };

  if (loading || !dictReady) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "Unscramble Word", headerShown: false }} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {dictReady ? "Preparing puzzle…" : "Loading dictionary…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Unscramble Word", headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Unscramble</Text>
        <Text style={styles.timer}>{elapsed}s</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Word {idx + 1}/{TOTAL}</Text>
        <Text style={styles.scrambled}>{currentScrambled}</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Type the word"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!finished}
          onSubmitEditing={handleSubmit}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={finished || submitting || input.trim().toUpperCase() !== (currentWord ?? "")}
          style={[styles.btn, (finished || submitting) && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>{idx + 1 >= TOTAL ? (submitting ? "Submitting…" : "Submit") : "Next"}</Text>
        </Pressable>
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, color: colors.textTertiary, fontSize: 14, fontWeight: "600" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  topBtn: { marginRight: 12 },
  topBtnText: { color: colors.text, fontWeight: "700" },
  topTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  timer: { color: colors.warning, fontSize: 18, fontWeight: "800" },
  card: { margin: 16, padding: 20, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  label: { color: colors.textTertiary, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  scrambled: { fontSize: 32, fontWeight: "900", color: colors.text, letterSpacing: 4, marginBottom: 16, textAlign: "center" },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 16, color: colors.text, fontSize: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.line },
  btn: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: "center" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.text, fontWeight: "800", fontSize: 16 },
});
