// app/challenge/[id]/index.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import {
  cancelChallenge,
  checkInToInPersonChallenge,
  joinChallenge,
  repairChallengeCompletion,
  startChallengeMatch,
  type ChallengeOutcome,
} from "../../../lib/backend/challengeActions";
import { resolveInPersonVisionProfile, visionDeepLink } from "../../../lib/data/inPersonVisionConfig";
import { tryAutoConfirmEgameResult } from "../../../lib/backend/egameVerification";
import { fetchLatestAiReview } from "../../../lib/backend/matchProof";
import { reportMatchWinner } from "../../../lib/backend/matchVerification";
import AiReviewCard from "../../components/AiReviewCard";
import MatchProofBundleModal from "../../components/MatchProofBundleModal";
import { supabase } from "../../../lib/backend/supabaseClient";
import { fetchRecentChallenges } from "../../../lib/backend/challenges";
import { getFriendIds } from "../../../lib/backend/friends";
import { useAuthStore } from "../../../lib/data/authStore";
import { useWalletStore } from "../../../lib/data/walletStore";
import MatchResultModal from "../../../lib/ui/MatchResultModal";

// ✅ NEW: config-driven behavior
import {
  isManualGameType,
  isOneAttemptGameType,
  getGameConfig,
  isTurnBasedGameType,
  routeForGame,
} from "../../../lib/data/gameConfig";

type ChallengeStatus =
  | "open"
  | "accepted"
  | "in-progress"
  | "checked-in"
  | "completed"
  | "cancelled"
  | "disputed"
  | "awaiting_confirmation";

type ChallengeRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  status: ChallengeStatus | "awaiting_confirmation" | "disputed";
  kind?: string | null;
  created_by: string | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
  winner_user_id: string | null;
  completed_at: string | null;
  league_id?: string | null;
  result_reported_by?: string | null;
  result_confirm_by?: string | null;
};

type PlayerRole = "creator" | "opponent";

type PlayerRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  role: PlayerRole;
  score: number | null;
  submitted: boolean | null;
  checked_in_at?: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type ChallengeEventRow = {
  id: string;
  challenge_id: string;
  type: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  body: string | null;
  payload: any;
  created_at: string;
};

type TurnRow = {
  challenge_id: string;
  current_turn_user_id: string | null;
  state: any;
  move_count: number | null;
  updated_at: string | null;
};

function vStyle(...styles: (StyleProp<ViewStyle> | null | undefined | false)[]) {
  return styles.filter(Boolean) as StyleProp<ViewStyle>;
}

function formatUSDFromCents(n: number | null | undefined) {
  return `$${(Number(n ?? 0) / 100).toFixed(2)}`;
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

const THREAD_EVENT_TYPES = new Set([
  "challenge_created",
  "accepted",
  "challenge_accepted",
  "completed",
  "challenge_completed",
  "cancelled",
]);

function isThreadLifecycleEvent(type: string) {
  return THREAD_EVENT_TYPES.has(type);
}

function displayNameFor(userId: string | null | undefined, byId: Record<string, ProfileRow>) {
  if (!userId) return "Someone";
  const p = byId[userId];
  return p?.display_name || p?.username || "Someone";
}

async function safeHasSession() {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

async function safeGetAuthedUserId(fallback?: string | null) {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? fallback ?? null;
  } catch {
    return fallback ?? null;
  }
}

async function ensureEventOnce(params: {
  challengeId: string;
  type: string;
  actorUserId: string | null;
  body: string;
  payload?: any;
}) {
  const { challengeId, type, actorUserId, body, payload } = params;

  const { data } = await supabase
    .from("challenge_events")
    .select("id, type")
    .eq("challenge_id", challengeId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1);

  if (data?.length) return;

  await supabase.from("challenge_events").insert({
    challenge_id: challengeId,
    type,
    actor_user_id: actorUserId,
    body,
    payload: payload ?? {},
  });
}

async function ensureTurnRowSafe(params: { challengeId: string; creatorUserId: string }) {
  const { challengeId, creatorUserId } = params;

  try {
    const { error } = await supabase.from("challenge_turns").insert({
      challenge_id: challengeId,
      current_turn_user_id: creatorUserId,
      state: {},
      move_count: 0,
    });

    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      const msg = String(error.message ?? "");
      if (msg.toLowerCase().includes("row-level security")) {
        return { blockedByRls: true as const, message: msg, row: null as any };
      }
      throw error;
    }

    const { data: row, error: selErr } = await supabase
      .from("challenge_turns")
      .select("challenge_id, current_turn_user_id, state, move_count, updated_at")
      .eq("challenge_id", challengeId)
      .maybeSingle();

    if (selErr) {
      const msg = String(selErr.message ?? "");
      if (msg.toLowerCase().includes("row-level security")) {
        return { blockedByRls: true as const, message: msg, row: null as any };
      }
      throw selErr;
    }

    return { blockedByRls: false as const, message: null as any, row };
  } catch (e: any) {
    return { blockedByRls: false as const, message: e?.message ?? String(e), row: null as any };
  }
}

export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id ?? "");

  const storeUser = useAuthStore((s) => s.user);
  const walletStore = useWalletStore((s: any) => s);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [rivalSuggestions, setRivalSuggestions] = useState<
    { userId: string; displayName: string; wins: number; prizeCents: number; canReveal: boolean }[]
  >([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [events, setEvents] = useState<ChallengeEventRow[]>([]);
  const [turns, setTurns] = useState<TurnRow | null>(null);

  const [turnPolicyBlocked, setTurnPolicyBlocked] = useState(false);
  const [turnPolicyMsg, setTurnPolicyMsg] = useState<string | null>(null);
  const [matchResultOpen, setMatchResultOpen] = useState(false);
  const [egameReportOpen, setEgameReportOpen] = useState(false);
  const [aiReview, setAiReview] = useState<Awaited<ReturnType<typeof fetchLatestAiReview>>>(null);
  const [egameSubmitting, setEgameSubmitting] = useState(false);
  const shownResultKeyRef = useRef<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!storeUser?.id) {
      setFriendIds([]);
      return;
    }
    let cancelled = false;
    void getFriendIds(storeUser.id)
      .then((ids) => {
        if (!cancelled) setFriendIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFriendIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [storeUser?.id]);

  const isEgame = useMemo(() => String(challenge?.kind ?? "").toLowerCase() === "egame", [challenge?.kind]);
  const isInPerson = useMemo(() => String(challenge?.kind ?? "").toLowerCase() === "in_person", [challenge?.kind]);
  const isAiProofMatch = isEgame || isInPerson;
  const manual = useMemo(() => isManualGameType(challenge?.game_type) && !isEgame, [challenge?.game_type, isEgame]);
  const turnBased = useMemo(() => isTurnBasedGameType(challenge?.game_type), [challenge?.game_type]);
  const oneAttempt = useMemo(() => isOneAttemptGameType(challenge?.game_type), [challenge?.game_type]);
  const gameRules = useMemo(
    () => getGameConfig(challenge?.game_type)?.rules ?? null,
    [challenge?.game_type]
  );

  const entryFee = useMemo(
    () => Number(challenge?.entry_fee_cents ?? 0),
    [challenge?.entry_fee_cents]
  );
  const reward = useMemo(
    () => Number(challenge?.win_reward_cents ?? 0),
    [challenge?.win_reward_cents]
  );

  const creator = useMemo(() => players.find((p) => p.role === "creator") ?? null, [players]);
  const opponent = useMemo(() => players.find((p) => p.role === "opponent") ?? null, [players]);

  const opponentId = useMemo(() => {
    const meId = storeUser?.id;
    if (!meId) return null;
    return players.find((p) => p.user_id !== meId)?.user_id ?? null;
  }, [players, storeUser?.id]);

  const opponentName = useMemo(() => displayNameFor(opponentId, profilesById), [opponentId, profilesById]);

  const mePlayer = useMemo(
    () => players.find((p) => p.user_id === storeUser?.id) ?? null,
    [players, storeUser?.id]
  );
  const inPersonVision = useMemo(
    () => (isInPerson ? resolveInPersonVisionProfile(challenge?.game_type) : null),
    [isInPerson, challenge?.game_type]
  );
  const visionRecordLink = useMemo(() => {
    if (!isInPerson || !challengeId || !inPersonVision) return null;
    return visionDeepLink(inPersonVision, challengeId);
  }, [isInPerson, challengeId, inPersonVision]);
  const bothCheckedIn = useMemo(() => {
    const c = players.find((p) => p.role === "creator");
    const o = players.find((p) => p.role === "opponent");
    return Boolean(c?.checked_in_at) && Boolean(o?.checked_in_at);
  }, [players]);
  const myName = useMemo(
    () => displayNameFor(storeUser?.id ?? null, profilesById),
    [storeUser?.id, profilesById]
  );

  const friendIdsSet = useMemo(() => new Set(friendIds), [friendIds]);

  useEffect(() => {
    if (!storeUser?.id) {
      setRivalSuggestions([]);
      return;
    }
    if (!challenge || challenge.status !== "completed" || !challenge.game_type) {
      setRivalSuggestions([]);
      return;
    }

    const meId = storeUser.id;
    const creatorId = players.find((p) => p.role === "creator")?.user_id ?? null;
    const opponentId = players.find((p) => p.role === "opponent")?.user_id ?? null;
    const gameType = String(challenge.game_type).trim().toLowerCase();
    let cancelled = false;

    void (async () => {
      try {
        const all = await fetchRecentChallenges();
        const completedSameGame = (all ?? []).filter((c: any) => {
          if (!c || c.status !== "completed") return false;
          const gt = String(c.game_type ?? c.gameType ?? "").trim().toLowerCase();
          if (!gt || gt !== gameType) return false;
          const winnerId = c.winner_user_id ?? null;
          if (!winnerId) return false;
          // Don't suggest people who are already in this match (creator/opponent).
          if (creatorId && winnerId === creatorId) return false;
          if (opponentId && winnerId === opponentId) return false;
          if (winnerId === meId) return false;
          return true;
        });

        const byUser = new Map<
          string,
          { userId: string; name: string | null; wins: number; prizeCents: number }
        >();

        for (const c of completedSameGame) {
          const winnerId = String(c.winner_user_id);
          const name = (c as any).winner_display_name ?? (c as any).winnerDisplayName ?? (c as any).created_by_username ?? c.created_by ?? null;
          const prizeCents = Number((c as any).win_reward_cents ?? (c as any).winRewardCents ?? 0) || 0;

          const existing = byUser.get(winnerId);
          if (!existing) {
            byUser.set(winnerId, {
              userId: winnerId,
              name: typeof name === "string" ? name : null,
              wins: 1,
              prizeCents,
            });
          } else {
            existing.wins += 1;
            existing.prizeCents += prizeCents;
          }
        }

        const list = [...byUser.values()]
          .sort((a, b) => b.wins - a.wins || b.prizeCents - a.prizeCents)
          .slice(0, 5)
          .map((x) => {
            const canReveal = x.userId === meId || friendIdsSet.has(x.userId);
            return {
              ...x,
              canReveal,
              displayName: canReveal ? x.name ?? "Player" : "Rival",
            } as any;
          });

        if (!cancelled) setRivalSuggestions(list);
      } catch {
        if (!cancelled) setRivalSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [challenge, players, storeUser?.id, friendIdsSet]);

  const isCreator = useMemo(() => {
    const meId = storeUser?.id;
    if (!meId) return false;
    return challenge?.created_by === meId;
  }, [challenge?.created_by, storeUser?.id]);

  const oppPlayer = useMemo(() => {
    const meId = storeUser?.id;
    if (!meId) return null;
    return players.find((p) => p.user_id !== meId) ?? null;
  }, [players, storeUser?.id]);

  const isMyTurn = useMemo(() => {
    if (!turnBased) return true;
    const meId = storeUser?.id;
    if (!meId) return false;
    if (!turns?.current_turn_user_id) return false;
    return turns.current_turn_user_id === meId;
  }, [turnBased, turns?.current_turn_user_id, storeUser?.id]);

  const meSubmitted = useMemo(() => Boolean(mePlayer?.submitted), [mePlayer?.submitted]);
  const oppSubmitted = useMemo(() => Boolean(oppPlayer?.submitted), [oppPlayer?.submitted]);

  const canRevealOpponentScore = useMemo(() => {
    if (!challenge) return false;
    if (challenge.status === "completed") return true;
    if (oneAttempt) return meSubmitted && oppSubmitted;
    return false;
  }, [challenge, oneAttempt, meSubmitted, oppSubmitted]);

  const canCancel = useMemo(() => {
    if (!challenge) return false;
    if (!isCreator) return false;
    return challenge.status === "open" || challenge.status === "accepted";
  }, [challenge, isCreator]);

  const canJoin = useMemo(() => {
    const meId = storeUser?.id;
    if (!meId) return false;
    if (!challenge) return false;
    if (challenge.status !== "open") return false;
    if (challenge.created_by === meId) return false;
    if (players.some((p) => p.user_id === meId)) return false;
    return true;
  }, [challenge, players, storeUser?.id]);

  const canPlay = useMemo(() => {
    if (manual) return false;
    const meId = storeUser?.id;
    if (!meId || !challenge || !mePlayer) return false;
    if (!creator || !opponent) return false;
    if (!(challenge.status === "accepted" || challenge.status === "in-progress")) return false;

    if (turnBased && !isMyTurn) return false;
    if (!turnBased && oneAttempt && mePlayer.submitted) return false;

    return true;
  }, [manual, storeUser?.id, challenge, mePlayer, creator, opponent, turnBased, oneAttempt, isMyTurn]);

  const waitingLine = useMemo(() => {
    if (!challenge) return null;

    if (challenge.status === "open") {
      return isCreator ? "Waiting for an opponent to join." : "Open challenge. You can join.";
    }

    if (challenge.status === "accepted" || challenge.status === "in-progress") {
      if (!creator || !opponent) return "Waiting for both players…";

      if (turnBased) {
        if (turnPolicyBlocked) return "Turn system needs DB policy (challenge_turns RLS).";
        if (!turns?.current_turn_user_id) return "Match starting…";
        return isMyTurn ? "Your turn — make your move." : "Opponent’s turn — waiting…";
      }

      if (oneAttempt) {
        if (meSubmitted && !oppSubmitted) return "You completed. Waiting on opponent.";
        if (!meSubmitted && oppSubmitted) return "Opponent completed. Your turn to submit.";
        if (meSubmitted && oppSubmitted) return "Both completed. Results pending…";
        return "Your turn — complete your attempt.";
      }

      return "In progress…";
    }

    if (challenge.status === "completed") return "Completed.";
    if (challenge.status === "cancelled") return "Cancelled.";
    return null;
  }, [
    challenge,
    creator,
    opponent,
    isCreator,
    turnBased,
    turns?.current_turn_user_id,
    isMyTurn,
    oneAttempt,
    meSubmitted,
    oppSubmitted,
    turnPolicyBlocked,
  ]);

  const winnerLine = useMemo(() => {
    if (!challenge || challenge.status !== "completed") return null;

    const meId = storeUser?.id;
    if (!challenge.winner_user_id) return "🤝 Tie game";
    if (challenge.winner_user_id === meId) return "🏆 You won this match";
    return opponentName ? `🏆 ${opponentName} won` : "Result: You lost";
  }, [challenge, storeUser?.id, opponentName]);

  const matchOutcome = useMemo((): ChallengeOutcome | null => {
    if (!challenge || challenge.status !== "completed" || !storeUser?.id) return null;
    const meId = storeUser.id;
    const winnerId = challenge.winner_user_id ?? null;
    const won = winnerId == null ? null : winnerId === meId ? true : false;
    const mePlayer = players.find((p) => p.user_id === meId);
    const oppPlayer = players.find((p) => p.user_id !== meId);
    return {
      status: "completed",
      won,
      winnerUserId: winnerId,
      winnerDisplayName: winnerId ? displayNameFor(winnerId, profilesById) : null,
      myScore: mePlayer?.score != null ? Number(mePlayer.score) : null,
      opponentScore: oppPlayer?.score != null ? Number(oppPlayer.score) : null,
      rewardCents: challenge.win_reward_cents ?? null,
      gameType: challenge.game_type ?? null,
    };
  }, [challenge, storeUser?.id, players, profilesById]);

  useEffect(() => {
    if (!matchOutcome || !challenge?.completed_at) return;
    if (!storeUser?.id) return;
    const isParticipant = players.some((p) => p.user_id === storeUser.id);
    if (!isParticipant) return;
    const key = `${challenge.id}:${challenge.completed_at}`;
    if (shownResultKeyRef.current === key) return;
    shownResultKeyRef.current = key;
    setMatchResultOpen(true);
  }, [matchOutcome, challenge, players, storeUser?.id]);

  const threadEvents = useMemo(
    () => events.filter((ev) => isThreadLifecycleEvent(ev.type)),
    [events]
  );

  const load = useCallback(async () => {
    if (!challengeId) return;

    setLoading(true);
    setErr(null);
    setTurnPolicyBlocked(false);
    setTurnPolicyMsg(null);

    try {
      await safeGetAuthedUserId(storeUser?.id);

      const { data: ch, error: chErr } = await supabase
        .from("challenges")
        .select(
          "id, title, game_type, status, kind, created_by, entry_fee_cents, win_reward_cents, winner_user_id, completed_at, league_id, result_reported_by, result_confirm_by, pending_winner_user_id"
        )
        .eq("id", challengeId)
        .single();

      if (chErr || !ch) throw new Error(chErr?.message ?? "Challenge not found.");

      const playersRes = await supabase
        .from("challenge_players")
        .select("id, challenge_id, user_id, role, score, submitted, checked_in_at")
        .eq("challenge_id", challengeId);

      if (playersRes.error) throw new Error(playersRes.error.message);
      let playersRows = playersRes.data;

      const ids = Array.from(new Set((playersRows ?? []).map((p: any) => String(p.user_id))));
      let byId: Record<string, ProfileRow> = {};

      if (ids.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", ids);

        if (!profErr && profs?.length) {
          byId = Object.fromEntries(profs.map((p: any) => [String(p.id), p]));
        }
      }

      const eventsRes = await supabase
        .from("challenge_events")
        .select("id, challenge_id, type, actor_user_id, target_user_id, body, payload, created_at")
        .eq("challenge_id", challengeId)
        .order("created_at", { ascending: true });
      let eventRows = eventsRes.data;

      let tRow: TurnRow | null = null;
      const gt = String((ch as any)?.game_type ?? "");

      if (isTurnBasedGameType(gt)) {
        const { data: t, error: tErr } = await supabase
          .from("challenge_turns")
          .select("challenge_id, current_turn_user_id, state, move_count, updated_at")
          .eq("challenge_id", challengeId)
          .maybeSingle();

        if (tErr) {
          const msg = String(tErr.message ?? "");
          if (msg.toLowerCase().includes("row-level security")) {
            setTurnPolicyBlocked(true);
            setTurnPolicyMsg("challenge_turns blocked by RLS. Add SELECT policy for participants.");
            tRow = null;
          } else {
            throw new Error(tErr.message);
          }
        } else {
          tRow = (t as any) ?? null;
        }

        const creatorUserId = (playersRows ?? []).find((p: any) => p.role === "creator")?.user_id ?? null;
        const oppUserId = (playersRows ?? []).find((p: any) => p.role === "opponent")?.user_id ?? null;
        const statusOk = (ch as any)?.status === "accepted" || (ch as any)?.status === "in-progress";

        if (statusOk && creatorUserId && oppUserId) {
          const ensured = await ensureTurnRowSafe({ challengeId, creatorUserId });

          if (ensured.blockedByRls) {
            setTurnPolicyBlocked(true);
            setTurnPolicyMsg(ensured.message ?? "RLS blocked insert/update on challenge_turns.");
          } else if (ensured.row) {
            tRow = ensured.row;
          }
        }
      }

      if (!mountedRef.current) return;

      if (String((ch as any)?.kind ?? "").toLowerCase() === "egame" && (ch as any)?.status === "awaiting_confirmation") {
        await tryAutoConfirmEgameResult(challengeId).catch(() => {});
        const { data: refreshedEgame } = await supabase
          .from("challenges")
          .select(
            "id, title, game_type, status, kind, created_by, entry_fee_cents, win_reward_cents, winner_user_id, completed_at, league_id, result_reported_by, result_confirm_by, pending_winner_user_id"
          )
          .eq("id", challengeId)
          .single();
        if (refreshedEgame) Object.assign(ch as any, refreshedEgame);
      }

      if (storeUser?.id && (ch as any)?.status !== "completed") {
        const repaired = await repairChallengeCompletion({
          challengeId,
          actorUserId: storeUser.id,
        }).catch(() => false);
        if (repaired) {
          const { data: refreshed } = await supabase
            .from("challenges")
            .select("id, title, game_type, status, created_by, entry_fee_cents, win_reward_cents, winner_user_id, completed_at")
            .eq("id", challengeId)
            .single();
          if (refreshed) Object.assign(ch as any, refreshed);
          const { data: refreshedPlayers } = await supabase
            .from("challenge_players")
            .select("id, challenge_id, user_id, role, score, submitted, checked_in_at")
            .eq("challenge_id", challengeId);
          if (refreshedPlayers) playersRows = refreshedPlayers as any;
          const { data: refreshedEvents } = await supabase
            .from("challenge_events")
            .select("id, challenge_id, type, actor_user_id, target_user_id, body, payload, created_at")
            .eq("challenge_id", challengeId)
            .order("created_at", { ascending: true });
          if (refreshedEvents) eventRows = refreshedEvents as any;
        }
      }

      setChallenge(ch as any);
      setPlayers((playersRows ?? []) as any);
      setProfilesById(byId);
      setEvents((eventRows ?? []) as any);
      setTurns(tRow);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setErr(e?.message ?? "Failed to load challenge");
      setChallenge(null);
      setPlayers([]);
      setProfilesById({});
      setEvents([]);
      setTurns(null);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [challengeId, storeUser?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const safeRefreshWallet = useCallback(async () => {
    try {
      const ok = await safeHasSession();
      if (!ok) return;
      const fn = walletStore?.refresh ?? walletStore?.loadFromBackend;
      if (typeof fn === "function") await fn();
    } catch {
      // swallow
    }
  }, [walletStore]);

  const handleJoin = async () => {
    const meId = await safeGetAuthedUserId(storeUser?.id);
    if (!meId) {
      Alert.alert("Sign in required", "Log in to join challenges.");
      return;
    }
    if (!challengeId) return;

    try {
      setLoading(true);
      await joinChallenge(challengeId, meId);
      await safeRefreshWallet();

      await supabase.from("challenge_events").insert({
        challenge_id: challengeId,
        type: "accepted",
        actor_user_id: meId,
        body: `${myName} accepted the challenge.`,
        payload: {},
      });

      await load();
    } catch (e: any) {
      Alert.alert("Join failed", e?.message ?? "Could not join.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async () => {
    if (!challenge || !challengeId) return;

    const meId = await safeGetAuthedUserId(storeUser?.id);
    if (!meId) {
      Alert.alert("Sign in required", "Log in to play.");
      return;
    }

    if (isEgame) {
      Alert.alert("E-game", "Play on your console or PC, then tap Report Winner when finished.");
      return;
    }

    if (manual) {
      Alert.alert("Manual challenge", "This is an in-person challenge. Use “Report Result” when done.");
      return;
    }

    if (!creator || !opponent) {
      Alert.alert("Not ready", "Waiting for both players to join.");
      return;
    }

    if (turnBased && turnPolicyBlocked) {
      Alert.alert(
        "Turn system needs DB policy",
        "challenge_turns is blocked by RLS. Add participant policies for SELECT/INSERT/UPDATE."
      );
      return;
    }

    try {
      setLoading(true);

      if (challenge.status === "accepted") {
        await startChallengeMatch(challengeId);

        await ensureEventOnce({
          challengeId,
          type: "started",
          actorUserId: meId,
          body: `${myName} started the match.`,
          payload: {},
        });

        if (turnBased && creator.user_id) {
          const ensured = await ensureTurnRowSafe({ challengeId, creatorUserId: creator.user_id });

          if (ensured.blockedByRls) {
            setTurnPolicyBlocked(true);
            setTurnPolicyMsg(ensured.message ?? "RLS blocked insert/update on challenge_turns.");
            Alert.alert(
              "DB policy required",
              "challenge_turns insert/update is blocked by RLS. Add participant policies for SELECT/INSERT/UPDATE."
            );
            return;
          }

          if (ensured.row) setTurns(ensured.row);
        }
      }

      const playRoute = routeForGame(challenge.game_type);
      if (!playRoute) {
        Alert.alert("No play screen", "This game has no phone play screen.");
        return;
      }

      router.replace({
        pathname: playRoute as any,
        params: { challengeId },
      });
    } catch (e: any) {
      Alert.alert("Could not start", e?.message ?? "Failed to start game.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async () => {
    const meId = await safeGetAuthedUserId(storeUser?.id);
    if (!meId || !challengeId) return;
    setLoading(true);
    try {
      await checkInToInPersonChallenge({ challengeId, userId: meId });
      await load();
    } catch (e: any) {
      Alert.alert("Check-in failed", e?.message ?? "Could not check in.");
    } finally {
      setLoading(false);
    }
  };

  const handleReportResult = () => {
    if (isAiProofMatch) {
      setEgameReportOpen(true);
      return;
    }
    router.push({ pathname: "/challenge/[id]/submit", params: { id: challengeId } });
  };

  const handleMatchReport = async (params: {
    winner: "me" | "opponent" | "tie";
    reportedScore?: string | null;
    proofBundle: { storagePath: string; proofType: "video" | "photo" | "scorecard" }[];
  }) => {
    const meId = await safeGetAuthedUserId(storeUser?.id);
    if (!meId || !challengeId) return;

    setEgameSubmitting(true);
    try {
      const oppId = players.find((p) => p.user_id !== meId)?.user_id ?? null;
      let winnerUserId: string | null = null;
      if (params.winner === "me") winnerUserId = meId;
      else if (params.winner === "opponent") winnerUserId = oppId;
      else winnerUserId = null;

      const primaryPath = params.proofBundle[0]?.storagePath ?? null;
      await reportMatchWinner({
        challengeId,
        reporterUserId: meId,
        winnerUserId,
        reportedScore: params.reportedScore ?? null,
        proofMediaPath: primaryPath,
        proofBundle: params.proofBundle,
      });

      setEgameReportOpen(false);
      const review = await fetchLatestAiReview(challengeId);
      setAiReview(review);
      await load();
    } catch (e: any) {
      Alert.alert("Report failed", e?.message ?? "Could not report result.");
    } finally {
      setEgameSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!challengeId) return;

    Alert.alert("Cancel challenge?", "Creator will refund if applicable.", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            await cancelChallenge({ challengeId, reason: "creator_cancel" });
            await safeRefreshWallet();

            await supabase.from("challenge_events").insert({
              challenge_id: challengeId,
              type: "cancelled",
              actor_user_id: storeUser?.id ?? null,
              body: "Challenge was cancelled.",
              payload: {},
            });

            await load();
          } catch (e: any) {
            Alert.alert("Cancel failed", e?.message ?? "Could not cancel.");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const renderEvent = useCallback(
    ({ item }: { item: ChallengeEventRow }) => {
      const meId = storeUser?.id;
      const isMe = !!(meId && item.actor_user_id === meId);

      const safeBody =
        item.body ??
        (() => {
          const actor = displayNameFor(item.actor_user_id, profilesById);
          if (item.type === "challenge_created") return "Challenge created.";
          if (item.type === "accepted" || item.type === "challenge_accepted") return `${actor} joined the challenge.`;
          if (item.type === "completed" || item.type === "challenge_completed") return "Match completed.";
          if (item.type === "cancelled") return "Challenge was cancelled.";
          return `${actor} updated the match.`;
        })();

      const align: "left" | "right" | "center" =
        item.type === "system" || !item.actor_user_id ? "center" : isMe ? "right" : "left";

      const rowStyle = vStyle(
        styles.msgRow,
        align === "right" ? { justifyContent: "flex-end" } : undefined,
        align === "center" ? { justifyContent: "center" } : undefined
      );

      const bubbleStyle = vStyle(
        styles.bubble,
        align === "left" ? styles.bubbleLeft : undefined,
        align === "right" ? styles.bubbleRight : undefined,
        align === "center" ? styles.bubbleCenter : undefined
      );

      return (
        <View style={rowStyle}>
          <View style={bubbleStyle}>
            <Text style={styles.bubbleText}>{safeBody}</Text>
            <Text style={styles.bubbleTime}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    },
    [storeUser?.id, profilesById]
  );

  if (loading && !challenge) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{err}</Text>
        <Pressable style={styles.secondaryBtn} onPress={load}>
          <Text style={styles.secondaryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Challenge not found.</Text>
      </View>
    );
  }

  const cta = (() => {
    if (!storeUser?.id) return { label: "Log in", onPress: () => router.push("/auth/login"), disabled: false };

    if (challenge.status === "open") {
      if (canJoin) return { label: loading ? "Joining…" : "Join Challenge", onPress: handleJoin, disabled: loading };
      return { label: "Waiting…", onPress: load, disabled: false };
    }

    if (turnBased) {
      if (!creator || !opponent) return { label: "Waiting for opponent…", onPress: load, disabled: false };

      if (turnPolicyBlocked) {
        return {
          label: "Turn setup needed",
          onPress: () =>
            Alert.alert(
              "DB policy required",
              turnPolicyMsg ?? "challenge_turns is blocked by RLS. Add participant policies for SELECT/INSERT/UPDATE."
            ),
          disabled: false,
        };
      }

      if (!turns?.current_turn_user_id) return { label: "Match starting…", onPress: load, disabled: false };
      if (!isMyTurn) return { label: "Opponent’s turn", onPress: load, disabled: false };
      return { label: loading ? "Opening…" : "Your turn — Play", onPress: handlePlay, disabled: loading };
    }

    if (canPlay) return { label: loading ? "Starting…" : "Play Game", onPress: handlePlay, disabled: loading };

    // ✅ FIX: remove impossible "status !== open" comparison (open is already handled above)
    if (isInPerson && challenge.status === "accepted" && !mePlayer?.checked_in_at) {
      return { label: loading ? "Checking in…" : "Check In", onPress: handleCheckIn, disabled: loading };
    }

    if (isInPerson && bothCheckedIn && challenge.status === "checked-in" && !mePlayer?.submitted) {
      return { label: "Report + AI Proof", onPress: handleReportResult, disabled: false };
    }

    if (isAiProofMatch && challenge.status === "awaiting_confirmation") {
      const iReported = challenge.result_reported_by === storeUser?.id;
      if (iReported) return { label: "Awaiting opponent confirm…", onPress: load, disabled: false };
      return { label: "Confirm in thread", onPress: () => router.push("/(tabs)/matches" as any), disabled: false };
    }

    if (isEgame && !["completed", "cancelled", "disputed", "awaiting_confirmation"].includes(challenge.status) && !mePlayer?.submitted) {
      return { label: "Report Winner + Proof", onPress: handleReportResult, disabled: false };
    }

    if (manual && challenge.status !== "cancelled" && !mePlayer?.submitted)
      return { label: "Report Result", onPress: handleReportResult, disabled: false };

    if (challenge.status === "completed") return { label: "View Results", onPress: load, disabled: false };

    return { label: "Waiting…", onPress: load, disabled: false };
  })();

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hTitle}>{challenge.title ?? "Challenge"}</Text>
            <Text style={styles.hSub}>
              vs <Text style={styles.bold}>{opponentName}</Text> • {challenge.game_type ?? "Game"}
            </Text>
          </View>

          <Pressable onPress={load} style={({ pressed }) => [styles.refreshBtn, pressed ? { opacity: 0.85 } : null]}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {gameRules?.length ? (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>How to play</Text>
            {gameRules.map((rule) => (
              <Text key={rule} style={styles.rulesLine}>
                • {rule}
              </Text>
            ))}
          </View>
        ) : null}

        {isInPerson && inPersonVision ? (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>Arena Vision — In-Person</Text>
            <Text style={styles.rulesLine}>• Check in → play → record proof (required)</Text>
            <Text style={styles.rulesLine}>• {inPersonVision.proofHint}</Text>
            <Text style={styles.rulesLine}>
              • AI reviews proof
              {inPersonVision.usesShotTracker ? " + shot tracking" : ""}
              {inPersonVision.usesGolfAi ? " + scorecard/swing" : ""}
              {" → opponent confirms → leaderboard sync"}
            </Text>
            {bothCheckedIn && visionRecordLink ? (
              <Pressable
                onPress={() => router.push(visionRecordLink as any)}
                style={({ pressed }) => [styles.visionLinkBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.visionLinkBtnText}>Record with Arena Vision</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isEgame ? (
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>AI Proof Review</Text>
            <Text style={styles.rulesLine}>• Upload 1–3 clips/photos once at end of match</Text>
            <Text style={styles.rulesLine}>• AI summarizes proof — opponent confirms</Text>
            <Text style={styles.rulesLine}>• Opponent has 12 hours to confirm or dispute</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>Entry fee</Text>
            <Text style={styles.value}>{entryFee > 0 ? formatUSDFromCents(entryFee) : "Free"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>Winner gets</Text>
            <Text style={styles.value}>{reward > 0 ? formatUSDFromCents(reward) : "$0.00"}</Text>
          </View>
        </View>

        {turnBased ? (
          <View style={vStyle(styles.pill, { marginTop: 10 })}>
            <Text style={styles.pillText}>
              {turnPolicyBlocked
                ? "Turn system blocked by DB policy (challenge_turns RLS)."
                : turns?.current_turn_user_id
                  ? `Moves: ${Number(turns.move_count ?? 0)} • Turn: ${
                      turns.current_turn_user_id === storeUser?.id ? "You" : opponentName
                    }`
                  : "Turn system: starting…"}
            </Text>
          </View>
        ) : waitingLine ? (
          <View style={vStyle(styles.pill, { marginTop: 10 })}>
            <Text style={styles.pillText}>{waitingLine}</Text>
          </View>
        ) : null}

        {winnerLine ? (
          <View style={vStyle(styles.winnerBanner, { marginTop: 10 })}>
            <Text style={styles.winnerBannerText}>{winnerLine}</Text>
          </View>
        ) : null}

        {creator && opponent ? (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreTitle}>{challenge.status === "completed" ? "Results" : "Progress"}</Text>

            <Text style={styles.scoreLine}>
              You:{" "}
              <Text style={styles.bold}>
                {challenge.status === "completed" || meSubmitted ? (mePlayer?.score ?? "—") : "—"}
              </Text>
            </Text>

            <Text style={styles.scoreLine}>
              Opponent:{" "}
              <Text style={styles.bold}>{canRevealOpponentScore ? (oppPlayer?.score ?? "—") : "Hidden"}</Text>
            </Text>

            {oneAttempt && !canRevealOpponentScore && (meSubmitted || oppSubmitted) ? (
              <Text style={styles.scoreHint}>Opponent score reveals after both players submit.</Text>
            ) : null}
          </View>
        ) : null}

        {challenge.status === "completed" && rivalSuggestions.length > 0 ? (
          <View style={styles.rivalsCard}>
            <Text style={styles.rivalsTitle}>Suggested rivals</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rivalsRow}
            >
              {rivalSuggestions.map((r) => (
                <Pressable
                  key={r.userId}
                  disabled={!r.canReveal}
                  onPress={() => {
                    if (!r.canReveal) return;
                    router.push(`/user/${r.userId}` as any);
                  }}
                  style={({ pressed }) => [
                    styles.rivalChip,
                    !r.canReveal && { opacity: 0.7 },
                    pressed && r.canReveal ? { transform: [{ scale: 0.99 }] } : null,
                  ]}
                >
                  <Text style={styles.rivalEmoji}>🏆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rivalName} numberOfLines={1}>
                      {r.canReveal ? r.displayName : "Rival"}
                    </Text>
                    <Text style={styles.rivalMeta} numberOfLines={1}>
                      {r.wins} win{r.wins === 1 ? "" : "s"}
                      {r.prizeCents > 0 ? ` · ${formatUSDFromCents(r.prizeCents)}` : ""}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {turnPolicyBlocked ? (
          <View style={styles.policyCard}>
            <Text style={styles.policyTitle}>Turn-based games need one DB policy</Text>
            <Text style={styles.policyText}>
              Your app is trying to create/update a row in <Text style={styles.bold}>challenge_turns</Text>, but
              Supabase RLS is blocking it.
            </Text>
            <Text style={styles.policyText}>
              Fix: add SELECT/INSERT/UPDATE policies that allow participants (challenge_players) to access their
              challenge_turns row.
            </Text>
          </View>
        ) : null}
      </View>

      <FlatList
        data={threadEvents}
        keyExtractor={(x) => x.id}
        renderItem={renderEvent}
        style={styles.threadList}
        contentContainerStyle={
          threadEvents.length === 0
            ? styles.threadListEmpty
            : { paddingTop: 8, paddingBottom: 110 }
        }
        ListEmptyComponent={
          <View style={styles.emptyThread}>
            <Text style={styles.emptyThreadText}>
              Challenge updates like creation, joining, and results will show here.
            </Text>
          </View>
        }
      />

      <View style={styles.bottomBar}>
        {canCancel ? (
          <Pressable style={styles.dangerBtn} onPress={handleCancel} disabled={loading}>
            <Text style={styles.primaryText}>Cancel</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={vStyle(styles.primaryBtn, cta.disabled ? { opacity: 0.6 } : null)}
          onPress={cta.onPress}
          disabled={cta.disabled}
        >
          <Text style={styles.primaryText}>{cta.label}</Text>
        </Pressable>
      </View>

      <MatchProofBundleModal
        visible={egameReportOpen}
        challengeId={challengeId}
        challengeKind={challenge.kind}
        gameType={challenge.game_type}
        entryFeeCents={challenge.entry_fee_cents}
        winRewardCents={challenge.win_reward_cents}
        leagueId={challenge.league_id}
        reporterUserId={String(storeUser?.id ?? "")}
        opponentUserId={String(opponentId ?? "")}
        loading={egameSubmitting}
        onClose={() => setEgameReportOpen(false)}
        onSubmit={handleMatchReport}
      />

      {aiReview ? <AiReviewCard review={aiReview} /> : null}

      <MatchResultModal
        visible={matchResultOpen}
        gameTitle={challenge.game_type ?? challenge.title ?? "Match"}
        gameKey={challenge.game_type}
        outcome={matchOutcome}
        scoreLabel={
          matchOutcome?.myScore != null
            ? `You: ${matchOutcome.myScore}${matchOutcome.opponentScore != null ? ` · Opponent: ${matchOutcome.opponentScore}` : ""}`
            : null
        }
        challengeId={challengeId}
        opponentUserId={opponentId}
        onClose={() => setMatchResultOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#050819" },

  headerCard: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#050819",
  },

  threadList: { flex: 1 },
  threadListEmpty: { flexGrow: 1, paddingBottom: 110 },

  headerTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  rulesCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rulesTitle: { color: "#fff", fontWeight: "900", marginBottom: 6, fontSize: 13 },
  rulesLine: { color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, lineHeight: 18, marginTop: 2 },
  visionLinkBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(79,109,245,0.2)",
    borderWidth: 1,
    borderColor: "rgba(99,120,255,0.4)",
    alignItems: "center",
  },
  visionLinkBtnText: { color: "#8aa0ff", fontWeight: "900", fontSize: 13 },
  hTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  hSub: { color: "rgba(255,255,255,0.60)", fontWeight: "800", marginTop: 2 },
  bold: { fontWeight: "900", color: "#fff" },

  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  refreshText: { color: "#fff", fontWeight: "900" },

  statsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  muted: { color: "rgba(255,255,255,0.55)", fontWeight: "800" },
  value: { color: "#fff", fontWeight: "900", marginTop: 4 },

  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pillText: { color: "#fff", fontWeight: "800" },

  winnerBanner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(250,204,21,0.12)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.35)",
  },
  winnerBannerText: { color: "#fde68a", fontWeight: "900", fontSize: 15, textAlign: "center" },

  scoreCard: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 12,
  },
  scoreTitle: { color: "#fff", fontWeight: "900", marginBottom: 6 },
  scoreLine: { color: "rgba(255,255,255,0.75)", fontWeight: "800", marginTop: 2 },
  scoreHint: { color: "rgba(255,255,255,0.55)", fontWeight: "800", marginTop: 8 },

  rivalsCard: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 12,
  },
  rivalsTitle: { color: "#fff", fontWeight: "900", marginBottom: 10 },
  rivalsRow: { gap: 10 },
  rivalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: 190,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rivalEmoji: { fontSize: 18 },
  rivalName: { color: "#fff", fontWeight: "900", fontSize: 13 },
  rivalMeta: { color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12, marginTop: 2 },

  emptyThread: {
    marginTop: 12,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyThreadText: { color: "rgba(255,255,255,0.6)", fontWeight: "800" },

  policyCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
  },
  policyTitle: { color: "#fff", fontWeight: "900", marginBottom: 6 },
  policyText: { color: "rgba(255,255,255,0.78)", fontWeight: "800", marginTop: 4 },

  msgRow: { paddingHorizontal: 16, marginTop: 10, flexDirection: "row" },
  bubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  bubbleLeft: { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.10)" },
  bubbleRight: { backgroundColor: "rgba(99,102,241,0.18)", borderColor: "rgba(99,102,241,0.35)" },
  bubbleCenter: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" },
  bubbleText: { color: "#fff", fontWeight: "800" },
  bubbleTime: { color: "rgba(255,255,255,0.45)", fontWeight: "800", marginTop: 6, fontSize: 12 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    paddingBottom: 18,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(5,8,25,0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerBtn: {
    backgroundColor: "rgba(239,68,68,0.25)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryText: { color: "#e5e7eb", fontWeight: "900" },

  error: { color: "#fff", fontWeight: "900", marginBottom: 10, textAlign: "center" },
});
