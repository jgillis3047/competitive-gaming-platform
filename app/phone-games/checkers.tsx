// app/phone-games/checkers.tsx
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Avatar from "../../lib/ui/Avatar";
import { completeTurnBasedChallenge, repairChallengeCompletion } from "../../lib/backend/challengeActions";
import { fetchRecentChallenges } from "../../lib/backend/challenges";
import { useChallengeStore } from "../../lib/data/challengeStore";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";
import { getOrCreateThreadByUsers, upsertThreadPreview } from "../../lib/backend/threadActions";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Checkers";

type ChallengeRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  status: string | null;
  created_by: string | null;
  winner_user_id?: string | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
};

type PlayerRow = {
  user_id: string;
  role: "creator" | "opponent";
};

type TurnRow = {
  challenge_id: string;
  current_turn_user_id: string | null;
  move_count: number | null;
  updated_at: string | null;
  state: any;
};

type ChallengeEventRow = {
  id: string;
  created_at: string;
  type: string;
  body: string | null;
  actor_user_id: string | null;
  payload: any;
};

type Piece = "r" | "R" | "b" | "B" | null;
type Board = Piece[][];
type Coord = { r: number; c: number };

type Move = {
  from: Coord;
  to: Coord;
  isCapture: boolean;
  captured?: Coord;
  promotes?: boolean;
};

type CheckersState = {
  kind: "checkers_v1";
  board: Board;
  must_capture: boolean;
  forced_piece: Coord | null;
  winner_color: "red" | "black" | null;
};

function vStyle(...styles: (StyleProp<ViewStyle> | null | undefined | false)[]) {
  return styles.filter(Boolean) as StyleProp<ViewStyle>;
}

function isTurnBasedGameType(gameType: string | null | undefined) {
  const gt = (gameType ?? "").toLowerCase();
  return gt.includes("checkers");
}

function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice()) as Board;
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isDarkSquare(r: number, c: number) {
  return (r + c) % 2 === 1;
}

function pieceColor(p: Piece): "red" | "black" | null {
  if (!p) return null;
  if (p === "r" || p === "R") return "red";
  if (p === "b" || p === "B") return "black";
  return null;
}

function isKing(p: Piece) {
  return p === "R" || p === "B";
}

function initialBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

  // Red top, Black bottom
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if (isDarkSquare(r, c)) b[r][c] = "r";
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isDarkSquare(r, c)) b[r][c] = "b";
    }
  }
  return b;
}

function dirFor(color: "red" | "black") {
  return color === "red" ? 1 : -1;
}

function coordsEq(a: Coord | null | undefined, b: Coord | null | undefined) {
  if (!a || !b) return false;
  return a.r === b.r && a.c === b.c;
}

function countPieces(board: Board, color: "red" | "black") {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (pieceColor(board[r][c]) === color) n++;
    }
  }
  return n;
}

function listMovesForPiece(board: Board, from: Coord, color: "red" | "black"): Move[] {
  const p = board[from.r][from.c];
  if (!p) return [];
  if (pieceColor(p) !== color) return [];

  const moves: Move[] = [];
  const dirs: [number, number][] = [];
  const base = dirFor(color);

  if (isKing(p)) dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  else dirs.push([base, 1], [base, -1]);

  // Quiet moves
  for (const [dr, dc] of dirs) {
    const nr = from.r + dr;
    const nc = from.c + dc;
    if (!inBounds(nr, nc)) continue;
    if (!isDarkSquare(nr, nc)) continue;
    if (board[nr][nc] !== null) continue;

    const promotes =
      !isKing(p) && ((color === "red" && nr === 7) || (color === "black" && nr === 0));
    moves.push({ from, to: { r: nr, c: nc }, isCapture: false, promotes });
  }

  // Captures
  for (const [dr, dc] of dirs) {
    const mr = from.r + dr;
    const mc = from.c + dc;
    const lr = from.r + dr * 2;
    const lc = from.c + dc * 2;
    if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
    if (!isDarkSquare(lr, lc)) continue;

    const mid = board[mr][mc];
    const land = board[lr][lc];
    if (land !== null) continue;

    const midColor = pieceColor(mid);
    if (!midColor || midColor === color) continue;

    const promotes =
      !isKing(p) && ((color === "red" && lr === 7) || (color === "black" && lr === 0));
    moves.push({
      from,
      to: { r: lr, c: lc },
      isCapture: true,
      captured: { r: mr, c: mc },
      promotes,
    });
  }

  return moves;
}

function listAllMoves(board: Board, color: "red" | "black") {
  const captures: Move[] = [];
  const quiet: Move[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (pieceColor(board[r][c]) !== color) continue;
      const ms = listMovesForPiece(board, { r, c }, color);
      for (const m of ms) (m.isCapture ? captures : quiet).push(m);
    }
  }

  return { captures, quiet };
}

function applyMove(board: Board, move: Move) {
  const b = cloneBoard(board);
  const p = b[move.from.r][move.from.c];
  if (!p) return { board: b, becameKing: false };

  b[move.from.r][move.from.c] = null;

  if (move.isCapture && move.captured) {
    b[move.captured.r][move.captured.c] = null;
  }

  const color = pieceColor(p);
  const shouldPromote =
    !!color &&
    !isKing(p) &&
    ((color === "red" && move.to.r === 7) || (color === "black" && move.to.r === 0));

  let placed: Piece = p;
  let becameKing = false;

  if (shouldPromote) {
    placed = color === "red" ? "R" : "B";
    becameKing = true;
  }

  b[move.to.r][move.to.c] = placed;
  return { board: b, becameKing };
}

function computeMustCapture(board: Board, color: "red" | "black") {
  return listAllMoves(board, color).captures.length > 0;
}

function hasAnyMove(board: Board, color: "red" | "black") {
  const all = listAllMoves(board, color);
  return all.captures.length > 0 || all.quiet.length > 0;
}

function otherColor(c: "red" | "black") {
  return c === "red" ? "black" : "red";
}

function safeStateFromDb(s: any): CheckersState | null {
  if (!s) return null;
  if (s.kind !== "checkers_v1") return null;
  if (!Array.isArray(s.board) || s.board.length !== 8) return null;
  return s as CheckersState;
}

async function ensureTurnRow(params: { challengeId: string; creatorUserId: string | null }) {
  const { challengeId, creatorUserId } = params;

  const existing = await loadLatestTurnRow(challengeId);
  if (existing?.challenge_id) return existing as TurnRow;

  // Creator seeds the row (RLS should allow creator insert; others will fail)
  const seedBoard = initialBoard();
  const seedState: CheckersState = {
    kind: "checkers_v1",
    board: seedBoard,
    must_capture: computeMustCapture(seedBoard, "red"),
    forced_piece: null,
    winner_color: null,
  };

  const seed: TurnRow = {
    challenge_id: challengeId,
    current_turn_user_id: creatorUserId,
    state: seedState,
    move_count: 0,
    updated_at: new Date().toISOString(),
  };

  const { data: ins, error: insErr } = await supabase
    .from("challenge_turns")
    .insert(seed)
    .select("challenge_id,current_turn_user_id,move_count,updated_at,state")
    .single();

  if (insErr) throw insErr;
  return ins as TurnRow;
}

async function loadLatestTurnRow(challengeId: string): Promise<TurnRow | null> {
  const { data, error } = await supabase
    .from("challenge_turns")
    .select("challenge_id,current_turn_user_id,move_count,updated_at,state")
    .eq("challenge_id", challengeId)
    .order("updated_at", { ascending: false })
    .order("move_count", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as TurnRow | undefined;
  return row ?? null;
}

export default function CheckersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { challengeId: challengeIdParam } = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = String(challengeIdParam ?? "");
  const cid = challengeId || null;

  const user = useAuthStore((s: any) => s.user);
  const { showChallengeOutcome, ResultModal } = useGameResultFlow(GAME_KEY, "Checkers", cid);

  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [turns, setTurns] = useState<TurnRow | null>(null);
  const [, setMoveLog] = useState<ChallengeEventRow[]>([]);

  const [selected, setSelected] = useState<Coord | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [creatorProfile, setCreatorProfile] = useState<{ display_name?: string | null; username?: string | null; avatar_url?: string | null } | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<{ display_name?: string | null; username?: string | null; avatar_url?: string | null } | null>(null);
  const [gameOverChallenge, setGameOverChallenge] = useState<ChallengeRow | null>(null); // refetched when winner detected
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const completionTrackedRef = useRef(false);

  const turnsChannelRef = useRef<any>(null);
  const eventsChannelRef = useRef<any>(null);
  const pollRef = useRef<any>(null);

  const toastTimer = useRef<any>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const creator = useMemo(() => players.find((p) => p.role === "creator") ?? null, [players]);
  const opponent = useMemo(() => players.find((p) => p.role === "opponent") ?? null, [players]);

  const myRole = useMemo<"creator" | "opponent" | null>(() => {
    if (!user?.id) return null;
    const me = players.find((p) => p.user_id === user.id);
    return me?.role ?? null;
  }, [players, user?.id]);

  const myColor = useMemo<"red" | "black" | null>(() => {
    if (!myRole) return null;
    return myRole === "creator" ? "red" : "black";
  }, [myRole]);

  const state: CheckersState | null = useMemo(() => safeStateFromDb(turns?.state), [turns?.state]);
  const board: Board | null = state?.board ?? null;
  const forcedPiece = state?.forced_piece ?? null;
  const mustCapture = state?.must_capture ?? false;
  const winnerColor = state?.winner_color ?? null;

  const isMyTurn = useMemo(() => {
    if (!user?.id) return false;
    if (!turns?.current_turn_user_id) return false;
    return turns.current_turn_user_id === user.id;
  }, [turns?.current_turn_user_id, user?.id]);

  const topStats = useMemo(() => {
    if (!board) return null;
    return { red: countPieces(board, "red"), black: countPieces(board, "black") };
  }, [board]);

  // Refetch challenge when game ends so we have settlement/payout info for modal
  useEffect(() => {
    if (!winnerColor) {
      setGameOverChallenge(null);
      return;
    }
    if (!challengeId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("challenges")
          .select("id,status,winner_user_id,win_reward_cents,entry_fee_cents,settlement_status")
          .eq("id", challengeId)
          .maybeSingle();
        if (!cancelled && data) setGameOverChallenge(data as any);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [winnerColor, challengeId]);

  const safeCleanupRealtime = useCallback(() => {
    try {
      if (turnsChannelRef.current) supabase.removeChannel(turnsChannelRef.current);
      if (eventsChannelRef.current) supabase.removeChannel(eventsChannelRef.current);
    } catch {}
    turnsChannelRef.current = null;
    eventsChannelRef.current = null;
  }, []);

  useEffect(() => {
    if (!winnerColor || !myColor) return;
    if (completionTrackedRef.current) return;
    const didWin = winnerColor === myColor;
    if (didWin && cid && gameOverChallenge === null) return;

    completionTrackedRef.current = true;
    const reward =
      didWin && gameOverChallenge?.win_reward_cents
        ? `+$${(Number(gameOverChallenge.win_reward_cents ?? 0) / 100).toFixed(2)}`
        : null;
    void showChallengeOutcome({
      won: didWin,
      score: didWin ? 1 : 0,
      headline: didWin ? "You won!" : "You lost",
      scoreLabel: reward ?? (didWin ? "Victory" : "Better luck next time"),
    });
  }, [winnerColor, myColor, gameOverChallenge, cid, showChallengeOutcome]);

  const subscribeRealtime = useCallback(() => {
    if (!challengeId) return;

    safeCleanupRealtime();

    turnsChannelRef.current = supabase
      .channel(`challenge_turns:${challengeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "challenge_turns", filter: `challenge_id=eq.${challengeId}` },
        (payload) => {
          const next = payload.new as any;
          if (next?.challenge_id) {
            setTurns(next as TurnRow);
            // Only clear selection when it's no longer our turn
            const stillMyTurn = next?.current_turn_user_id === user?.id;
            if (!stillMyTurn) {
              setSelected(null);
              setLegalMoves([]);
            }
          }
        }
      )
      .subscribe();

    eventsChannelRef.current = supabase
      .channel(`challenge_events:${challengeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "challenge_events", filter: `challenge_id=eq.${challengeId}` },
        (payload) => {
          const ev = payload.new as any;
          if (ev?.challenge_id) {
            setMoveLog((prev) => [ev as ChallengeEventRow, ...prev].slice(0, 10));
          }
        }
      )
      .subscribe();
  }, [challengeId, safeCleanupRealtime, user?.id]);

  const loadMoveLog = useCallback(async () => {
    if (!challengeId) return;
    try {
      const { data, error } = await supabase
        .from("challenge_events")
        .select("id, created_at, type, body, actor_user_id, payload")
        .eq("challenge_id", challengeId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setMoveLog((data ?? []) as any);
    } catch {}
  }, [challengeId]);

  const refresh = useCallback(async () => {
    if (!challengeId) return;

    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase
        .from("challenges")
        .select("id,title,game_type,status,created_by,winner_user_id,entry_fee_cents,win_reward_cents")
        .eq("id", challengeId)
        .single();

      if (chErr || !ch) throw new Error(chErr?.message ?? "Challenge not found.");

      if (!isTurnBasedGameType(ch.game_type)) {
        Alert.alert("Wrong game", "This screen is for checkers challenges.");
        router.back();
        return;
      }

      const { data: ps, error: pErr } = await supabase
        .from("challenge_players")
        .select("user_id,role")
        .eq("challenge_id", challengeId);

      if (pErr) throw pErr;

      const pList = (ps ?? []) as PlayerRow[];
      const c = pList.find((p) => p.role === "creator") ?? null;
      const opp = pList.find((p) => p.role === "opponent") ?? null;

      // Ensure turn row exists (creator seeds insert). If you’re not creator and insert fails,
      // the row may not exist yet—just try selecting again on next refresh.
      let t: TurnRow | null = null;
      try {
        t = await ensureTurnRow({ challengeId, creatorUserId: c?.user_id ?? null });
      } catch (e: any) {
        // If RLS blocks insert for non-creator: try just selecting; otherwise surface error.
        const msg = String(e?.message ?? "");
        if (msg.toLowerCase().includes("row-level security")) {
          t = await loadLatestTurnRow(challengeId);
        } else {
          throw e;
        }
      }

      if (!t) {
        setChallenge(ch as any);
        setPlayers(pList);
        setTurns(null);
        setSelected(null);
        setLegalMoves([]);
        return;
      }

      const parsed = safeStateFromDb(t.state);

      // IMPORTANT: do NOT “repair update” on refresh for non-creator (RLS + correctness).
      // Only creator may repair a corrupted state.
      if (!parsed) {
        if (user?.id && c?.user_id && user.id === c.user_id) {
          const seedBoard = initialBoard();
          const seedState: CheckersState = {
            kind: "checkers_v1",
            board: seedBoard,
            must_capture: computeMustCapture(seedBoard, "red"),
            forced_piece: null,
            winner_color: null,
          };

          const { data: fixed, error: fixErr } = await supabase
            .from("challenge_turns")
            .update({
              state: seedState,
              move_count: Number(t.move_count ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq("challenge_id", challengeId)
            .select("challenge_id,current_turn_user_id,move_count,updated_at,state")
            .single();

          if (fixErr) throw fixErr;
          setTurns(fixed as any);
        } else {
          // Non-creator: trust the row; it will get repaired by creator if needed.
          setTurns(t as any);
        }
      } else {
        setTurns(t as any);
      }

      let challengeRow = ch as any;
      if (user?.id && challengeRow?.status !== "completed") {
        const repaired = await repairChallengeCompletion({
          challengeId,
          actorUserId: user.id,
        }).catch(() => false);
        if (repaired) {
          const { data: refreshedCh } = await supabase
            .from("challenges")
            .select("id,title,game_type,status,created_by,winner_user_id,entry_fee_cents,win_reward_cents")
            .eq("id", challengeId)
            .single();
          if (refreshedCh) challengeRow = refreshedCh;
          fetchRecentChallenges()
            .then((remote) => useChallengeStore.setState({ challenges: remote }))
            .catch(() => {});
        }
      }

      setChallenge(challengeRow);
      setPlayers(pList);

      const userIds = pList.map((p) => p.user_id).filter(Boolean);
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", userIds);
        const pm = new Map((profs ?? []).map((pr: any) => [pr.id, pr]));
        setCreatorProfile((c ? pm.get(c.user_id) : null) ?? null);
        setOpponentProfile((opp ? pm.get(opp.user_id) : null) ?? null);
      } else {
        setCreatorProfile(null);
        setOpponentProfile(null);
      }

      // Don't clear selection when it's still our turn - avoids interrupting user mid-move
      const stillMyTurn = t?.current_turn_user_id === user?.id;
      if (!stillMyTurn) {
        setSelected(null);
        setLegalMoves([]);
      }

    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load checkers.");
      router.back();
    } finally {
      setBusy(false);
    }
  }, [challengeId, router, user?.id]);

  // Focus refresh (Option A)
  useFocusEffect(
    useCallback(() => {
      // When screen becomes active: resubscribe + refresh
      subscribeRealtime();
      void refresh();
      void loadMoveLog();

      return () => {
        // do nothing; we keep channels alive unless app background kills them
      };
    }, [subscribeRealtime, refresh, loadMoveLog])
  );

  // Foreground refresh (Option A)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/inactive|background/) && nextState === "active") {
        // App resumed: resubscribe + refresh
        subscribeRealtime();
        void refresh();
        void loadMoveLog();
      }
    });

    return () => {
      sub.remove();
    };
  }, [subscribeRealtime, refresh, loadMoveLog]);

  // Safety polling: faster when waiting for opponent so we sync sooner after their move
  useEffect(() => {
    if (!challengeId) return;
    const intervalMs = isMyTurn ? 12000 : 3000;

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await loadLatestTurnRow(challengeId);

        if (data?.challenge_id) {
          setTurns(data as any);
        }
      } catch {}
    }, intervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [challengeId, isMyTurn]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!challengeId) {
        Alert.alert("Missing challengeId", "Open this from a challenge thread.");
        router.back();
        return;
      }
      try {
        await refresh();
        await loadMoveLog();
        subscribeRealtime();
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      safeCleanupRealtime();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [challengeId, refresh, loadMoveLog, router, subscribeRealtime, safeCleanupRealtime]);

  const legalMovesForSelection = useCallback(
    (sel: Coord | null): Move[] => {
      if (!board || !myColor) return [];
      if (!sel) return [];
      if (winnerColor) return [];
      if (!isMyTurn) return [];
      if (forcedPiece && !coordsEq(forcedPiece, sel)) return [];

      const pieceMoves = listMovesForPiece(board, sel, myColor);
      const mustCapNow = computeMustCapture(board, myColor);
      if (mustCapNow) return pieceMoves.filter((m) => m.isCapture);
      return pieceMoves;
    },
    [board, myColor, forcedPiece, isMyTurn, winnerColor]
  );

  const isLegalDestination = useCallback(
    (r: number, c: number) => legalMoves.some((m) => m.to.r === r && m.to.c === c),
    [legalMoves]
  );

  const performMove = useCallback(
    async (mv: Move) => {
      if (!board || !state || !turns || !myColor || !user?.id || !challenge) return;
      if (!isMyTurn) return;
      if (winnerColor) return;

      if (forcedPiece && !coordsEq(forcedPiece, mv.from)) {
        showToast("Forced move: continue jumping with the same piece.");
        return;
      }

      const mustCapNow = computeMustCapture(board, myColor);
      if (mustCapNow && !mv.isCapture) {
        showToast("Capture required.");
        return;
      }

      setBusy(true);
      try {
        const { board: nextBoard, becameKing } = applyMove(board, mv);

        // multi-jump check
        let nextForced: Coord | null = null;
        let keepTurn = false;

        if (mv.isCapture) {
          const moreCaps = listMovesForPiece(nextBoard, mv.to, myColor).filter((m) => m.isCapture);
          if (moreCaps.length > 0) {
            nextForced = { r: mv.to.r, c: mv.to.c };
            keepTurn = true;
          }
        }

        // Winner check
        const other = otherColor(myColor);
        let nextWinner: "red" | "black" | null = null;

        if (countPieces(nextBoard, other) === 0) nextWinner = myColor;
        else if (!keepTurn && !hasAnyMove(nextBoard, other)) nextWinner = myColor;

        const effectiveTurnColor = keepTurn ? myColor : otherColor(myColor);
        const nextMustCapture = computeMustCapture(nextBoard, effectiveTurnColor);

        const nextState: CheckersState = {
          kind: "checkers_v1",
          board: nextBoard,
          must_capture: nextMustCapture,
          forced_piece: nextForced,
          winner_color: nextWinner,
        };

        const nextTurnUserId = (() => {
          if (nextWinner) return turns.current_turn_user_id;
          if (keepTurn) return user.id;
          if (!creator || !opponent) return turns.current_turn_user_id;
          return myRole === "creator" ? opponent.user_id : creator.user_id;
        })();

        const currentMoveCount = Number(turns.move_count ?? 0);
        const newMoveCount = currentMoveCount + 1;

        // Optimistic lock + RLS enforced
        const { data: updatedRows, error: upErr } = await supabase
          .from("challenge_turns")
          .update({
            state: nextState,
            current_turn_user_id: nextTurnUserId,
            move_count: newMoveCount,
            updated_at: new Date().toISOString(),
          })
          .eq("challenge_id", challengeId)
          .eq("move_count", currentMoveCount)
          .select("challenge_id,current_turn_user_id,move_count,updated_at,state")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (upErr) throw upErr;
        const updated = (updatedRows ?? [])[0] as TurnRow | undefined;

        if (!updated?.challenge_id) {
          // move_count mismatch => stale client; just resync
          showToast("Board changed — syncing.");
          await refresh();
          await loadMoveLog();
          return;
        }

        setTurns(updated as any);

        const moverLabel = myColor === "red" ? "Red" : "Black";

        // Bump thread so it shows as most recent
        if (creator && opponent) {
          try {
            const tid = await getOrCreateThreadByUsers(creator.user_id, opponent.user_id);
            const preview = nextWinner
              ? "Game over"
              : keepTurn
                ? `${moverLabel} continues jump`
                : "Checkers: new move";
            await upsertThreadPreview(tid, preview);
          } catch {}
        }

        // When game ends: mark completed, settle payout, and refresh Pulse feed data
        if (nextWinner && creator && opponent) {
          const winnerUserId = nextWinner === "red" ? creator.user_id : opponent.user_id;
          const winnerName = winnerUserId === user.id ? "You" : nextWinner === "red" ? "Red" : "Black";
          try {
            await completeTurnBasedChallenge({
              challengeId,
              winnerUserId,
              actorUserId: user.id,
              creatorUserId: creator.user_id,
              opponentUserId: opponent.user_id,
              summaryLabel: `${winnerName} won the checkers game.`,
            });
            fetchRecentChallenges()
              .then((remote) => useChallengeStore.setState({ challenges: remote }))
              .catch(() => {});
          } catch (e: any) {
            console.warn("[checkers] Game end update failed:", e?.message);
            Alert.alert("Could not finalize match", e?.message ?? "Your win may not show on Pulse until refreshed.");
          }
        }

        if (keepTurn && nextForced) {
          setSelected(nextForced);
          setLegalMoves(legalMovesForSelection(nextForced));
        } else {
          setSelected(null);
          setLegalMoves([]);
        }
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.toLowerCase().includes("row-level security")) {
          showToast("Not your turn — syncing.");
          await refresh();
          return;
        }
        Alert.alert("Move failed", e?.message ?? "Could not apply move.");
      } finally {
        setBusy(false);
      }
    },
    [
      board,
      state,
      turns,
      myColor,
      user?.id,
      isMyTurn,
      winnerColor,
      forcedPiece,
      creator,
      opponent,
      myRole,
      challengeId,
      refresh,
      loadMoveLog,
      legalMovesForSelection,
      showToast,
      challenge,
    ]
  );

  const selectSquare = useCallback(
    (r: number, c: number) => {
      if (busy) return;
      if (!board || !myColor || !state) return;

      if (winnerColor) return;

      if (!isMyTurn) {
        showToast("Opponent’s turn.");
        return;
      }

      if (selected) {
        const mv = legalMoves.find((m) => m.to.r === r && m.to.c === c);
        if (mv) {
          void performMove(mv);
          return;
        }
      }

      const p = board[r][c];
      const pColor = pieceColor(p);

      if (!p || pColor !== myColor) {
        setSelected(null);
        setLegalMoves([]);
        return;
      }

      if (forcedPiece && !coordsEq(forcedPiece, { r, c })) {
        showToast("Continue the jump with the highlighted piece.");
        return;
      }

      const sel = { r, c };
      setSelected(sel);
      setLegalMoves(legalMovesForSelection(sel));
    },
    [busy, board, myColor, state, winnerColor, isMyTurn, selected, legalMoves, forcedPiece, legalMovesForSelection, performMove, showToast]
  );

  if (booting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.sub}>Loading checkers…</Text>
      </View>
    );
  }

  if (!challenge || !turns || !state || !board) {
    return (
      <View style={styles.center}>
        <Text style={styles.sub}>Missing game data.</Text>
        <Pressable style={styles.btnGhost} onPress={() => router.replace(`/challenge/${challengeId}`)}>
          <Text style={styles.btnGhostText}>Back to Thread</Text>
        </Pressable>
      </View>
    );
  }

  const canMove = isMyTurn && !winnerColor;

  const myScore = topStats ? (myColor === "red" ? topStats.red : topStats.black) : 0;
  const oppScore = topStats ? (myColor === "red" ? topStats.black : topStats.red) : 0;
  const oppName = creator && user?.id === creator.user_id
    ? (opponentProfile?.display_name || opponentProfile?.username || "Opponent")
    : (creatorProfile?.display_name || creatorProfile?.username || "Opponent");
  const myAvatar = creator && user?.id === creator.user_id ? creatorProfile : opponentProfile;
  const oppAvatar = creator && user?.id === creator.user_id ? opponentProfile : creatorProfile;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={[styles.playerSlot, isMyTurn && !winnerColor && styles.playerSlotActive]}>
          <View style={styles.playerAvatarWrap}>
            <Avatar imageUrl={myAvatar?.avatar_url} name="You" size={32} />
          </View>
          <Text style={styles.playerLabel}>You</Text>
          <Text style={styles.playerScore}>{myScore}</Text>
        </View>

        <View style={styles.headerCenter}>
          <Text style={styles.gameTitle}>Checkers</Text>
          <Text style={styles.turnHint}>
            {winnerColor ? "Game over" : isMyTurn ? "Your turn" : "Opponent's turn"}
          </Text>
        </View>

        <View style={[styles.playerSlot, !isMyTurn && !winnerColor && styles.playerSlotActive]}>
          <View style={styles.playerAvatarWrap}>
            <Avatar imageUrl={oppAvatar?.avatar_url} name={oppName} size={32} />
          </View>
          <Text style={styles.playerLabel} numberOfLines={1}>{oppName}</Text>
          <Text style={styles.playerScore}>{oppScore}</Text>
        </View>
      </View>

      {/* Capture/jump hints */}
      {(mustCapture || forcedPiece) && !winnerColor ? (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>{mustCapture ? "Capture required" : "Continue jump"}</Text>
        </View>
      ) : null}

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <View style={styles.boardCard}>
        <View style={styles.board}>
          {((myColor === "black" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]) as number[]).map((r) => (
            <View key={`r-${r}`} style={styles.boardRow}>
              {board[r].map((p, c) => {
                const dark = isDarkSquare(r, c);
                const selectedHere = selected?.r === r && selected?.c === c;
                const forcedHere = forcedPiece?.r === r && forcedPiece?.c === c;
                const legalDest = isLegalDestination(r, c);
                const moveToHere = selected && legalDest ? legalMoves.find((m) => m.to.r === r && m.to.c === c) : null;

                const pCol = pieceColor(p);
                const isMine = pCol && pCol === myColor;

                const handlePress = () => {
                  if (moveToHere) {
                    void performMove(moveToHere);
                  } else {
                    selectSquare(r, c);
                  }
                };

                return (
                  <Pressable
                    key={`c-${c}`}
                    onPress={handlePress}
                    disabled={!dark || busy}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    style={vStyle(
                      styles.cell,
                      dark ? styles.cellDark : styles.cellLight,
                      selectedHere ? styles.cellSelected : undefined,
                      forcedHere ? styles.cellForced : undefined,
                      legalDest ? styles.cellLegal : undefined
                    )}
                  >
                    {p ? (
                      <View style={vStyle(styles.piece, pCol === "red" ? styles.pieceRed : styles.pieceBlack)}>
                        {isKing(p) ? <Text style={styles.kingText}>K</Text> : null}
                        {isMine && canMove ? <View style={styles.mineRing} /> : null}
                      </View>
                    ) : legalDest ? (
                      <View style={styles.legalMarker} pointerEvents="none" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable style={styles.footerBtn} onPress={() => router.replace(`/challenge/${challengeId}`)} disabled={busy}>
          <Text style={styles.footerBtnIcon}>←</Text>
          <Text style={styles.footerBtnLabel}>Back</Text>
        </Pressable>
        <Pressable style={styles.footerBtn} onPress={() => void refresh()} disabled={busy}>
          <Text style={styles.footerBtnIcon}>↻</Text>
          <Text style={styles.footerBtnLabel}>Refresh</Text>
        </Pressable>
      </View>

      <ResultModal />

      {busy ? (
        <View style={styles.busyBar}>
          <ActivityIndicator />
          <Text style={styles.busyText}>Syncing…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050819" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050819", paddingTop: 0 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  playerSlot: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
    paddingVertical: 4,
  },
  playerSlotActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    marginHorizontal: 2,
  },
  playerAvatarWrap: { marginBottom: 2 },
  playerLabel: { color: "#fff", fontWeight: "900", fontSize: 11 },
  playerScore: { color: "#fff", fontWeight: "900", fontSize: 14, marginTop: 1 },
  headerCenter: { flex: 1.1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  gameTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  turnHint: { color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 11, marginTop: 2 },
  hintBar: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.warningSurfaceMedium,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 8,
  },
  hintText: { color: colors.warning, fontWeight: "800", textAlign: "center" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "rgba(30,30,35,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footerBtn: {
    minWidth: 96,
    height: 48,
    borderRadius: 10,
    backgroundColor: "rgba(60,60,68,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
  },
  footerBtnIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },
  footerBtnLabel: { color: "#fff", fontSize: 13, fontWeight: "900" },

  topBar: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900" },
  h2: { color: "rgba(255,255,255,0.60)", marginTop: 4, fontWeight: "800" },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  iconBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  chipsRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  chipWarn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.warningSurfaceStrong,
    borderWidth: 1,
    borderColor: colors.warningBorderStrong,
  },
  chipGood: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.14)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
  },
  chipText: { color: "#fff", fontWeight: "900" },
  chipDim: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipTextDim: { color: "rgba(255,255,255,0.70)", fontWeight: "900" },

  lastMoveCard: {
    marginTop: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  lastMoveLabel: { color: "rgba(255,255,255,0.60)", fontWeight: "900", marginBottom: 6 },
  lastMoveText: { color: "#fff", fontWeight: "900" },
  lastMoveTime: { color: "rgba(255,255,255,0.55)", fontWeight: "800", marginTop: 6 },

  scoreRow: { paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  scoreBox: {
    minWidth: "20%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreBoxWide: {
    minWidth: "36%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreText: { color: "rgba(255,255,255,0.70)", fontWeight: "900" },
  scoreNum: { color: "#fff", fontWeight: "900" },

  toast: {
    marginTop: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
  },
  toastText: { color: "#fff", fontWeight: "900" },

  boardCard: {
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  board: { width: "100%", aspectRatio: 1 },
  boardRow: { flex: 1, flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center" },
  cellLight: { backgroundColor: "#e8dcc8" },
  cellDark: { backgroundColor: "#b8956b" },

  cellSelected: { borderWidth: 2, borderColor: "rgba(59,130,246,0.9)" },
  cellForced: { borderWidth: 2, borderColor: "rgba(34,197,94,0.60)" },
  cellLegal: { borderWidth: 2, borderColor: "rgba(59,130,246,0.7)" },

  piece: {
    width: "72%",
    height: "72%",
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  pieceRed: { backgroundColor: "rgba(239,68,68,0.85)", borderColor: "rgba(239,68,68,1)" },
  pieceBlack: { backgroundColor: "rgba(17,24,39,0.95)", borderColor: "rgba(255,255,255,0.16)" },

  mineRing: {
    position: "absolute",
    width: "92%",
    height: "92%",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },

  kingText: { color: "#fff", fontWeight: "900" },
  legalDot: { width: 10, height: 10, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.65)" },
  legalMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(59,130,246,0.5)",
    borderWidth: 2,
    borderColor: "rgba(59,130,246,0.9)",
  },

  actions: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  actionsRow: { flexDirection: "row", gap: 10 },

  btnPrimary: { backgroundColor: "#2563eb", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },

  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  btnGhostText: { color: "#fff", fontWeight: "900" },

  btnDisabled: { opacity: 0.55 },

  busyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(5,8,25,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  busyText: { color: "rgba(255,255,255,0.8)", fontWeight: "900" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#1a1d29",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginBottom: 8 },
  modalSubtitle: { color: "rgba(255,255,255,0.8)", fontSize: 16, fontWeight: "800", marginBottom: 20 },
  modalBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  sub: { color: "rgba(255,255,255,0.7)", fontWeight: "800" },
});
