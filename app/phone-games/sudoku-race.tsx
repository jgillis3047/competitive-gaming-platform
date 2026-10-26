// app/phone-games/sudoku-race.tsx
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { submitChallengeTime } from "../../lib/backend/challengeActions";
import { supabase } from "../../lib/backend/supabaseClient";
import {
  Difficulty,
  generatePuzzle,
  getCandidates,
  getConflicts,
  isSolvedCorrectly,
  type SudokuPuzzle,
} from "../../lib/games/sudoku";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoft, pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Sudoku Race";

type CellMode = "normal" | "notes";

type HistoryEntry = { grid: number[]; notes: Record<number, number[]> };

type SeedEvent = { id: string; type: string; payload: any; created_at: string };

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function SudokuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ difficulty?: Difficulty; challengeId?: string }>();
  const defaultDifficulty: Difficulty = (params.difficulty as Difficulty) || "medium";
  const challengeId = params.challengeId ? String(params.challengeId) : null;

  const [loading, setLoading] = useState(!!challengeId);
  const [puzzleData, setPuzzleData] = useState<SudokuPuzzle>(() => generatePuzzle(defaultDifficulty));
  const { puzzle, solution } = puzzleData;

  const givens = useMemo(
    () => new Set(puzzle.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0)),
    [puzzle]
  );

  const [grid, setGrid] = useState<number[]>(() => puzzle.slice());
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<CellMode>("normal");
  const [showMistakes, setShowMistakes] = useState(true);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [, setHistory] = useState<HistoryEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const didAutoSubmitRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "Sudoku Race",
    challengeId
  );

  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  const conflicts = useMemo(
    () => (showMistakes ? getConflicts(grid) : new Set<number>()),
    [grid, showMistakes]
  );

  const selectedRC = useMemo(() => (selected == null ? null : { r: Math.floor(selected / 9), c: selected % 9 }), [selected]);

  const selectedCandidates = useMemo(() => {
    if (!selectedRC || selected == null || givens.has(selected) || grid[selected] !== 0) return [];
    return getCandidates(grid, selectedRC.r, selectedRC.c);
  }, [grid, selected, selectedRC, givens]);

  const pushHistory = (nextGrid: number[], nextNotes: Record<number, number[]>) => {
    const notesCopy: Record<number, number[]> = JSON.parse(JSON.stringify(notes));
    setHistory((h) => [...h, { grid: grid.slice(), notes: notesCopy }]);
    setGrid(nextGrid);
    setNotes(nextNotes);
  };

  const setValue = (val: number) => {
    if (selected == null || givens.has(selected)) return;
    const nextGrid = grid.slice();
    const nextNotes = { ...notes };
    if (mode === "notes") {
      const cur = new Set(nextNotes[selected] ?? []);
      if (val === 0) delete nextNotes[selected];
      else {
        if (cur.has(val)) cur.delete(val);
        else cur.add(val);
        nextNotes[selected] = Array.from(cur).sort((a, b) => a - b);
      }
    } else {
      nextGrid[selected] = val;
      if (val !== 0) delete nextNotes[selected];
    }
    pushHistory(nextGrid, nextNotes);
  };

  const handleUndo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setGrid(prev.grid);
      setNotes(prev.notes);
      return h.slice(0, -1);
    });
  };

  const handleNewGame = (d: Difficulty) => {
    if (challengeId) return;
    const next = generatePuzzle(d);
    setPuzzleData(next);
    setGrid(next.puzzle.slice());
    setNotes({});
    setHistory([]);
    setSelected(null);
    setElapsed(0);
    didAutoSubmitRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const handleHint = () => {
    if (selected == null || givens.has(selected)) return;
    const correct = solution[selected];
    if (!correct) return;
    const nextGrid = grid.slice();
    nextGrid[selected] = correct;
    const nextNotes = { ...notes };
    delete nextNotes[selected];
    pushHistory(nextGrid, nextNotes);
  };

  const handleSolve = () => {
    if (challengeId) return;
    Alert.alert("Solve puzzle?", "This will fill in the entire solution.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Solve",
        style: "destructive",
        onPress: () => {
          const notesCopy: Record<number, number[]> = JSON.parse(JSON.stringify(notes));
          setHistory((h) => [...h, { grid: grid.slice(), notes: notesCopy }]);
          setGrid(solution.slice());
          setNotes({});
        },
      },
    ]);
  };

  const handleCheck = () => {
    const ok = isSolvedCorrectly(grid, solution);
    if (ok) Alert.alert("✅ Completed!", `Time: ${formatTime(elapsed)}`);
    else Alert.alert("Not finished yet", "Keep going — or toggle mistakes to see conflicts.");
  };

  // Shared seed for challenge
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
        if (
          existing?.payload?.game === "Sudoku Race" &&
          Array.isArray(existing.payload.puzzle) &&
          Array.isArray(existing.payload.solution) &&
          existing.payload.puzzle.length === 81 &&
          existing.payload.solution.length === 81
        ) {
          const pd = {
            puzzle: existing.payload.puzzle as number[],
            solution: existing.payload.solution as number[],
          };
          if (mounted) {
            setPuzzleData(pd);
            setGrid(pd.puzzle.slice());
          }
        } else {
          const next = generatePuzzle(defaultDifficulty);
          const { error: insErr } = await supabase.from("challenge_events").insert({
            challenge_id: challengeId,
            type: "game_seed",
            actor_user_id: (await supabase.auth.getUser()).data?.user?.id ?? null,
            body: "Game seed created.",
            payload: {
              game: "Sudoku Race",
              puzzle: next.puzzle,
              solution: next.solution,
              difficulty: defaultDifficulty,
              seedVersion: 1,
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
            const p = ex2?.payload?.puzzle;
            const s = ex2?.payload?.solution;
            if (Array.isArray(p) && Array.isArray(s) && p.length === 81 && s.length === 81 && mounted) {
              setPuzzleData({ puzzle: p, solution: s });
              setGrid(p.slice());
            } else if (mounted) {
              setPuzzleData(next);
              setGrid(next.puzzle.slice());
            }
          } else if (mounted) {
            setPuzzleData(next);
            setGrid(next.puzzle.slice());
          }
        }
      } catch {
        if (mounted) {
          const next = generatePuzzle(defaultDifficulty);
          setPuzzleData(next);
          setGrid(next.puzzle.slice());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [challengeId, defaultDifficulty]);

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
    if (didAutoSubmitRef.current) return;
    if (!isSolvedCorrectly(grid, solution)) return;
    didAutoSubmitRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (challengeId) {
      (async () => {
        try {
          setIsSubmitting(true);
          const { data: auth } = await supabase.auth.getUser();
          const userId = auth?.user?.id;
          if (!userId) throw new Error("Not signed in.");
          await submitChallengeTime(challengeId, userId, elapsed);
          const s = await showChallengeSubmitted({
            score: 1,
            timeSec: elapsed,
            scoreLabel: "Puzzle solved",
            timeLabel: formatTime(elapsed),
          });
          setProgress(s.progress);
          hapticSuccess();
        } catch (e: any) {
          didAutoSubmitRef.current = false;
          Alert.alert("Submit failed", e?.message ?? "Please try again.");
        } finally {
          setIsSubmitting(false);
        }
      })();
    } else {
      void (async () => {
        const s = await showPracticeResult(
          {
            score: 1,
            timeSec: elapsed,
            scoreLabel: "Puzzle solved",
            timeLabel: formatTime(elapsed),
          },
          () => {
            didAutoSubmitRef.current = false;
            setGrid(puzzle.slice());
            setElapsed(0);
            setSelected(null);
            setNotes({});
            setHistory([]);
          }
        );
        setProgress(s.progress);
        hapticSuccess();
      })();
    }
  }, [grid, solution, elapsed, challengeId, puzzle, showPracticeResult, showChallengeSubmitted]);

  const renderCell = (i: number) => {
    const v = grid[i];
    const isGiven = givens.has(i);
    const isSel = selected === i;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const boxR = Math.floor(r / 3);
    const boxC = Math.floor(c / 3);
    const sameRow = selected != null && Math.floor(selected / 9) === r;
    const sameCol = selected != null && selected % 9 === c;
    const sameBox = selected != null && Math.floor(Math.floor(selected / 9) / 3) === boxR && Math.floor((selected % 9) / 3) === boxC;
    const highlight = isSel || sameRow || sameCol || sameBox;
    const bad = conflicts.has(i);
    return (
      <Pressable
        key={i}
        style={[
          styles.cell,
          highlight && styles.cellHighlight,
          isSel && styles.cellSelected,
          bad && styles.cellBad,
          c % 3 === 0 && styles.borderLeftThick,
          r % 3 === 0 && styles.borderTopThick,
          c === 8 && styles.borderRightThick,
          r === 8 && styles.borderBottomThick,
        ]}
        onPress={() => setSelected(i)}
      >
        {v !== 0 ? (
          <Text style={[styles.cellText, isGiven ? styles.givenText : styles.filledText]}>{v}</Text>
        ) : notes[i]?.length ? (
          <View style={styles.notesWrap}>
            {Array.from({ length: 9 }).map((_, k) => {
              const n = k + 1;
              const on = notes[i]?.includes(n);
              return <Text key={n} style={[styles.noteText, !on && styles.noteOff]}>{on ? n : " "}</Text>;
            })}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const NumberButton = ({ n }: { n: number }) => {
    const disabled =
      selected == null ||
      givens.has(selected) ||
      (mode === "normal" && n !== 0 && selectedCandidates.length > 0 && !selectedCandidates.includes(n));
    return (
      <Pressable
        style={[styles.numBtn, disabled && styles.numBtnDisabled]}
        onPress={() => !disabled && setValue(n)}
      >
        <Text style={styles.numBtnText}>{n === 0 ? "⌫" : n}</Text>
      </Pressable>
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
      <Stack.Screen options={{ title: "Sudoku Race", headerShown: false }} />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Sudoku Race</Text>
          <Text style={styles.topSub}>
            {formatTime(elapsed)}
            {challengeId ? " • Challenge" : ""}
            {isSubmitting ? " • Submitting…" : ""}
          </Text>
        </View>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoftIcon(pressed)]}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
      <View style={styles.board}>{Array.from({ length: 81 }).map((_, i) => renderCell(i))}</View>
      <View style={styles.actionsRow}>
        <Pressable style={({ pressed }) => [styles.actionBtn, pressSoft(pressed)]} onPress={handleUndo}>
          <Text style={styles.actionText}>Undo</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, mode === "notes" && styles.actionBtnOn]}
          onPress={() => setMode((m) => (m === "notes" ? "normal" : "notes"))}
        >
          <Text style={styles.actionText}>{mode === "notes" ? "Notes: ON" : "Notes"}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, showMistakes && styles.actionBtnOn]}
          onPress={() => setShowMistakes((v) => !v)}
        >
          <Text style={styles.actionText}>{showMistakes ? "Mistakes: ON" : "Mistakes"}</Text>
        </Pressable>
      </View>
      <View style={styles.keypad}>
        <View style={styles.keypadRow}>{[1, 2, 3].map((n) => <NumberButton key={n} n={n} />)}</View>
        <View style={styles.keypadRow}>{[4, 5, 6].map((n) => <NumberButton key={n} n={n} />)}</View>
        <View style={styles.keypadRow}>{[7, 8, 9].map((n) => <NumberButton key={n} n={n} />)}</View>
        <View style={styles.keypadRow}>
          <NumberButton n={0} />
          <Pressable style={({ pressed }) => [styles.wideBtn, pressSoft(pressed)]} onPress={handleHint}>
            <Text style={styles.wideBtnText}>Hint</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.wideBtn, pressSoft(pressed)]} onPress={handleCheck}>
            <Text style={styles.wideBtnText}>Check</Text>
          </Pressable>
        </View>
        {!challengeId && (
          <View style={styles.bottomRow}>
            <Pressable style={({ pressed }) => [styles.bottomBtn, pressSoft(pressed)]} onPress={handleSolve}>
              <Text style={styles.bottomBtnText}>Solve</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.bottomBtn, pressSoft(pressed)]}
              onPress={() =>
                Alert.alert("New game", "Pick a difficulty", [
                  { text: "Easy", onPress: () => handleNewGame("easy") },
                  { text: "Medium", onPress: () => handleNewGame("medium") },
                  { text: "Hard", onPress: () => handleNewGame("hard") },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            >
              <Text style={styles.bottomBtnText}>New</Text>
            </Pressable>
          </View>
        )}
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 50 },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.textSecondary, fontWeight: "800" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  topTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  topSub: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  backBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  backBtnText: { color: colors.text, fontWeight: "800" },
  board: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cell: { width: "11.1111%", height: "11.1111%", borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  borderLeftThick: { borderLeftWidth: 2, borderLeftColor: "rgba(255,255,255,0.12)" },
  borderTopThick: { borderTopWidth: 2, borderTopColor: "rgba(255,255,255,0.12)" },
  borderRightThick: { borderRightWidth: 2, borderRightColor: "rgba(255,255,255,0.12)" },
  borderBottomThick: { borderBottomWidth: 2, borderBottomColor: "rgba(255,255,255,0.12)" },
  cellHighlight: { backgroundColor: colors.surfaceMuted },
  cellSelected: { backgroundColor: colors.accentSurface },
  cellBad: { backgroundColor: "rgba(239,68,68,0.25)" },
  cellText: { fontSize: 18, fontWeight: "800" },
  givenText: { color: colors.text },
  filledText: { color: "#93c5fd" },
  notesWrap: { width: "100%", height: "100%", flexDirection: "row", flexWrap: "wrap", padding: 2 },
  noteText: { width: "33.333%", height: "33.333%", textAlign: "center", fontSize: 9, color: colors.textSecondary },
  noteOff: { color: "transparent" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  actionBtnOn: { backgroundColor: "rgba(99,102,241,0.25)", borderColor: "rgba(99,102,241,0.4)" },
  actionText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  keypad: { marginTop: 14 },
  keypadRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  numBtn: { flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  numBtnDisabled: { opacity: 0.4 },
  numBtnText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  wideBtn: { flex: 2, backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  wideBtnText: { color: colors.text, fontWeight: "900" },
  bottomRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  bottomBtn: { flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 10, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong },
  bottomBtnText: { color: colors.text, fontWeight: "900" },
  hintLine: { color: colors.textMuted, fontSize: 12, marginTop: 14, textAlign: "center" },
});
