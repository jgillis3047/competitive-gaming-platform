import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";

import { supabase } from "../../lib/backend/supabaseClient";
import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { useAuthStore } from "../../lib/data/authStore";
import { hasDictionaryWord, loadWordsDictionary } from "../../lib/data/wordsDictionary";
import { success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSubtle } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Anagrams";

/**
 * Advanced Anagrams (1-attempt)
 * - Shared seed letters stored in challenge_events(type="game_seed") payload
 * - Timer limit with auto-submit
 * - Tap letter tiles to build word, backspace/clear, shuffle
 * - Offline dictionary => assets/words/words-en.txt (real English words, npm run fetch:words)
 * - Clean 7-tile rack layout (no weird wrap)
 */

const TIME_LIMIT_SEC = 60;
const MIN_WORD_LEN = 3;

type SeedEvent = {
  id: string;
  type: string;
  payload: any;
  created_at: string;
};

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeWord(w: string) {
  return (w ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
}

function canFormWord(word: string, letters: string) {
  const need: Record<string, number> = {};
  for (const ch of word) need[ch] = (need[ch] ?? 0) + 1;

  const have: Record<string, number> = {};
  for (const ch of letters.toLowerCase()) have[ch] = (have[ch] ?? 0) + 1;

  for (const ch of Object.keys(need)) {
    if ((have[ch] ?? 0) < need[ch]) return false;
  }
  return true;
}

function baseScoreWord(word: string) {
  const n = word.length;
  if (n <= 2) return 0;
  if (n === 3) return 1;
  if (n === 4) return 2;
  if (n === 5) return 4;
  if (n === 6) return 7;
  if (n === 7) return 11;
  return 15;
}

function generateLettersV1() {
  // 7 letters tuned to be playable: 2 vowels + 5 consonants
  const vowels = ["a", "e", "i", "o", "u"];
  const consonants = [
    "n",
    "r",
    "t",
    "s",
    "l",
    "d",
    "g",
    "h",
    "m",
    "p",
    "b",
    "c",
    "f",
    "k",
    "w",
    "y",
    "v",
    "x",
    "z",
    "j",
    "q",
  ];

  const picks: string[] = [];
  picks.push(vowels[Math.floor(Math.random() * vowels.length)]);
  picks.push(vowels[Math.floor(Math.random() * vowels.length)]);
  for (let i = 0; i < 5; i++) picks.push(consonants[Math.floor(Math.random() * consonants.length)]);

  return shuffle(picks).join("").toUpperCase();
}

function format2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function AnagramsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { challengeId: challengeIdParam } = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = challengeIdParam ? String(challengeIdParam) : null;
  const user = useAuthStore((s) => s.user);

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Anagrams",
    challengeId
  );

  const [loading, setLoading] = useState(true);
  const [dictReady, setDictReady] = useState(false);

  const [letters, setLetters] = useState<string>("");

  // Tiles state
  const [tileOrder, setTileOrder] = useState<string[]>([]);
  const [pickedIdxs, setPickedIdxs] = useState<number[]>([]);

  // Gameplay
  const [found, setFound] = useState<{ word: string; points: number; bonus: number }[]>([]);
  const [streak, setStreak] = useState(0);

  // Submit state
  const [submitted, setSubmitted] = useState(false);

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(TIME_LIMIT_SEC);
  const [timeUp, setTimeUp] = useState(false);
  const autoSubmittedRef = useRef(false);

  // Animations
  const shakeX = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const locked = submitted || timeUp || loading || !dictReady;

  const resetPractice = () => {
    autoSubmittedRef.current = false;
    setTimeUp(false);
    setSecondsLeft(TIME_LIMIT_SEC);
    setFound([]);
    setStreak(0);
    setPickedIdxs([]);
    setSubmitted(false);
    const fallback = generateLettersV1();
    setLetters(fallback);
    setTileOrder(fallback.split(""));
  };

  // Clean tile sizing: 7-tile rack always
  const tileSize = useMemo(() => {
    // container padding(16*2) + tiles card padding(12*2) + 6 gaps of 10
    const available = width - 32 - 24 - 60;
    const raw = Math.floor(available / 7);
    return clamp(raw, 40, 54);
  }, [width]);

  const currentWord = useMemo(() => {
    const chars = pickedIdxs.map((i) => tileOrder[i] ?? "");
    return chars.join("");
  }, [pickedIdxs, tileOrder]);

  const currentWordNorm = useMemo(() => normalizeWord(currentWord), [currentWord]);

  const totalScore = useMemo(() => found.reduce((acc, item) => acc + item.points + item.bonus, 0), [found]);

  const bestWord = useMemo(() => {
    if (!found.length) return null;
    return found.reduce((best, cur) => {
      const b = best.points + best.bonus;
      const c = cur.points + cur.bonus;
      return c > b ? cur : best;
    }, found[0]);
  }, [found]);

  // Timer text
  const timerText = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${format2(s)}`;
  }, [secondsLeft]);

  const timerProgress = useMemo(() => clamp(secondsLeft / TIME_LIMIT_SEC, 0, 1), [secondsLeft]);

  // Load dictionary once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadWordsDictionary();
        if (!mounted) return;
        setDictReady(true);
      } catch (e: any) {
        console.error("[Anagrams] dictionary load failed:", e?.message ?? e);
        if (!mounted) return;
        setDictReady(false);
        Alert.alert(
          "Dictionary missing",
          e?.message ?? "Could not load the offline word list. Restart the app and try again."
        );
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // --- Shared seed letters via challenge_events(type="game_seed") ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // fallback for dev
        if (!challengeId) {
          const fallback = generateLettersV1();
          if (!mounted) return;
          setLetters(fallback);
          setTileOrder(fallback.split(""));
          return;
        }

        // 1) fetch existing seed
        const { data: seedEvents, error: seedErr } = await supabase
          .from("challenge_events")
          .select("id, type, payload, created_at")
          .eq("challenge_id", challengeId)
          .eq("type", "game_seed")
          .order("created_at", { ascending: true })
          .limit(1);

        if (seedErr) throw seedErr;

        const existing = (seedEvents?.[0] as SeedEvent | undefined) ?? null;

        if (existing?.payload?.game === "Anagrams" && typeof existing.payload.letters === "string") {
          const L = String(existing.payload.letters);
          if (!mounted) return;
          setLetters(L);
          setTileOrder(L.split(""));
          return;
        }

        // 2) create seed (first opener wins the race)
        const newLetters = generateLettersV1();

        const { error: insErr } = await supabase.from("challenge_events").insert({
          challenge_id: challengeId,
          type: "game_seed",
          actor_user_id: user?.id ?? null,
          body: "Game seed created.",
          payload: { game: "Anagrams", letters: newLetters, seedVersion: 1 },
        });

        // If insert failed (race), re-fetch
        if (insErr) {
          const { data: seedEvents2 } = await supabase
            .from("challenge_events")
            .select("id, type, payload, created_at")
            .eq("challenge_id", challengeId)
            .eq("type", "game_seed")
            .order("created_at", { ascending: true })
            .limit(1);

          const existing2 = (seedEvents2?.[0] as SeedEvent | undefined) ?? null;
          const L2 = existing2?.payload?.letters;
          const finalLetters = typeof L2 === "string" ? String(L2) : newLetters;

          if (!mounted) return;
          setLetters(finalLetters);
          setTileOrder(finalLetters.split(""));
          return;
        }

        if (!mounted) return;
        setLetters(newLetters);
        setTileOrder(newLetters.split(""));
      } catch (e: any) {
        console.error("[Anagrams] seed error:", e?.message ?? e);
        const fallback = generateLettersV1();
        if (!mounted) return;
        setLetters(fallback);
        setTileOrder(fallback.split(""));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [challengeId, user?.id]);

  // --- Timer (starts when letters are ready) ---
  useEffect(() => {
    if (!letters) return;

    setSecondsLeft(TIME_LIMIT_SEC);
    setTimeUp(false);
    autoSubmittedRef.current = false;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [letters]);

  // Auto-submit on 0
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (timeUp) return;

    setTimeUp(true);

    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;

    submitAttempt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  // --- UI helpers ---
  function runShake() {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function runPop() {
    pop.setValue(1);
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.05, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 1, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }

  function runFlash() {
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }

  // --- Tile interactions ---
  const onPressTile = (idx: number) => {
    if (locked) return;
    if (pickedIdxs.includes(idx)) return;
    setPickedIdxs((prev) => [...prev, idx]);
  };

  const onBackspace = () => {
    if (locked) return;
    setPickedIdxs((prev) => prev.slice(0, -1));
  };

  const onClear = () => {
    if (locked) return;
    setPickedIdxs([]);
  };

  const onShuffle = () => {
    if (locked) return;
    setTileOrder((prev) => shuffle(prev));
    setPickedIdxs([]);
  };

  const addCurrentWord = async () => {
    if (locked) return;

    const w = currentWordNorm;

    if (!w || w.length < MIN_WORD_LEN) {
      runShake();
      return;
    }
    if (!canFormWord(w, letters)) {
      runShake();
      return;
    }
    if (found.some((x) => x.word === w)) {
      runShake();
      return;
    }

    // ✅ real word check
    const ok = await hasDictionaryWord(w);
    if (!ok) {
      // if they attempt a fake word, break streak (feels fair)
      setStreak(0);
      runShake();
      return;
    }

    const base = baseScoreWord(w);

    // ✅ smaller, believable streak bonus
    // +1 every 3rd consecutive valid word, capped at 3
    const nextStreak = streak + 1;
    const bonus = clamp(Math.floor(nextStreak / 3), 0, 3);

    setFound((prev) => [{ word: w, points: base, bonus }, ...prev]);
    setStreak(nextStreak);
    setPickedIdxs([]);

    hapticSuccess();
    runPop();
    runFlash();
  };

  // --- Submit attempt ---
  const submitAttempt = async (silent?: boolean) => {
    if (submitted) return;
    const timeSec = TIME_LIMIT_SEC - secondsLeft;

    if (!challengeId) {
      setSubmitted(true);
      await showPracticeResult(
        {
          score: totalScore,
          timeSec,
          scoreLabel: `Score ${totalScore}`,
          timeLabel: `${found.length} word${found.length === 1 ? "" : "s"}`,
        },
        resetPractice
      );
      return;
    }

    if (!user?.id) {
      if (!silent) Alert.alert("Sign in required", "Log in to play.");
      return;
    }

    try {
      setLoading(true);

      await submitChallengeResult({
        challengeId,
        userId: user.id,
        score: totalScore,
        scoreSort: "desc",
      });

      await showChallengeSubmitted({
        score: totalScore,
        timeSec,
        scoreLabel: `Score ${totalScore}`,
        timeLabel: `${found.length} word${found.length === 1 ? "" : "s"}`,
      });
      setSubmitted(true);
    } catch (e: any) {
      if (!silent) Alert.alert("Submit failed", e?.message ?? "Could not submit.");
    } finally {
      setLoading(false);
    }
  };

  const wordBarDisplay = useMemo(() => {
    if (!currentWord) return "Tap letters to build a word";
    return currentWord;
  }, [currentWord]);

  return (
    <View style={styles.container}>
      {/* Top HUD */}
      <View style={styles.hud}>
        <View style={styles.hudLeft}>
          <Text style={styles.hTitle}>Anagrams</Text>
          <Text style={styles.hSub}>Real words only • 1 attempt</Text>
        </View>

        <View style={styles.hudRight}>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillLabel}>Score</Text>
            <Text style={styles.scorePillValue}>{totalScore}</Text>
          </View>
        </View>
      </View>

      {/* Timer + Progress */}
      <View style={styles.timerRow}>
        <View style={styles.timerPill}>
          <Text style={styles.timerLabel}>Time</Text>
          <Text style={[styles.timerValue, secondsLeft <= 10 && { opacity: 0.95 }]}>{timerText}</Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(timerProgress * 100)}%` }]} />
          </View>
          <Text style={styles.progressHint}>{secondsLeft <= 10 ? "Hurry." : "Go."}</Text>
        </View>

        <View style={styles.metaPill}>
          <Text style={styles.metaLabel}>Streak</Text>
          <Text style={styles.metaValue}>{streak}</Text>
        </View>
      </View>

      {/* Current word bar */}
      <Animated.View style={[styles.wordBar, { transform: [{ translateX: shakeX }, { scale: pop }] }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flashOverlay,
            {
              opacity: flash.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.18],
              }),
            },
          ]}
        />
        <Text style={[styles.wordBarText, !currentWord ? { opacity: 0.6 } : null]}>{wordBarDisplay}</Text>

        <View style={styles.wordBarActions}>
          <Pressable
            style={({ pressed }) => [styles.smallBtn, pressSoft(pressed), locked && { opacity: 0.5 }]}
            onPress={onBackspace}
            disabled={locked}
          >
            <Text style={styles.smallBtnText}>⌫</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.smallBtn, pressSoft(pressed), locked && { opacity: 0.5 }]}
            onPress={onClear}
            disabled={locked}
          >
            <Text style={styles.smallBtnText}>Clear</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Letter tiles */}
      <View style={styles.tilesCard}>
        <View style={styles.tilesHeader}>
          <Text style={styles.tilesTitle}>Tiles</Text>
          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressSoft(pressed), locked && { opacity: 0.5 }]}
            onPress={onShuffle}
            disabled={locked}
          >
            <Text style={styles.ghostBtnText}>Shuffle</Text>
          </Pressable>
        </View>

        {/* ✅ 7-tile rack (no wrap) */}
        <View style={[styles.tilesRack, { gap: 10 }]}>
          {tileOrder.map((ch, idx) => {
            const picked = pickedIdxs.includes(idx);
            return (
              <Pressable
                key={`${ch}-${idx}`}
                onPress={() => onPressTile(idx)}
                disabled={locked || picked}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tileSize, height: Math.floor(tileSize * 1.25) },
                  picked && styles.tilePicked,
                  pressed && !picked && { opacity: 0.9 },
                  locked && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.tileText, picked && styles.tileTextPicked]}>{ch}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tilesFooter}>
          {timeUp ? <Text style={styles.tilesHint}>Time’s up — submitting…</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.addBtn,
              (locked || currentWordNorm.length < MIN_WORD_LEN) && { opacity: 0.6 },
              pressed && !locked && { opacity: 0.92 },
            ]}
            onPress={addCurrentWord}
            disabled={locked || currentWordNorm.length < MIN_WORD_LEN}
          >
            <Text style={styles.addBtnText}>Add Word</Text>
          </Pressable>
        </View>
      </View>

      {/* Found words list */}
      <View style={styles.listCard}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Found</Text>
          <Text style={styles.listMeta}>
            {found.length} words • Best: {bestWord ? bestWord.word.toUpperCase() : "—"}
          </Text>
        </View>

        <FlatList
          data={found}
          keyExtractor={(x) => x.word}
          contentContainerStyle={{ paddingBottom: 72 }}
          renderItem={({ item }) => {
            const sum = item.points + item.bonus;
            return (
              <View style={styles.row}>
                <Text style={styles.rowWord}>{item.word.toUpperCase()}</Text>
                <View style={styles.rowRight}>
                  {item.bonus > 0 ? <Text style={styles.rowBonus}>+{item.bonus}</Text> : null}
                  <Text style={styles.rowPoints}>+{sum}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No words yet. Tap tiles, then “Add Word”.</Text>}
        />
      </View>

      {/* Bottom actions — attempt auto-submits when the timer hits 0 */}
      <View style={styles.bottomBar}>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressSubtle(pressed)]}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
      </View>

      {/* Loading overlay */}
      {loading ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingTitle}>{dictReady ? "Loading…" : "Loading dictionary…"}</Text>
            <Text style={styles.loadingSub}>
              {dictReady ? "Syncing tiles & preparing attempt" : "Loading word dictionary…"}
            </Text>
          </View>
        </View>
      ) : null}
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 18 },

  hud: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  hudLeft: { flex: 1 },
  hTitle: { color: colors.text, fontSize: 26, fontWeight: "900" },
  hSub: { color: colors.textMuted, fontWeight: "800", marginTop: 4, fontSize: 12 },

  hudRight: { alignItems: "flex-end" },
  scorePill: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 90,
  },
  scorePillLabel: { color: colors.textSecondary, fontWeight: "800", fontSize: 11 },
  scorePillValue: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 2 },

  timerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  timerPill: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 90,
  },
  timerLabel: { color: colors.textMuted, fontWeight: "800", fontSize: 11 },
  timerValue: { color: colors.text, fontWeight: "900", fontSize: 16, marginTop: 2 },

  metaPill: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: "flex-start",
  },
  metaLabel: { color: colors.textMuted, fontWeight: "800", fontSize: 11 },
  metaValue: { color: colors.text, fontWeight: "900", fontSize: 16, marginTop: 2 },

  progressWrap: { flex: 1 },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.accent },
  progressHint: { marginTop: 6, color: colors.textMuted, fontWeight: "800", fontSize: 11 },

  wordBar: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(34,197,94,1)" },
  wordBarText: { color: colors.text, fontWeight: "900", fontSize: 16, letterSpacing: 0.5, flex: 1 },
  wordBarActions: { flexDirection: "row", gap: 8, marginLeft: 10 },
  smallBtn: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  smallBtnText: { color: colors.text, fontWeight: "900" },

  tilesCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  tilesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  tilesTitle: { color: colors.text, fontWeight: "900" },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  ghostBtnText: { color: colors.text, fontWeight: "900", fontSize: 12 },

  // ✅ rack row
  tilesRack: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tile: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tilePicked: { backgroundColor: "rgba(79,70,229,0.25)", borderColor: "rgba(79,70,229,0.55)" },
  tileText: { color: colors.text, fontWeight: "900", fontSize: 18 },
  tileTextPicked: { color: colors.text },

  tilesFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10 },
  tilesHint: { color: "rgba(255,255,255,0.55)", fontWeight: "800", flex: 1, fontSize: 12 },
  addBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: colors.text, fontWeight: "900" },

  listCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    flex: 1,
  },
  listHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 },
  listTitle: { color: colors.text, fontWeight: "900" },
  listMeta: { color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 11, flexShrink: 1, textAlign: "right" },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  rowWord: { color: colors.text, fontWeight: "900", letterSpacing: 0.4 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowBonus: { color: "rgba(34,197,94,0.95)", fontWeight: "900" },
  rowPoints: { color: "rgba(255,255,255,0.75)", fontWeight: "900" },

  emptyText: { color: "rgba(255,255,255,0.5)", fontWeight: "800", marginTop: 12 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    paddingBottom: 18,
    backgroundColor: "rgba(5,8,25,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: "900" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,8,25,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  loadingTitle: { color: colors.text, fontWeight: "900", fontSize: 16 },
  loadingSub: { color: "rgba(255,255,255,0.6)", fontWeight: "800", marginTop: 6 },
});
