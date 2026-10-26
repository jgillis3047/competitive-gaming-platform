// app/phone-games/twenty48.tsx – 2048-style game
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { submitChallengeResult } from "../../lib/backend/challengeActions";
import { useAuthStore } from "../../lib/data/authStore";
import { mediumTap, success as hapticSuccess } from "../../lib/utils/haptics";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon, pressSubtle } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const SWIPE_THRESHOLD = 12;

const GAME_KEY = "2048";

type Direction = "up" | "down" | "left" | "right";

type Board = number[][];

const SIZE = 4;
const BOARD_MAX = Math.min(Dimensions.get("window").width - 32, 380);
const CELL_GAP = 8;
const BOARD_PADDING = 10;
const CELL_SIZE = (BOARD_MAX - BOARD_PADDING * 2 - CELL_GAP * (SIZE - 1)) / SIZE;

function createEmptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function getEmptyCells(board: Board): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

function addRandomTile(board: Board): Board {
  const empty = getEmptyCells(board);
  if (!empty.length) return board;
  const choice = empty[Math.floor(Math.random() * empty.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  const next = cloneBoard(board);
  next[choice.row][choice.col] = value;
  return next;
}

function rotateBoard(board: Board): Board {
  const res: Board = createEmptyBoard();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      res[c][SIZE - 1 - r] = board[r][c];
    }
  }
  return res;
}

function moveLeft(board: Board): { board: Board; scoreDelta: number; moved: boolean } {
  let moved = false;
  let scoreDelta = 0;
  const next: Board = createEmptyBoard();

  for (let r = 0; r < SIZE; r++) {
    const row = board[r].filter((v) => v !== 0);
    const newRow: number[] = [];
    let skip = false;
    for (let i = 0; i < row.length; i++) {
      if (skip) {
        skip = false;
        continue;
      }
      if (i + 1 < row.length && row[i] === row[i + 1]) {
        const merged = row[i] * 2;
        newRow.push(merged);
        scoreDelta += merged;
        skip = true;
        moved = true;
      } else {
        newRow.push(row[i]);
      }
    }
    while (newRow.length < SIZE) {
      newRow.push(0);
    }
    for (let c = 0; c < SIZE; c++) {
      if (newRow[c] !== board[r][c]) moved = true;
      next[r][c] = newRow[c];
    }
  }

  return { board: next, scoreDelta, moved };
}

function move(board: Board, dir: Direction): { board: Board; scoreDelta: number; moved: boolean } {
  let working = board;
  let times = 0;
  if (dir === "up") times = 3;
  if (dir === "right") times = 2;
  if (dir === "down") times = 1;

  for (let i = 0; i < times; i++) {
    working = rotateBoard(working);
  }

  const { board: movedBoard, scoreDelta, moved } = moveLeft(working);

  let final = movedBoard;
  for (let i = 0; i < (4 - times) % 4; i++) {
    final = rotateBoard(final);
  }

  return { board: final, scoreDelta, moved };
}

function hasMoves(board: Board): boolean {
  if (getEmptyCells(board).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      if (r + 1 < SIZE && board[r + 1][c] === v) return true;
      if (c + 1 < SIZE && board[r][c + 1] === v) return true;
    }
  }
  return false;
}

function tileFontSize(value: number) {
  if (value >= 1024) return 22;
  if (value >= 128) return 26;
  if (value >= 16) return 30;
  return 34;
}

export default function Twenty48Screen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params?.challengeId ? String(params.challengeId) : null;
  const inChallenge = !!challengeId;
  const user = useAuthStore((s) => s.user);

  const [board, setBoard] = useState<Board>(() => addRandomTile(addRandomTile(createEmptyBoard())));
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { showPracticeResult, showChallengeSubmitted, ResultModal } = useGameResultFlow(
    GAME_KEY,
    "2048",
    challengeId
  );

  const maxTile = useMemo(
    () => board.reduce((m, row) => Math.max(m, ...row), 0),
    [board]
  );

  const reset = () => {
    setBoard(addRandomTile(addRandomTile(createEmptyBoard())));
    setScore(0);
    setGameOver(false);
    setSubmitting(false);
  };

  const finishIfNeeded = async () => {
    if (hasMoves(board)) return;
    setGameOver(true);

    if (!inChallenge) {
      await showPracticeResult(
        {
          score,
          scoreLabel: `Score ${score}`,
          timeLabel: `Best tile ${maxTile}`,
        },
        reset
      );
      return;
    }

    if (!user?.id || submitting) return;
    setSubmitting(true);
    try {
      await submitChallengeResult({
        challengeId: challengeId!,
        userId: user.id,
        score,
        scoreSort: "desc",
      });
      await showChallengeSubmitted({
        score,
        scoreLabel: `Score ${score}`,
        timeLabel: `Best tile ${maxTile}`,
      });
    } catch (e: any) {
      Alert.alert("Submit failed", e?.message ?? "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const boardRef = useRef(board);
  const gameOverRef = useRef(gameOver);
  const submittingRef = useRef(submitting);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const handleMove = (dir: Direction) => {
    if (gameOverRef.current || submittingRef.current) return;
    const { board: movedBoard, scoreDelta, moved } = move(boardRef.current, dir);
    if (!moved) return;
    mediumTap();
    if (scoreDelta > 0) hapticSuccess();
    const withTile = addRandomTile(movedBoard);
    setBoard(withTile);
    setScore((s) => s + scoreDelta);
  };

  const handleMoveRef = useRef(handleMove);
  handleMoveRef.current = handleMove;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !gameOverRef.current && !submittingRef.current,
      onMoveShouldSetPanResponder: () => !gameOverRef.current && !submittingRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gesture) => {
        const { dx, dy } = gesture;
        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
          handleMoveRef.current(dx > 0 ? "right" : "left");
        } else {
          handleMoveRef.current(dy > 0 ? "down" : "up");
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!gameOver) {
      finishIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, gameOver]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "2048", headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.topBtn, pressSoftIcon(pressed)]}
        >
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>2048</Text>
        {!inChallenge ? (
          <Pressable
            onPress={reset}
            style={({ pressed }) => [styles.resetBtn, pressSubtle(pressed)]}
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        ) : (
          <View style={styles.topBarSpacer} />
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Score</Text>
          <Text style={styles.statValue}>{score}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Best</Text>
          <Text style={styles.statValue}>{maxTile || "—"}</Text>
        </View>
      </View>

      <View style={styles.playArea}>
        <View
          style={[styles.board, { width: BOARD_MAX, height: BOARD_MAX }]}
          {...panResponder.panHandlers}
        >
          {Array.from({ length: SIZE * SIZE }).map((_, i) => (
            <View
              key={`well-${i}`}
              style={[
                styles.cellWell,
                {
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  left: BOARD_PADDING + (i % SIZE) * (CELL_SIZE + CELL_GAP),
                  top: BOARD_PADDING + Math.floor(i / SIZE) * (CELL_SIZE + CELL_GAP),
                },
              ]}
            />
          ))}

          {board.map((row, rIdx) =>
            row.map((value, cIdx) => {
              if (value === 0) return null;
              const palette = tilePalette[value] ?? tilePalette[2048];
              return (
                <View
                  key={`${rIdx}-${cIdx}-${value}`}
                  style={[
                    styles.tile,
                    {
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      left: BOARD_PADDING + cIdx * (CELL_SIZE + CELL_GAP),
                      top: BOARD_PADDING + rIdx * (CELL_SIZE + CELL_GAP),
                      backgroundColor: palette.bg,
                    },
                  ]}
                >
                  <Text style={[styles.tileText, { color: palette.text, fontSize: tileFontSize(value) }]}>
                    {value}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>
      <ResultModal />
    </View>
  );
}

const tilePalette: Record<number, { bg: string; text: string }> = {
  2: { bg: "#4a5568", text: "#f8fafc" },
  4: { bg: "#5b6478", text: "#f8fafc" },
  8: { bg: "#7c3aed", text: "#f8fafc" },
  16: { bg: "#6d28d9", text: "#f8fafc" },
  32: { bg: "#b45309", text: "#fff7ed" },
  64: { bg: "#c2410c", text: "#fff7ed" },
  128: { bg: "#d97706", text: "#fffbeb" },
  256: { bg: "#ca8a04", text: "#fffbeb" },
  512: { bg: "#16a34a", text: "#f0fdf4" },
  1024: { bg: "#2563eb", text: "#eff6ff" },
  2048: { bg: "#f59e0b", text: "#1c1917" },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  topBtn: { marginRight: 12, minWidth: 44 },
  topBtnText: { color: colors.text, fontWeight: "700" },
  topTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  topBarSpacer: { minWidth: 44 },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  statValue: { color: colors.warning, fontSize: 36, fontWeight: "900", marginTop: 2 },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    minWidth: 44,
    alignItems: "center",
  },
  resetText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  playArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
    paddingBottom: 24,
  },
  board: {
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cellWell: {
    position: "absolute",
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  tile: {
    position: "absolute",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    fontWeight: "900",
  },
});
