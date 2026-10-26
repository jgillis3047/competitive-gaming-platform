// app/phone-games/math-24.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { error as hapticError, selection as hapticSelection, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Math 24";
const TARGET = 24;
const EPS = 1e-6;
const HINTS_PER_PUZZLE = 5;
const SESSION_GOAL = 20;
const SUBMIT_TIMEOUT_MS = 30_000;
const VALID_SET_COUNTS = new Set([1, 3, 5, 10]);

type Op = "+" | "-" | "*" | "/";

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

type HintStep = { i: number; j: number; op: Op };

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function opSymbol(op: Op) {
  if (op === "*") return "×";
  if (op === "/") return "÷";
  return op;
}

function applyOp(a: number, b: number, op: Op) {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (Math.abs(b) < EPS) throw new Error("Division by zero.");
  return a / b;
}

function isTargetValue(value: number) {
  return Math.abs(value - TARGET) < 1e-3;
}

function trySolve24(nums: number[]): boolean {
  const arr = nums.map((n) => n * 1.0);
  function rec(values: number[]): boolean {
    if (values.length === 1) return isTargetValue(values[0]);
    for (let i = 0; i < values.length; i++) {
      for (let j = 0; j < values.length; j++) {
        if (i === j) continue;
        const a = values[i];
        const b = values[j];
        const rest: number[] = [];
        for (let k = 0; k < values.length; k++) if (k !== i && k !== j) rest.push(values[k]);
        const candidates: number[] = [a + b, a - b, a * b];
        if (Math.abs(b) > EPS) candidates.push(a / b);
        if (Math.abs(a) > EPS) candidates.push(b / a);
        for (const c of candidates) if (rec([...rest, c])) return true;
      }
    }
    return false;
  }
  return rec(arr);
}

function generateSolvable(): number[] {
  for (let tries = 0; tries < 2000; tries++) {
    const nums = [
      1 + Math.floor(Math.random() * 9),
      1 + Math.floor(Math.random() * 9),
      1 + Math.floor(Math.random() * 9),
      1 + Math.floor(Math.random() * 9),
    ];
    if (trySolve24(nums)) return nums;
  }
  return [3, 3, 8, 8];
}

function generatePuzzleSet(count: number): number[][] {
  const puzzles: number[][] = [];
  for (let i = 0; i < count; i++) puzzles.push(generateSolvable());
  return puzzles;
}

function normalizeSetCount(raw: unknown): number {
  const n = Number(raw);
  if (VALID_SET_COUNTS.has(n)) return n;
  return 1;
}

function activeValues(cells: (number | null)[]) {
  return cells.filter((v): v is number => v != null);
}

function findHintStep(cells: (number | null)[]): HintStep | null {
  type Item = { idx: number; val: number };
  const items: Item[] = cells
    .map((v, idx) => (v != null ? { idx, val: v } : null))
    .filter((x): x is Item => x != null);

  function solvable(itemsIn: Item[]): boolean {
    const vals = itemsIn.map((x) => x.val);
    if (vals.length === 1) return isTargetValue(vals[0]);
    for (let i = 0; i < itemsIn.length; i++) {
      for (let j = 0; j < itemsIn.length; j++) {
        if (i === j) continue;
        const a = itemsIn[i].val;
        const b = itemsIn[j].val;
        const rest = itemsIn.filter((_, k) => k !== i && k !== j);
        const candidates: { op: Op; result: number }[] = [
          { op: "+", result: a + b },
          { op: "-", result: a - b },
          { op: "*", result: a * b },
        ];
        if (Math.abs(b) > EPS) candidates.push({ op: "/", result: a / b });
        for (const c of candidates) {
          if (solvable([...rest, { idx: itemsIn[i].idx, val: c.result }])) return true;
        }
      }
    }
    return false;
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = items[i].val;
      const b = items[j].val;
      const rest = items.filter((_, k) => k !== i && k !== j);
      const candidates: { op: Op; result: number }[] = [
        { op: "+", result: a + b },
        { op: "-", result: a - b },
        { op: "*", result: a * b },
      ];
      if (Math.abs(b) > EPS) candidates.push({ op: "/", result: a / b });
      for (const c of candidates) {
        if (solvable([...rest, { idx: items[i].idx, val: c.result }])) {
          return { i: items[i].idx, j: items[j].idx, op: c.op };
        }
      }
    }
  }
  return null;
}

function formatValue(n: number) {
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function puzzlesFromSeedPayload(payload: any): { puzzles: number[][]; setCount: number } | null {
  if (payload?.game !== "Math 24") return null;
  if (Array.isArray(payload.puzzles) && payload.puzzles.length > 0) {
    const puzzles = payload.puzzles.filter((p: unknown) => Array.isArray(p) && p.length === 4) as number[][];
    if (puzzles.length > 0) {
      return { puzzles, setCount: normalizeSetCount(payload.setCount ?? puzzles.length) };
    }
  }
  if (Array.isArray(payload.nums) && payload.nums.length === 4) {
    return { puzzles: [payload.nums], setCount: 1 };
  }
  return null;
}

export default function Math24Screen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const user = useAuthStore((s) => s.user);
  const inChallenge = !!challengeId;

  const [loading, setLoading] = useState(!!challengeId);
  const [puzzles, setPuzzles] = useState<number[][]>(() => [generateSolvable()]);
  const [setCount, setSetCount] = useState(1);
  const [setIndex, setSetIndex] = useState(0);
  const [seedNums, setSeedNums] = useState<number[]>(() => generateSolvable());
  const [cells, setCells] = useState<(number | null)[]>(() => generateSolvable());
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [selectedOp, setSelectedOp] = useState<Op | null>(null);
  const [hintsLeft, setHintsLeft] = useState(HINTS_PER_PUZZLE);
  const [sessionPuzzle, setSessionPuzzle] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Math 24",
    challengeId
  );

  const tileSize = useMemo(() => {
    const cardWidth = Math.min(width - 32, 400);
    const inner = cardWidth - 48 - 16;
    return Math.min(Math.floor(inner / 2), 148);
  }, [width]);

  const opBtnSize = useMemo(() => Math.min(Math.floor((tileSize * 2 + 16 - 36) / 4), 72), [tileSize]);

  const progressLabel = useMemo(() => {
    if (inChallenge) {
      return setCount > 1 ? `Set ${setIndex + 1} / ${setCount}` : formatTime(elapsed);
    }
    return `Puzzle ${sessionPuzzle} / ${SESSION_GOAL}`;
  }, [inChallenge, setCount, setIndex, elapsed, sessionPuzzle]);

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [loading]);

  useEffect(() => {
    if (!challengeId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const [{ data: createdEvent }, { data: seedEvents, error: seedErr }] = await Promise.all([
          supabase
            .from("challenge_events")
            .select("payload")
            .eq("challenge_id", challengeId)
            .eq("type", "challenge_created")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("challenge_events")
            .select("id, type, payload, created_at")
            .eq("challenge_id", challengeId)
            .eq("type", "game_seed")
            .order("created_at", { ascending: true })
            .limit(1),
        ]);

        if (seedErr) throw seedErr;

        const configuredSets = normalizeSetCount(createdEvent?.payload?.phone_rules?.set_count);
        const existing = (seedEvents as SeedEvent[] | null)?.[0] ?? null;
        const parsed = existing ? puzzlesFromSeedPayload(existing.payload) : null;

        if (parsed) {
          if (mounted) {
            setSetCount(parsed.setCount);
            setPuzzles(parsed.puzzles);
            setSetIndex(0);
            setSeedNums(parsed.puzzles[0]);
            setCells(parsed.puzzles[0].slice());
          }
          return;
        }

        const newPuzzles = generatePuzzleSet(configuredSets);
        const { error: insErr } = await supabase.from("challenge_events").insert({
          challenge_id: challengeId,
          type: "game_seed",
          actor_user_id: user?.id ?? null,
          body: "Game seed created.",
          payload: {
            game: "Math 24",
            setCount: configuredSets,
            puzzles: newPuzzles,
            seedVersion: 2,
          },
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
          const retry = ex2 ? puzzlesFromSeedPayload(ex2.payload) : null;
          if (retry && mounted) {
            setSetCount(retry.setCount);
            setPuzzles(retry.puzzles);
            setSetIndex(0);
            setSeedNums(retry.puzzles[0]);
            setCells(retry.puzzles[0].slice());
          } else if (mounted) {
            setSetCount(configuredSets);
            setPuzzles(newPuzzles);
            setSetIndex(0);
            setSeedNums(newPuzzles[0]);
            setCells(newPuzzles[0].slice());
          }
        } else if (mounted) {
          setSetCount(configuredSets);
          setPuzzles(newPuzzles);
          setSetIndex(0);
          setSeedNums(newPuzzles[0]);
          setCells(newPuzzles[0].slice());
        }
      } catch {
        if (mounted) {
          const fallback = generateSolvable();
          setSetCount(1);
          setPuzzles([fallback]);
          setSetIndex(0);
          setSeedNums(fallback);
          setCells(fallback.slice());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [challengeId, user?.id]);

  const confirmExit = () => {
    if (!challengeId) return router.back();
    Alert.alert("Leave game?", "You can come back and continue.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const clearSelection = () => {
    setSelectedCell(null);
    setSelectedOp(null);
  };

  const resetBoard = () => {
    setCells(seedNums.slice());
    clearSelection();
  };

  const loadNewPuzzle = () => {
    if (challengeId) return;
    const next = generateSolvable();
    setSeedNums(next);
    setCells(next.slice());
    setHintsLeft(HINTS_PER_PUZZLE);
    clearSelection();
    setElapsed(0);
    setFinished(false);
  };

  const loadSet = (index: number, puzzleList: number[][]) => {
    const nums = puzzleList[index] ?? puzzleList[0];
    setSeedNums(nums);
    setCells(nums.slice());
    clearSelection();
    setHintsLeft(HINTS_PER_PUZZLE);
  };

  const advanceToNextSet = () => {
    const nextIndex = setIndex + 1;
    setSetIndex(nextIndex);
    loadSet(nextIndex, puzzles);
  };

  const finishPractice = async (timeSec: number) => {
    try {
      const s = await showPracticeResult(
        {
          score: 1,
          timeSec,
          timeLabel: `Solved in ${formatTime(timeSec)}`,
        },
        () => {
          setSessionPuzzle((n) => n + 1);
          loadNewPuzzle();
        }
      );
      setProgress(s.progress);
    } catch (e: any) {
      Alert.alert("Could not save run", e?.message ?? "Something went wrong.");
      setFinished(false);
    }
  };

  const finishChallenge = async (timeSec: number) => {
    if (!challengeId || !user?.id) {
      Alert.alert("Sign in required", "You must be logged in to submit results.");
      setFinished(false);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Check your connection and try again.")), SUBMIT_TIMEOUT_MS)
      );
      await Promise.race([
        submitChallengeResult({
          challengeId,
          userId: user.id,
          score: timeSec,
          scoreSort: "asc",
        }),
        timeoutPromise,
      ]);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      const setsLabel = setCount > 1 ? `${setCount} sets` : "1 set";
      const s = await showChallengeSubmitted({
        score: 1,
        timeSec,
        timeLabel: `${setsLabel} in ${formatTime(timeSec)}`,
      });
      setProgress(s.progress);
    } catch (e: any) {
      setFinished(false);
      Alert.alert("Submit failed", e?.message ?? "Could not submit result.", [
        { text: "Retry", onPress: () => finishChallenge(timeSec) },
        { text: "Go back", onPress: () => router.replace(`/challenge/${challengeId}` as any) },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleWin = async () => {
    if (finished) return;
    hapticSuccess();
    setFinished(true);

    const timeSec = elapsed;
    const hasMoreSets = inChallenge && setIndex + 1 < setCount;

    if (hasMoreSets) {
      advanceTimerRef.current = setTimeout(() => {
        setFinished(false);
        advanceToNextSet();
      }, 400);
      return;
    }

    if (!inChallenge) {
      await finishPractice(timeSec);
      return;
    }

    await finishChallenge(timeSec);
  };

  const checkEndState = (nextCells: (number | null)[]) => {
    const remaining = activeValues(nextCells);
    if (remaining.length !== 1) return;
    const value = remaining[0];
    if (isTargetValue(value)) {
      void handleWin();
    } else {
      hapticError();
      Alert.alert("Not 24", `You reached ${formatValue(value)}. Tap reset to try again.`, [
        { text: "Reset", onPress: resetBoard },
        { text: "OK", style: "cancel" },
      ]);
    }
  };

  const combineCells = (fromIdx: number, toIdx: number, op: Op) => {
    if (finished || submitting) return;
    const a = cells[fromIdx];
    const b = cells[toIdx];
    if (a == null || b == null) return;
    try {
      const result = applyOp(a, b, op);
      const next = cells.slice();
      next[fromIdx] = result;
      next[toIdx] = null;
      setCells(next);
      clearSelection();
      checkEndState(next);
    } catch (e: any) {
      hapticError();
      Alert.alert("Invalid move", e?.message ?? "That operation is not allowed.");
    }
  };

  const onCellPress = (idx: number) => {
    if (finished || submitting || cells[idx] == null) return;
    hapticSelection();

    if (selectedCell != null && selectedOp != null && idx !== selectedCell) {
      combineCells(selectedCell, idx, selectedOp);
      return;
    }

    setSelectedCell((prev) => (prev === idx ? null : idx));
    if (selectedOp) setSelectedOp(null);
  };

  const onOpPress = (op: Op) => {
    if (finished || submitting) return;
    hapticSelection();
    if (selectedCell == null) {
      Alert.alert("Pick a number", "Select a tile first, then choose an operator.");
      return;
    }
    setSelectedOp((prev) => (prev === op ? null : op));
  };

  const showHint = () => {
    if (inChallenge) return;
    if (hintsLeft <= 0) {
      Alert.alert("No hints left", "Start a new puzzle for fresh hints.");
      return;
    }
    const step = findHintStep(cells);
    if (!step) {
      Alert.alert("No hint", "Try resetting this puzzle.");
      return;
    }
    setHintsLeft((n) => n - 1);
    const a = cells[step.i];
    const b = cells[step.j];
    Alert.alert(
      "Hint",
      `Combine ${formatValue(a!)} and ${formatValue(b!)} using ${opSymbol(step.op)}.`
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading puzzle…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Math 24", headerShown: false }} />

      <Text style={styles.pageTitle}>Math 24</Text>
      <Text style={styles.pageSubtitle}>Combine 4 numbers into 24</Text>

      <View style={styles.card}>
        <View style={styles.cardTopBar}>
          <Pressable onPress={confirmExit} style={({ pressed }) => [styles.backRow, pressSoftIcon(pressed)]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
            <Text style={styles.progressText}>{progressLabel}</Text>
          </Pressable>

          <View style={styles.topActions}>
            {inChallenge && setCount > 1 ? (
              <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
            ) : null}
            <Pressable
              onPress={challengeId ? resetBoard : loadNewPuzzle}
              disabled={finished || submitting}
              style={({ pressed }) => [
                styles.iconBtn,
                pressSoftIcon(pressed),
                (finished || submitting) && styles.iconBtnDisabled,
              ]}
            >
              <Ionicons name="refresh" size={20} color={colors.textSecondary} />
            </Pressable>
            {!inChallenge ? (
              <Pressable onPress={showHint} style={({ pressed }) => [styles.hintBtn, pressSoftIcon(pressed)]}>
                <Ionicons name="bulb-outline" size={18} color={colors.amberBright} />
                <Text style={styles.hintCount}>{hintsLeft}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.grid, { gap: 16 }]}>
          {cells.map((value, idx) => {
            const isSelected = selectedCell === idx;
            const isEmpty = value == null;
            return (
              <Pressable
                key={idx}
                disabled={isEmpty || finished || submitting}
                onPress={() => onCellPress(idx)}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tileSize, height: tileSize },
                  isEmpty && styles.tileEmpty,
                  isSelected && styles.tileSelected,
                  pressed && !isEmpty && !finished && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.tileText, isEmpty && styles.tileTextEmpty]}>
                  {value != null ? formatValue(value) : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.opRow, { gap: 12 }]}>
          {(["+", "-", "*", "/"] as Op[]).map((op) => {
            const active = selectedOp === op;
            return (
              <Pressable
                key={op}
                onPress={() => onOpPress(op)}
                disabled={finished || submitting}
                style={({ pressed }) => [
                  styles.opBtn,
                  { width: opBtnSize, height: opBtnSize },
                  active && styles.opBtnActive,
                  (finished || submitting) && styles.opBtnDisabled,
                  pressSubtle(pressed),
                ]}
              >
                <Text style={[styles.opText, active && styles.opTextActive]}>{opSymbol(op)}</Text>
              </Pressable>
            );
          })}
        </View>

        {submitting ? (
          <View style={styles.submitRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.submitText}>Submitting…</Text>
          </View>
        ) : null}
      </View>

      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 56,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  center: { justifyContent: "center" },
  loadingText: { color: colors.textSecondary, marginTop: 12, fontWeight: "800" },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  pageSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingRight: 8,
  },
  progressText: {
    color: colors.textSecondary,
    fontWeight: "700",
    fontSize: 15,
  },
  timerText: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 15,
    marginRight: 4,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: { opacity: 0.5 },
  hintBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.amberSurface,
    borderWidth: 1,
    borderColor: colors.amberBorder,
  },
  hintCount: {
    color: colors.amberBright,
    fontWeight: "900",
    fontSize: 15,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 28,
  },
  tile: {
    borderRadius: 22,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accentMuted,
  },
  tileEmpty: {
    backgroundColor: colors.bgDeep,
    borderColor: colors.border,
    opacity: 0.45,
  },
  tileText: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900",
  },
  tileTextEmpty: {
    color: colors.textMuted,
  },
  opRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  opBtn: {
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  opBtnActive: {
    backgroundColor: colors.heatBright,
    borderColor: colors.heatBorder,
  },
  opBtnDisabled: { opacity: 0.5 },
  opText: {
    color: colors.heatBright,
    fontSize: 28,
    fontWeight: "900",
  },
  opTextActive: {
    color: colors.text,
  },
  submitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
  },
  submitText: {
    color: colors.textMuted,
    fontWeight: "800",
  },
});
