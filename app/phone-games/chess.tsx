// app/phone-games/chess.tsx - Turn-based chess
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Chess } from "chess.js";
import { supabase } from "../../lib/backend/supabaseClient";
import { useAuthStore } from "../../lib/data/authStore";
import { getGameProgress, type GameProgress } from "../../lib/data/gameProgress";
import { appendThreadPrompt, buildPromptId, resolveThreadPromptByPromptId } from "../../lib/backend/threadActions";
import { colors } from "../../lib/theme/colors";
import { pressSoftIcon } from "../../lib/ui/pressableStyles";
import { useGameResultFlow } from "./useGameResultFlow";

const GAME_KEY = "Chess";

type PlayerRow = { user_id: string; role: string };
type TurnRow = { challenge_id: string; current_turn_user_id: string | null; state: any; move_count: number | null };

export default function ChessScreen() {
  const router = useRouter();
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const cid = challengeId ? String(challengeId) : null;
  const user = useAuthStore((s: any) => s.user);
  const { showChallengeOutcome, ResultModal } = useGameResultFlow(GAME_KEY, "Chess", cid);
  const gameEndTrackedRef = useRef(false);

  const [loading, setLoading] = useState(!!cid);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [turns, setTurns] = useState<TurnRow | null>(null);
  const [game, setGame] = useState<Chess | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [progress, setProgress] = useState<GameProgress | null>(null);

  const creatorId = useMemo(() => players.find((p) => p.role === "creator")?.user_id ?? null, [players]);
  const opponentId = useMemo(() => players.find((p) => p.role === "opponent")?.user_id ?? null, [players]);
  const myColor = useMemo(() => {
    if (!user?.id) return null;
    return user.id === creatorId ? "w" : user.id === opponentId ? "b" : null;
  }, [user?.id, creatorId, opponentId]);
  const isMyTurn = useMemo(() => {
    if (!game || !user?.id) return false;
    const turn = game.turn();
    return (turn === "w" && user.id === creatorId) || (turn === "b" && user.id === opponentId);
  }, [game, user?.id, creatorId, opponentId]);
  const isWhite = myColor === "w";

  const load = useCallback(async () => {
    if (!cid) return;
    try {
      const [playersRes, turnsRes] = await Promise.all([
        supabase.from("challenge_players").select("user_id, role").eq("challenge_id", cid),
        supabase
          .from("challenge_turns")
          .select("challenge_id, current_turn_user_id, state, move_count, updated_at")
          .eq("challenge_id", cid)
          .order("updated_at", { ascending: false })
          .order("move_count", { ascending: false })
          .limit(1),
      ]);
      const pl = (playersRes.data ?? []) as PlayerRow[];
      setPlayers(pl);
      const creatorIdLocal = pl.find((p) => p.role === "creator")?.user_id ?? null;
      const opponentIdLocal = pl.find((p) => p.role === "opponent")?.user_id ?? null;
      const tr = ((turnsRes.data ?? [])[0] as TurnRow | undefined) ?? null;
      if (tr?.state?.fen) {
        setGame(new Chess(tr.state.fen));
        setTurns(tr);
        await ensureTurnPrompt(tr.current_turn_user_id, tr.move_count ?? 0, creatorIdLocal, opponentIdLocal);
      } else if (pl.some((p) => p.user_id === user?.id)) {
        const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        await supabase.from("challenge_turns").upsert({
          challenge_id: cid,
          current_turn_user_id: creatorIdLocal,
          state: { fen },
          move_count: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "challenge_id" });
        setGame(new Chess(fen));
        setTurns({ ...tr!, state: { fen }, current_turn_user_id: creatorIdLocal, move_count: 0 });
        await ensureTurnPrompt(creatorIdLocal, 0, creatorIdLocal, opponentIdLocal);
      }
    } catch {
      /* load failed */
    }
    setLoading(false);
    // ensureTurnPrompt is hoisted; listing it would change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureTurnPrompt
  }, [cid, user?.id, creatorId]);

  useFocusEffect(useCallback(() => { if (cid) load(); }, [cid, load]));
  useEffect(() => { if (cid) load(); }, [cid, load]);
  useEffect(() => {
    getGameProgress(GAME_KEY).then(setProgress).catch(() => setProgress(null));
  }, []);

  async function ensureTurnPrompt(
    targetUserId: string | null | undefined,
    turnKey: number,
    creatorIdLocal: string | null,
    opponentIdLocal: string | null
  ) {
    if (!cid) return;
    if (!creatorIdLocal || !opponentIdLocal) return;
    if (!targetUserId) return;

    try {
      const promptId = buildPromptId({
        promptType: "prompt_play_turn",
        challengeId: cid,
        turnKey: String(turnKey),
      });

      await appendThreadPrompt({
        userAId: creatorIdLocal,
        userBId: opponentIdLocal,
        promptType: "prompt_play_turn",
        promptId,
        label: `${GAME_KEY} — your turn`,
        challengeId: cid,
        targetUserId: String(targetUserId),
        yesText: "Play Now",
        noText: "Later",
        payload: {
          title: `${GAME_KEY} — your turn`,
          subtitle: "Make your next move to continue.",
          game_type: GAME_KEY,
        },
      });
    } catch (e) {
      // Best-effort: prompt insertion should not break chess gameplay.
      console.warn("[chess] ensureTurnPrompt failed:", e);
    }
  }

  const handleSquare = useCallback(
    async (sq: string) => {
      if (!game || !isMyTurn || !user?.id || !cid) return;
      const g = new Chess(game.fen());
      if (selected) {
        const move = legalMoves.find((m) => m.startsWith(selected) && m.endsWith(sq));
        if (move) {
          g.move({ from: selected, to: sq });
          const nextTurn = g.turn() === "w" ? creatorId : opponentId;
          const currentMoveCount = turns?.move_count ?? 0;
          const nextMoveCount = currentMoveCount + 1;
          const currentTurnUserId = user?.id ? String(user.id) : null;
          await supabase
            .from("challenge_turns")
            .update({
              state: { fen: g.fen() },
              current_turn_user_id: nextTurn,
              move_count: nextMoveCount,
              updated_at: new Date().toISOString(),
            })
            .eq("challenge_id", cid);

          // Resolve the previous "play turn" prompt (the one you just acted on).
          try {
            if (creatorId && opponentId && currentTurnUserId) {
              const prevPromptId = buildPromptId({
                promptType: "prompt_play_turn",
                challengeId: cid,
                turnKey: String(currentMoveCount),
              });

              await resolveThreadPromptByPromptId({
                userAId: creatorId,
                userBId: opponentId,
                promptId: prevPromptId,
                resolverUserId: currentTurnUserId,
                resolution: "yes",
                resolutionLabel: "Played.",
              });
            }
          } catch (e) {
            console.warn("[chess] resolve previous turn prompt failed:", e);
          }

          // Create prompt for the next player so the thread list behaves like chat.
          if (!(g.isCheckmate() || g.isStalemate() || g.isDraw())) {
            await ensureTurnPrompt(nextTurn, nextMoveCount, creatorId, opponentId);
          }

          setGame(g);
          setTurns((t) =>
            t
              ? { ...t, state: { fen: g.fen() }, current_turn_user_id: nextTurn, move_count: nextMoveCount }
              : null
          );
          setSelected(null);
          setLegalMoves([]);
          if (g.isCheckmate() || g.isStalemate() || g.isDraw()) {
            if (!gameEndTrackedRef.current) {
              gameEndTrackedRef.current = true;
              const didWin = g.isCheckmate()
                ? (g.turn() === "w" ? "b" : "w") === myColor
                : false;
              const headline = g.isCheckmate()
                ? didWin
                  ? "Checkmate — you win!"
                  : "Checkmate — you lost"
                : "Draw";
              void showChallengeOutcome({
                won: didWin,
                score: g.isDraw() || g.isStalemate() ? 0 : didWin ? 1 : 0,
                headline,
                scoreLabel: g.isCheckmate()
                  ? `${g.turn() === "w" ? "Black" : "White"} wins`
                  : "Game drawn",
              }).then((s) => setProgress(s.progress));
            }
          }
        } else {
          const piece = g.get(selected as any);
          if (piece && piece.color === (isWhite ? "w" : "b")) {
            setSelected(sq);
            setLegalMoves(g.moves({ square: selected as any, verbose: true }).map((m) => m.from + m.to));
          } else {
            setSelected(null);
            setLegalMoves([]);
          }
        }
      } else {
        const piece = g.get(sq as any);
        if (piece && piece.color === (isWhite ? "w" : "b")) {
          setSelected(sq);
          setLegalMoves(g.moves({ square: sq as any, verbose: true }).map((m) => m.from + m.to));
        }
      }
    },
    // ensureTurnPrompt is stable enough for gameplay; full deps would churn callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, isMyTurn, selected, legalMoves, user?.id, cid, creatorId, opponentId, isWhite, turns?.move_count, router]
  );

  const board = useMemo(() => {
    const files = "abcdefgh";
    const ranks = isWhite ? "87654321" : "12345678";
    const squares: string[] = [];
    for (const r of ranks)
      for (const f of files) squares.push(f + r);
    return squares;
  }, [isWhite]);

  const getPiece = (sq: string) => {
    if (!game) return null;
    const p = game.get(sq as any);
    if (!p) return null;
    const map: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
    const symbol = map[p.type] ?? "?";
    return p.color === "w" ? symbol : symbol;
  };

  if (!cid) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.text}>Open from a challenge</Text>
      </View>
    );
  }

  if (loading || !game) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.btn, pressSoftIcon(pressed)]}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Chess</Text>
        <Text style={styles.turn}>{isMyTurn ? "Your turn" : "Opponent's turn"}</Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
      </View>
      <View style={styles.board}>
        {board.map((sq, i) => {
          const r = Math.floor(i / 8);
          const c = i % 8;
          const isLight = (r + c) % 2 === 0;
          const isSelected = selected === sq;
          const isLegal = legalMoves.some((m) => m.slice(2) === sq);
          return (
            <Pressable
              key={sq}
              onPress={() => handleSquare(sq)}
              style={[
                styles.square,
                isLight ? styles.squareLight : styles.squareDark,
                isSelected && styles.squareSelected,
                isLegal && styles.squareLegal,
              ]}
            >
              <Text style={styles.piece}>{getPiece(sq) ?? ""}</Text>
            </Pressable>
          );
        })}
      </View>
      <ResultModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  text: { color: colors.text, fontSize: 16 },
  loadingText: { marginTop: 12, color: colors.textTertiary, fontSize: 14 },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  btn: { marginRight: 12 },
  btnText: { color: colors.text, fontWeight: "700" },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  turn: { color: colors.warning, fontSize: 14, fontWeight: "700" },
  board: { flexDirection: "row", flexWrap: "wrap", padding: 16, justifyContent: "center" },
  square: {
    width: "11.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  squareLight: { backgroundColor: "#e8e8e8" },
  squareDark: { backgroundColor: "#5c5c5c" },
  squareSelected: { backgroundColor: colors.accentSurface },
  squareLegal: { backgroundColor: "rgba(34,197,94,0.3)" },
  piece: { fontSize: 24, fontWeight: "bold" },
});
