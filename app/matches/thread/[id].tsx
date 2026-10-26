// ✅ app/matches/thread/[id].tsx
// WHAT I FIXED (no fluff):
// 1) Removed the local ChallengeRow type (stop duplicating it in screens)
// 2) Imported ChallengeRow from lib/models/challengeTypes
// 3) Updated BOTH challenge selects (initial load + realtime hydrate) to include the missing columns:
//    created_by, opponent_user_id, invited_user_id, invite_only
//    (and kept your turn columns too)

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../../lib/backend/supabaseClient";
import { useAuthStore } from "../../../lib/data/authStore";
import MatchResultModal from "../../../lib/ui/MatchResultModal";

// ✅ shared types
import type { ChallengeRow } from "../../../lib/models/challengeTypes";

// UI components
import ActiveChallengePin from "../../../components/thread/ActiveChallengePin";
import ChallengeCenterSheet from "../../../components/thread/ChallengeCenterSheet";
import ThreadActionCard from "../../../components/thread/ThreadActionCard";
import ThreadMatchResultCard from "../../../components/thread/ThreadMatchResultCard";
import ThreadMessageItem from "../../../components/thread/ThreadMessageItem";
import Avatar from "../../../lib/ui/Avatar";

// game label helpers
import { isOneAttemptGameType, isTurnBasedGameType } from "../../../lib/data/gameConfig";
import {
  deriveChallengeActionState,
  isActionPromptType,
  isTerminalChallenge,
  type ChallengeActionState,
} from "../../../lib/thread/challengeState";
import {
  enrichThreadEventTitle,
  formatThreadChallengeMeta,
  gameTitleForThread,
  isMatchCompleteMessage,
  mergeGameIntoTitle,
  threadEventIconName,
} from "../../../lib/thread/threadMessageDisplay";

// Backend actions (same ones challenge screen uses)
import { checkInToInPersonChallenge, joinChallenge, pollChallengeOutcome, submitInPersonResult, type ChallengeOutcome } from "../../../lib/backend/challengeActions";
import {
  confirmEgameResult,
  disputeEgameResult,
  reportMatchWinner,
  tryAutoConfirmEgameResult,
} from "../../../lib/backend/matchVerification";
import MatchProofBundleModal from "../../components/MatchProofBundleModal";
import { sendPushToUser } from "../../../lib/backend/pushServiceSend";
import { createRematchOffer, respondToRematchOffer } from "../../../lib/backend/rematchActions";
import {
  appendThreadPrompt,
  buildPromptId,
  resolveThreadPrompt,
  resolveThreadPromptByPromptId,
} from "../../../lib/backend/threadActions";

type ThreadRow = {
  id: string;
  user_low: string;
  user_high: string;
  pair_key: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_preview: string | null;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type ThreadMessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  type: string | null;
  challenge_id: string | null;
  rematch_offer_id: string | null;
  payload: any | null;
  created_at: string | null;
};

type ThreadCardAction = NonNullable<React.ComponentProps<typeof ThreadActionCard>["actions"]>[number];

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayNameFor(p?: ProfileRow | null, fallbackId?: string) {
  if (!p) return fallbackId ? `User ${fallbackId.slice(0, 6)}` : "Opponent";
  return p.display_name || p.username || (fallbackId ? `User ${fallbackId.slice(0, 6)}` : "Opponent");
}

function isMine(meId: string | null, msg: ThreadMessageRow) {
  return Boolean(meId && msg.sender_id && msg.sender_id === meId);
}

function msgText(msg: ThreadMessageRow) {
  const t = String(msg.type ?? "").toLowerCase();
  if (t === "text") return String(msg.payload?.text ?? "").trim();

  const label = String(msg.payload?.label ?? "").trim();
  if (label) return label;

  const body = String(msg.payload?.body ?? "").trim();
  if (body) return body;

  return t ? t.replace(/_/g, " ") : "update";
}

function isEventLike(msg: ThreadMessageRow) {
  const t = String(msg.type ?? "").toLowerCase();
  return t !== "text";
}

function promptConfigFor(msg: ThreadMessageRow) {
  const t = String(msg.type ?? "").toLowerCase();
  const payload = msg.payload ?? {};
  const inferredFromPromptId = (() => {
  if (t !== "prompt") return null;
  const pid = String(payload?.prompt_id ?? payload?.promptId ?? "");
  return pid ? pid.split(":")[0] : null; // "prompt_accept_rematch", etc.
})();

  const yes = payload?.yes_text ?? payload?.yesText ?? payload?.yes ?? undefined;
  const no = payload?.no_text ?? payload?.noText ?? payload?.no ?? undefined;

const isCheckIn = t === "checkin_prompt" || t === "prompt_check_in" || inferredFromPromptId === "prompt_check_in";
const isSubmit = t === "submit_result_prompt" || t === "prompt_submit_result" || inferredFromPromptId === "prompt_submit_result";
const isRematch = t === "rematch_offer" || t === "prompt_accept_rematch" || inferredFromPromptId === "prompt_accept_rematch";
const isTurn = t === "turn_prompt" || t === "prompt_play_turn" || inferredFromPromptId === "prompt_play_turn";
const isConfirm = t === "prompt_confirm_result" || inferredFromPromptId === "prompt_confirm_result";

  if (isCheckIn) {
    return {
      title: payload?.title ?? "Check in?",
      subtitle: payload?.subtitle ?? "Both players must check in before submitting results.",
      yesText: yes ?? "Check In",
      noText: no ?? "Later",
    };
  }

  if (isSubmit) {
    return {
      title: payload?.title ?? "Submit result?",
      subtitle: payload?.subtitle ?? "Submit who won when finished.",
      yesText: yes ?? "Submit",
      noText: no ?? "Later",
    };
  }

  if (isRematch) {
    return {
      title: payload?.title ?? "Rematch?",
      subtitle: payload?.subtitle ?? "Your opponent offered a rematch.",
      yesText: yes ?? "Accept",
      noText: no ?? "Decline",
    };
  }

  if (isTurn) {
    return {
      title: payload?.title ?? "Your turn",
      subtitle: payload?.subtitle ?? "Make your next move to continue.",
      yesText: yes ?? "Play Now",
      noText: no ?? "Later",
    };
  }

  if (isConfirm) {
    return {
      title: payload?.title ?? "Confirm result?",
      subtitle: payload?.subtitle ?? "Opponent reported a winner. Confirm or dispute.",
      yesText: yes ?? "Confirm",
      noText: no ?? "Dispute",
    };
  }

  return null;
}

function isCompletedLike(msgType: string, challenge?: ChallengeRow) {
  const t = String(msgType ?? "").toLowerCase();
  const status = String(challenge?.status ?? "").toLowerCase();
  const settlement = String(challenge?.settlement_status ?? "").toLowerCase();

  return (
    t === "challenge_completed" ||
    t === "payout_processed" ||
    status === "completed" ||
    settlement === "completed" ||
    settlement === "settled" ||
    settlement === "paid" ||
    settlement === "processed"
  );
}

function pickTurnUserId(message: ThreadMessageRow, challenge?: ChallengeRow) {
  const p = message?.payload ?? {};
  return (
    p?.turn_user_id ??
    p?.next_turn_user_id ??
    p?.current_turn_user_id ??
    challenge?.turn_user_id ??
    challenge?.current_turn_user_id ??
    challenge?.next_turn_user_id ??
    null
  );
}

function normalizeKind(raw: any) {
  const k = String(raw ?? "").toLowerCase();
  if (k === "in_person" || k === "in-person" || k === "inperson") return "in_person";
  return k;
}

function formatChallengeFeePrizeMeta(challenge: ChallengeRow): string {
  return formatThreadChallengeMeta({
    gameType: challenge.game_type ?? challenge.game_key,
    entryFeeCents: challenge.entry_fee_cents,
    prizeCents: challenge.win_reward_cents,
  });
}

function profileDisplayName(p?: { display_name?: string | null; username?: string | null } | null, fallbackId?: string) {
  if (!p) return fallbackId ? `User ${fallbackId.slice(0, 6)}` : "Player";
  return p.display_name || p.username || (fallbackId ? `User ${fallbackId.slice(0, 6)}` : "Player");
}

/**
 * Optional: keep prompts in sync for in-person challenges.
 * (This does NOT change challenge behavior; it only backfills prompt messages.)
 */
async function syncInPersonPromptsForChallenge(params: {
  threadId: string;
  challengeId: string;
  meId: string | null;
  threadUserLow: string;
  threadUserHigh: string;
}) {
  const { threadId, challengeId, meId, threadUserLow, threadUserHigh } = params;

  const { data: ch } = await supabase.from("challenges").select("id,kind,status").eq("id", challengeId).maybeSingle();
  if (!ch) return;

  const kind = String((ch as any).kind ?? "").toLowerCase();
  if (kind !== "in_person") return;

  const status = String((ch as any).status ?? "").toLowerCase();
  const terminal = status === "completed" || status === "cancelled" || status === "disputed";

  const { data: ps } = await supabase
    .from("challenge_players")
    .select("user_id,role,submitted,checked_in_at")
    .eq("challenge_id", challengeId);

  if (!ps?.length) return;

  const creatorId = String(ps.find((p: any) => p.role === "creator")?.user_id ?? "");
  const opponentId = String(ps.find((p: any) => p.role === "opponent")?.user_id ?? "");
  if (!creatorId || !opponentId) return;

  const a = String(threadUserLow);
  const b = String(threadUserHigh);
  const inThread = (creatorId === a && opponentId === b) || (creatorId === b && opponentId === a);
  if (!inThread) return;

  const creator = ps.find((p: any) => String(p.user_id) === creatorId);
  const opp = ps.find((p: any) => String(p.user_id) === opponentId);

  const creatorChecked = Boolean(creator?.checked_in_at);
  const oppChecked = Boolean(opp?.checked_in_at);
  const bothChecked = creatorChecked && oppChecked;

  const creatorSubmitted = Boolean(creator?.submitted);
  const oppSubmitted = Boolean(opp?.submitted);

const checkinPromptCreator = buildPromptId({ promptType: "prompt_check_in", challengeId, turnKey: `u:${creatorId}` });
const checkinPromptOpp = buildPromptId({ promptType: "prompt_check_in", challengeId, turnKey: `u:${opponentId}` });

const submitPromptCreator = buildPromptId({ promptType: "prompt_submit_result", challengeId, turnKey: `u:${creatorId}` });
const submitPromptOpp = buildPromptId({ promptType: "prompt_submit_result", challengeId, turnKey: `u:${opponentId}` });

  if (terminal) {
    const fallbackResolver = meId ?? creatorId;
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: checkinPromptCreator,
      resolverUserId: fallbackResolver,
      resolution: "dismiss",
      resolutionLabel: "Closed",
    });
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: checkinPromptOpp,
      resolverUserId: fallbackResolver,
      resolution: "dismiss",
      resolutionLabel: "Closed",
    });
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: submitPromptCreator,
      resolverUserId: fallbackResolver,
      resolution: "dismiss",
      resolutionLabel: "Closed",
    });
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: submitPromptOpp,
      resolverUserId: fallbackResolver,
      resolution: "dismiss",
      resolutionLabel: "Closed",
    });
    return;
  }

  if (!bothChecked) {
    if (!creatorChecked) {
      await appendThreadPrompt({
        threadId,
        promptType: "prompt_check_in",
        promptId: checkinPromptCreator,
        label: "Check in to start this in-person match.",
        challengeId,
        targetUserId: creatorId,
        yesText: "Check In",
        noText: "Later",
        payload: { action: "check_in" },
      });
    } else {
      await resolveThreadPromptByPromptId({
        threadId,
        promptId: checkinPromptCreator,
        resolverUserId: creatorId,
        resolution: "yes",
        resolutionLabel: "Checked in",
      });
    }

    if (!oppChecked) {
      await appendThreadPrompt({
        threadId,
        promptType: "prompt_check_in",
        promptId: checkinPromptOpp,
        label: "Check in to start this in-person match.",
        challengeId,
        targetUserId: opponentId,
        yesText: "Check In",
        noText: "Later",
        payload: { action: "check_in" },
      });
    } else {
      await resolveThreadPromptByPromptId({
        threadId,
        promptId: checkinPromptOpp,
        resolverUserId: opponentId,
        resolution: "yes",
        resolutionLabel: "Checked in",
      });
    }
    return;
  }

  // both checked
  await resolveThreadPromptByPromptId({
    threadId,
    promptId: checkinPromptCreator,
    resolverUserId: creatorId,
    resolution: "yes",
    resolutionLabel: "Checked in",
  });
  await resolveThreadPromptByPromptId({
    threadId,
    promptId: checkinPromptOpp,
    resolverUserId: opponentId,
    resolution: "yes",
    resolutionLabel: "Checked in",
  });

  if (!creatorSubmitted) {
    await appendThreadPrompt({
      threadId,
      promptType: "prompt_submit_result",
      promptId: submitPromptCreator,
      label: "Match finished? Submit the result.",
      challengeId,
      targetUserId: creatorId,
      yesText: "Submit",
      noText: "Later",
      payload: { action: "submit_result" },
    });
  } else {
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: submitPromptCreator,
      resolverUserId: creatorId,
      resolution: "yes",
      resolutionLabel: "Submitted",
    });
  }

  if (!oppSubmitted) {
    await appendThreadPrompt({
      threadId,
      promptType: "prompt_submit_result",
      promptId: submitPromptOpp,
      label: "Match finished? Submit the result.",
      challengeId,
      targetUserId: opponentId,
      yesText: "Submit",
      noText: "Later",
      payload: { action: "submit_result" },
    });
  } else {
    await resolveThreadPromptByPromptId({
      threadId,
      promptId: submitPromptOpp,
      resolverUserId: opponentId,
      resolution: "yes",
      resolutionLabel: "Submitted",
    });
  }
}

export default function ThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();

  const storeUser = useAuthStore((s: any) => s.user);
  const myProfile = useAuthStore((s: any) => s.profile);
  const threadId = String(params.id ?? "");

  const [meId, setMeId] = useState<string | null>(storeUser?.id ?? null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [thread, setThread] = useState<ThreadRow | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<ProfileRow | null>(null);

  const [messages, setMessages] = useState<ThreadMessageRow[]>([]);
  const [challengesById, setChallengesById] = useState<Record<string, ChallengeRow>>({});

  const [record, setRecord] = useState<{ w: number; l: number; t: number }>({ w: 0, l: 0, t: 0 });
  const [text, setText] = useState("");

  const listRef = useRef<FlatList<ThreadMessageRow> | null>(null);

  const [challengeSheetOpen, setChallengeSheetOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // submit modal
  const [submitOpen, setSubmitOpen] = useState(false);
  const [egameReportOpen, setEgameReportOpen] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitChallengeId, setSubmitChallengeId] = useState<string | null>(null);
  const [submitPromptMessageId, setSubmitPromptMessageId] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<{
    outcome: ChallengeOutcome;
    challengeId: string;
    gameTitle: string;
    opponentUserId: string | null;
  } | null>(null);

  const [playerStateByChallengeId, setPlayerStateByChallengeId] = useState<
    Record<string, { meCheckedIn: boolean; oppCheckedIn: boolean; bothCheckedIn: boolean; meSubmitted: boolean; oppSubmitted: boolean }>
  >({});

  // For turn-based games: current_turn_user_id lives in challenge_turns, not challenges
  const [currentTurnByChallengeId, setCurrentTurnByChallengeId] = useState<
    Record<string, { current_turn_user_id: string | null }>
  >({});

  // ensure meId
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (storeUser?.id) {
        if (!cancelled) setMeId(storeUser.id);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setMeId(data?.user?.id ?? null);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [storeUser?.id]);

  const computeRecord = useCallback(async (myId: string, oppId: string) => {
    try {
      const { data: myRows, error: myErr } = await supabase.from("challenge_players").select("challenge_id").eq("user_id", myId);
      if (myErr) return;

      const { data: oppRows, error: oppErr } = await supabase.from("challenge_players").select("challenge_id").eq("user_id", oppId);
      if (oppErr) return;

      const mySet = new Set((myRows ?? []).map((r: any) => String(r.challenge_id)));
      const shared = (oppRows ?? []).map((r: any) => String(r.challenge_id)).filter((cid: string) => mySet.has(cid));

      if (!shared.length) {
        setRecord({ w: 0, l: 0, t: 0 });
        return;
      }

      const { data: chs, error: chErr } = await supabase
        .from("challenges")
        .select("id,status,winner_user_id")
        .in("id", shared)
        .eq("status", "completed");

      if (chErr) return;

      let w = 0,
        l = 0,
        t = 0;
      for (const c of (chs ?? []) as any[]) {
        const winner = c?.winner_user_id ? String(c.winner_user_id) : null;
        if (!winner) t += 1;
        else if (winner === myId) w += 1;
        else l += 1;
      }
      setRecord({ w, l, t });
    } catch {
      // ignore
    }
  }, []);

  const hydrateTurnState = useCallback(async (chIds: string[]) => {
    if (!chIds.length) return;
    const { data: turnsRows } = await supabase
      .from("challenge_turns")
      .select("challenge_id,current_turn_user_id")
      .in("challenge_id", chIds);
    if (!turnsRows?.length) return;
    const next: Record<string, { current_turn_user_id: string | null }> = {};
    for (const r of turnsRows as any[]) {
      next[String(r.challenge_id)] = { current_turn_user_id: r.current_turn_user_id ?? null };
    }
    setCurrentTurnByChallengeId((prev) => ({ ...prev, ...next }));
  }, []);

  const hydratePlayerStates = useCallback(async (myId: string, chIds: string[]) => {
    if (!chIds.length) return;

    const { data: pr } = await supabase
      .from("challenge_players")
      .select("challenge_id,user_id,submitted,checked_in_at")
      .in("challenge_id", chIds);

    if (!pr?.length) return;

    const next: Record<string, any> = {};
    for (const cid of chIds) {
      const rows = pr.filter((r: any) => String(r.challenge_id) === String(cid));
      const meRow = rows.find((r: any) => String(r.user_id) === String(myId));
      const oppRow = rows.find((r: any) => String(r.user_id) !== String(myId));

      const meCheckedIn = Boolean(meRow?.checked_in_at);
      const oppCheckedIn = Boolean(oppRow?.checked_in_at);

      next[String(cid)] = {
        meCheckedIn,
        oppCheckedIn,
        bothCheckedIn: meCheckedIn && oppCheckedIn,
        meSubmitted: Boolean(meRow?.submitted),
        oppSubmitted: Boolean(oppRow?.submitted),
      };
    }

    setPlayerStateByChallengeId(next);
  }, []);

  const load = useCallback(async () => {
    if (!threadId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: tRow, error: tErr } = await supabase
        .from("threads")
        .select("id,user_low,user_high,pair_key,created_at,last_message_at,last_preview")
        .eq("id", threadId)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!tRow) throw new Error("Thread not found (RLS?).");

      const tr = tRow as any as ThreadRow;
      setThread(tr);

      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;

      if (myId) {
        const opp = String(tr.user_low) === String(myId) ? String(tr.user_high) : String(tr.user_low);
        setOpponentId(opp);

        const { data: prof } = await supabase.from("profiles").select("id,username,display_name,avatar_url").eq("id", opp).maybeSingle();
        setOpponentProfile((prof as any) ?? null);

        computeRecord(String(myId), String(opp));
      } else {
        setOpponentId(null);
        setOpponentProfile(null);
      }

      const { data: mRows, error: mErr } = await supabase
        .from("thread_messages")
        .select("id,thread_id,sender_id,type,challenge_id,rematch_offer_id,payload,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (mErr) throw mErr;

      const msgs = (mRows ?? []) as any as ThreadMessageRow[];
      setMessages(msgs);

      const chIds = Array.from(new Set(msgs.map((m) => m.challenge_id).filter((x): x is string => Boolean(x))));

      if (chIds.length) {
        if (myId) await hydratePlayerStates(String(myId), chIds);
        await hydrateTurnState(chIds);

        const { data: chRows } = await supabase
          .from("challenges")
          .select(
            [
              "id",
              "title",
              "game_type",
              "entry_fee_cents",
              "win_reward_cents",
              "winner_user_id",
              "settlement_status",
              "created_at",
              "updated_at",
              "status",
              "kind",
              "created_by",
              "opponent_user_id",
              "invited_user_id",
              "invite_only",
              "league_id",
              "pending_winner_user_id",
              "result_reported_by",
              "result_reported_at",
              "result_confirm_by",
              "result_proof_path",
            ].join(",")
          )
          .in("id", chIds);

        if (chRows) {
          const map: Record<string, ChallengeRow> = {};
          for (const c of chRows as any[]) map[String(c.id)] = c as any;
          setChallengesById(map);

          for (const c of chRows as any[]) {
            const kind = String(c.kind ?? "").toLowerCase();
            if ((kind === "egame" || kind === "in_person") && c.status === "awaiting_confirmation") {
              await tryAutoConfirmEgameResult(String(c.id)).catch(() => {});
            }
          }
          if (chRows.some((c: any) => c.status === "awaiting_confirmation")) {
            const { data: refreshed } = await supabase
              .from("challenges")
              .select(
                "id,title,game_type,entry_fee_cents,win_reward_cents,winner_user_id,settlement_status,created_at,updated_at,status,kind,created_by,opponent_user_id,invited_user_id,invite_only,league_id,pending_winner_user_id,result_reported_by,result_reported_at,result_confirm_by,result_proof_path"
              )
              .in("id", chIds);
            if (refreshed) {
              const map2: Record<string, ChallengeRow> = {};
              for (const c of refreshed as any[]) map2[String(c.id)] = c as any;
              setChallengesById(map2);
            }
          }
        }
      }

      // best-effort prompt sync (in-person)
      try {
        const myId2 = myId ? String(myId) : null;
        if (myId2 && tr?.user_low && tr?.user_high) {
          for (const cid of chIds) {
            await syncInPersonPromptsForChallenge({
              threadId,
              challengeId: String(cid),
              meId: myId2,
              threadUserLow: String(tr.user_low),
              threadUserHigh: String(tr.user_high),
            });
          }
        }
      } catch {
        // ignore
      }

      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load thread.");
    } finally {
      setLoading(false);
    }
  }, [threadId, meId, storeUser?.id, computeRecord, hydratePlayerStates, hydrateTurnState]);

  useEffect(() => {
    load();
  }, [load]);

  // realtime: INSERT + UPDATE
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`thread_messages:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        async (payload) => {
          const row = payload.new as any as ThreadMessageRow;

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const next = [...prev, row];
            next.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
            return next;
          });

          if (row.challenge_id) {
            const cid = String(row.challenge_id);
            const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;

            if (myId) {
              const { data: pr } = await supabase
                .from("challenge_players")
                .select("challenge_id,user_id,submitted,checked_in_at")
                .eq("challenge_id", cid);

              if (pr?.length) {
                const rows = pr as any[];
                const meRow = rows.find((r) => String(r.user_id) === String(myId));
                const oppRow = rows.find((r) => String(r.user_id) !== String(myId));

                const meCheckedIn = Boolean(meRow?.checked_in_at);
                const oppCheckedIn = Boolean(oppRow?.checked_in_at);

                setPlayerStateByChallengeId((prev) => ({
                  ...prev,
                  [cid]: {
                    meCheckedIn,
                    oppCheckedIn,
                    bothCheckedIn: meCheckedIn && oppCheckedIn,
                    meSubmitted: Boolean(meRow?.submitted),
                    oppSubmitted: Boolean(oppRow?.submitted),
                  },
                }));
              }
            }

            // ✅ hydrate challenge details if missing (include the SAME fields)
            if (!challengesById[cid]) {
              const { data: ch } = await supabase
                .from("challenges")
                .select(
                  [
                    "id",
                    "title",
                    "game_type",
                    "entry_fee_vc",
                    "win_reward_vc",
                    "winner_user_id",
                    "settlement_status",
                    "created_at",
                    "updated_at",
                    "status",
                    "kind",
                    "created_by",
                    "opponent_user_id",
                    "invited_user_id",
                    "invite_only",
                  ].join(",")
                )
                .eq("id", cid)
                .maybeSingle();

              if (ch) setChallengesById((prev) => ({ ...prev, [String((ch as any).id)]: ch as any }));
            }
            // Refresh turn state for turn-based games
            const { data: tRow } = await supabase
              .from("challenge_turns")
              .select("challenge_id,current_turn_user_id")
              .eq("challenge_id", cid)
              .maybeSingle();
            if (tRow) {
              setCurrentTurnByChallengeId((prev) => ({
                ...prev,
                [cid]: { current_turn_user_id: (tRow as any).current_turn_user_id ?? null },
              }));
            }
          }

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as any as ThreadMessageRow;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === row.id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, meId, storeUser?.id, challengesById]);

  const onResync = useCallback(async () => {
    await load();
  }, [load]);

  const onHelp = useCallback(() => {
    Alert.alert(
      "Match verification",
      "E-games: winner reports, opponent confirms or disputes within 12 hours. Proof is optional for free matches; required when money or crowns are on the line."
    );
  }, []);

  const sendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
    if (!myId) return;

    setSending(true);
    try {
      const { error: insErr } = await supabase.from("thread_messages").insert({
        thread_id: threadId,
        sender_id: myId,
        type: "text",
        payload: { text: trimmed },
      });

      if (insErr) throw insErr;

      supabase.from("threads").update({ last_message_at: nowIso(), last_preview: trimmed.slice(0, 120) }).eq("id", threadId);

      setText("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (e: any) {
      Alert.alert("Send failed", e?.message ?? "Could not send message.");
    } finally {
      setSending(false);
    }
  }, [text, meId, storeUser?.id, threadId]);

  const openChallenge = useCallback((challengeId: string) => router.push(`/challenge/${challengeId}`), [router]);
  const openResults = useCallback((challengeId: string) => router.push(`/challenge/${challengeId}`), [router]);

  const handleJoin = useCallback(
    async (challengeId: string, creatorId?: string | null) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) {
        Alert.alert("Sign in required", "Log in to join challenges.");
        return;
      }
      try {
        setLoading(true);
        await joinChallenge({ challengeId, userId: myId });
        if (creatorId && creatorId !== myId) {
          sendPushToUser({
            targetUserId: creatorId,
            title: "Challenge accepted",
            body: "Someone joined your challenge!",
          }).catch(() => {});
        }
        await load();
      } catch (e: any) {
        Alert.alert("Join failed", e?.message ?? "Could not join.");
      } finally {
        setLoading(false);
      }
    },
    [meId, storeUser?.id, load]
  );

  const onRematch = useCallback(
    async (challengeId: string) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) return Alert.alert("Rematch", "Please log in.");
      if (!opponentId) return Alert.alert("Rematch", "Opponent not loaded yet.");

      try {
        await createRematchOffer({ threadId, sourceChallengeId: challengeId, fromUserId: myId, toUserId: opponentId });
        await supabase.from("threads").update({ last_message_at: nowIso(), last_preview: "Rematch offer — waiting for reply." }).eq("id", threadId);
        await load();
      } catch (e: any) {
        Alert.alert("Rematch failed", e?.message ?? "Could not create rematch offer.");
      }
    },
    [meId, storeUser?.id, opponentId, threadId, load]
  );

  const onPost = useCallback(
    async (challengeId?: string | null) => {
      if (!challengeId) return Alert.alert("Post", "Select a completed challenge to reference.");
      router.push({ pathname: "/create", params: { challenge_id: challengeId } } as any);
    },
    [router]
  );


  // submit modal helpers
  const openSubmitModalForChallenge = useCallback((challengeId: string) => {
    const ch = challengesById[String(challengeId)];
    const kind = String(ch?.kind ?? "").toLowerCase();
    setSubmitChallengeId(String(challengeId));
    setSubmitPromptMessageId(null);
    if (kind === "egame" || kind === "in_person") {
      setEgameReportOpen(true);
    } else {
      setSubmitOpen(true);
    }
  }, [challengesById]);

  const openSubmitModalForPrompt = useCallback((msg: ThreadMessageRow) => {
    if (!msg?.challenge_id) return Alert.alert("Submit", "Missing challenge id.");
    setSubmitChallengeId(String(msg.challenge_id));
    setSubmitPromptMessageId(String(msg.id));
    const ch = challengesById[String(msg.challenge_id)];
    const kind = String(ch?.kind ?? "").toLowerCase();
    if (kind === "egame" || kind === "in_person") {
      setEgameReportOpen(true);
    } else {
      setSubmitOpen(true);
    }
  }, [challengesById]);

  const closeSubmitModal = useCallback(() => {
    setSubmitOpen(false);
    setEgameReportOpen(false);
    setSubmitChallengeId(null);
    setSubmitPromptMessageId(null);
    setSubmitLoading(false);
  }, []);

  const submitEgameWinnerFromModal = useCallback(
    async (params: {
      winner: "me" | "opponent" | "tie";
      reportedScore?: string | null;
      proofBundle: { storagePath: string; proofType: "video" | "photo" | "scorecard" }[];
    }) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId || !submitChallengeId) return;

      setSubmitLoading(true);
      try {
        const { data: ps } = await supabase.from("challenge_players").select("user_id").eq("challenge_id", submitChallengeId);
        const oppId = (ps ?? []).find((p: any) => String(p.user_id) !== String(myId))?.user_id ?? null;

        let winnerUserId: string | null = null;
        if (params.winner === "me") winnerUserId = String(myId);
        else if (params.winner === "opponent") {
          if (!oppId) throw new Error("Opponent not found.");
          winnerUserId = String(oppId);
        }

        await reportMatchWinner({
          challengeId: String(submitChallengeId),
          reporterUserId: String(myId),
          winnerUserId,
          reportedScore: params.reportedScore ?? null,
          proofMediaPath: params.proofBundle[0]?.storagePath ?? null,
          proofBundle: params.proofBundle,
        });

        if (submitPromptMessageId) {
          await resolveThreadPrompt({
            messageId: submitPromptMessageId,
            resolverUserId: String(myId),
            resolution: "yes",
            resolutionLabel: "Winner reported.",
          });
        }

        closeSubmitModal();
        await load();
      } catch (e: any) {
        Alert.alert("Report failed", e?.message ?? "Could not report result.");
        setSubmitLoading(false);
      }
    },
    [submitChallengeId, submitPromptMessageId, meId, storeUser?.id, load, closeSubmitModal]
  );

  const submitWinner = useCallback(
    async (winner: "me" | "opponent" | "tie") => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) return Alert.alert("Submit", "Please log in.");
      if (!submitChallengeId) return;

      setSubmitLoading(true);

      try {
        const { data: ps, error: pErr } = await supabase.from("challenge_players").select("user_id,role").eq("challenge_id", submitChallengeId);
        if (pErr) throw pErr;

        const oppId = (ps ?? []).find((p: any) => String(p.user_id) !== String(myId))?.user_id ?? null;

        let winnerUserId: string | null = null;
        if (winner === "me") winnerUserId = String(myId);
        else if (winner === "opponent") {
          if (!oppId) throw new Error("Opponent not found for this challenge yet.");
          winnerUserId = String(oppId);
        } else {
          winnerUserId = null;
        }

        await submitInPersonResult({ challengeId: String(submitChallengeId), userId: String(myId), winnerUserId } as any);

        if (submitPromptMessageId) {
          await resolveThreadPrompt({
            messageId: submitPromptMessageId,
            resolverUserId: String(myId),
            resolution: "yes",
            resolutionLabel: winner === "me" ? "Submitted: I won" : winner === "opponent" ? "Submitted: Opponent won" : "Submitted: Tie",
          });
        }

        closeSubmitModal();
        await load();

        const outcome = await pollChallengeOutcome({
          challengeId: String(submitChallengeId),
          userId: String(myId),
        });
        if (outcome.status === "completed") {
          const ch = challengesById[String(submitChallengeId)];
          setMatchResult({
            outcome,
            challengeId: String(submitChallengeId),
            gameTitle: ch?.game_type ?? "Match",
            opponentUserId: oppId ? String(oppId) : null,
          });
        }
      } catch (e: any) {
        Alert.alert("Submit failed", e?.message ?? "Could not submit result.");
        setSubmitLoading(false);
      }
    },
    [submitChallengeId, submitPromptMessageId, challengesById, meId, storeUser?.id, load, closeSubmitModal]
  );

  const quickCheckIn = useCallback(
    async (challengeId: string) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) return;

      try {
        await checkInToInPersonChallenge({ challengeId, userId: myId });
        await load();
      } catch (e: any) {
        Alert.alert("Check-in failed", e?.message ?? "Could not check in.");
      }
    },
    [meId, storeUser?.id, load]
  );

  // prompt actions (YES/NO)
  const patchMessagePayloadLocal = useCallback((messageId: string, patch: any) => {
    const mid = String(messageId ?? "");
    if (!mid) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (String(m.id) !== mid) return m;
        const prevPayload = (m as any)?.payload ?? {};
        return { ...m, payload: { ...prevPayload, ...patch } };
      })
    );
  }, []);

  const handlePromptYes = useCallback(
    async (msg: ThreadMessageRow) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) return;

 const t = String(msg.type ?? "").toLowerCase();
const payload = msg.payload ?? {};
const inferred = t === "prompt" ? String(payload?.prompt_id ?? "").split(":")[0] : "";

const isCheckIn = t === "checkin_prompt" || t === "prompt_check_in" || inferred === "prompt_check_in";
const isSubmit  = t === "submit_result_prompt" || t === "prompt_submit_result" || inferred === "prompt_submit_result";
const isRematch = t === "rematch_offer" || t === "prompt_accept_rematch" || inferred === "prompt_accept_rematch";
const isTurn    = t === "turn_prompt" || t === "prompt_play_turn" || inferred === "prompt_play_turn";
const isConfirm = t === "prompt_confirm_result" || inferred === "prompt_confirm_result";

      try {
        if (isConfirm && msg.challenge_id) {
          await confirmEgameResult({
            challengeId: String(msg.challenge_id),
            userId: String(myId),
            promptMessageId: msg.id,
          });
          await load();
          const outcome = await pollChallengeOutcome({
            challengeId: String(msg.challenge_id),
            userId: String(myId),
          });
          if (outcome.status === "completed") {
            const ch = challengesById[String(msg.challenge_id)];
            const { data: ps } = await supabase.from("challenge_players").select("user_id").eq("challenge_id", msg.challenge_id);
            const oppId = (ps ?? []).find((p: any) => String(p.user_id) !== String(myId))?.user_id ?? null;
            setMatchResult({
              outcome,
              challengeId: String(msg.challenge_id),
              gameTitle: ch?.game_type ?? "Match",
              opponentUserId: oppId ? String(oppId) : null,
            });
          }
          return;
        }

        if (isCheckIn && msg.challenge_id) {
          await checkInToInPersonChallenge({ challengeId: msg.challenge_id, userId: myId });

          await resolveThreadPrompt({
            messageId: msg.id,
            resolverUserId: myId,
            resolution: "yes",
            resolutionLabel: "Checked in.",
          });

          await load();
          return;
        }

        if (isSubmit && msg.challenge_id) {
          const ch = challengesById[String(msg.challenge_id)];
          const kind = String(ch?.kind ?? "").toLowerCase();
          setSubmitChallengeId(String(msg.challenge_id));
          setSubmitPromptMessageId(String(msg.id));
          if (kind === "egame" || kind === "in_person") {
            setEgameReportOpen(true);
          } else {
            openSubmitModalForPrompt(msg);
          }
          return;
        }

if (isRematch) {
  const offerId = msg.payload?.rematch_offer_id ?? msg.payload?.rematchOfferId ?? msg.rematch_offer_id ?? null;
  if (!offerId) return Alert.alert("Error", "Missing rematch offer id.");

  // 1) respond to offer (creates the new challenge, etc.)
  const { acceptedChallengeId } = await respondToRematchOffer({
    offerId: String(offerId),
    responderId: myId,
    accept: true,
  });

  // 2) ✅ persist resolution so UI stops showing "open"
  await resolveThreadPrompt({
    messageId: msg.id,
    resolverUserId: myId,
    resolution: "yes",
    resolutionLabel: "Accepted.",
  });

  if (acceptedChallengeId) router.push(`/challenge/${acceptedChallengeId}`);
  await load();
  return;
}

        if (isTurn && msg.challenge_id) {
          await resolveThreadPrompt({
            messageId: msg.id,
            resolverUserId: myId,
            resolution: "yes",
            resolutionLabel: "Opening…",
          });
          openChallenge(msg.challenge_id);
          return;
        }
      } catch (e: any) {
        Alert.alert("Action failed", e?.message ?? "Could not complete action.");
      }
    },
    [meId, storeUser?.id, openChallenge, router, openSubmitModalForPrompt, load, patchMessagePayloadLocal, challengesById]
  );

  const handlePromptNo = useCallback(
    async (msg: ThreadMessageRow) => {
      const myId = meId ?? storeUser?.id ?? (await supabase.auth.getUser()).data?.user?.id ?? null;
      if (!myId) return;

const t = String(msg.type ?? "").toLowerCase();
const payload = msg.payload ?? {};
const inferred = t === "prompt" ? String(payload?.prompt_id ?? "").split(":")[0] : "";

const isCheckIn = t === "checkin_prompt" || t === "prompt_check_in" || inferred === "prompt_check_in";
const isSubmit  = t === "submit_result_prompt" || t === "prompt_submit_result" || inferred === "prompt_submit_result";
const isRematch = t === "rematch_offer" || t === "prompt_accept_rematch" || inferred === "prompt_accept_rematch";
const isTurn    = t === "turn_prompt" || t === "prompt_play_turn" || inferred === "prompt_play_turn";
const isConfirm = t === "prompt_confirm_result" || inferred === "prompt_confirm_result";

      try {
        if (isConfirm && msg.challenge_id) {
          await disputeEgameResult({
            challengeId: String(msg.challenge_id),
            userId: String(myId),
            promptMessageId: msg.id,
          });
          await load();
          return;
        }

if (isRematch) {
  const offerId = msg.payload?.rematch_offer_id ?? msg.payload?.rematchOfferId ?? msg.rematch_offer_id ?? null;

  if (offerId) {
    await respondToRematchOffer({
      offerId: String(offerId),
      responderId: myId,
      accept: false,
    });
  }

  // ✅ persist resolution
  await resolveThreadPrompt({
    messageId: msg.id,
    resolverUserId: myId,
    resolution: "no",
    resolutionLabel: "Declined.",
  });

  await load();
  return;
}

        const reply = isCheckIn ? "Not checking in yet." : isSubmit ? "Submitting later." : isTurn ? "Later." : "Later.";

        await resolveThreadPrompt({ messageId: msg.id, resolverUserId: myId, resolution: "no", resolutionLabel: reply });

        await supabase.from("thread_messages").insert({
          thread_id: threadId,
          sender_id: myId,
          type: "text",
          payload: { text: reply },
        });

        await load();
      } catch {
        await load();
      }
    },
    [meId, storeUser?.id, threadId, load, patchMessagePayloadLocal]
  );

  // anchor logic: only ONE card per challenge shows buttons
  const myIdForUi = meId ?? storeUser?.id ?? null;

  const latestMsgIdByChallenge = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of messages) {
      if (!m.challenge_id) continue;
      map[String(m.challenge_id)] = String(m.id);
    }
    return map;
  }, [messages]);

  const openPromptMsgByChallenge = useMemo(() => {
    const map: Record<string, ThreadMessageRow> = {};
    for (const m of messages) {
      const cid = m.challenge_id ? String(m.challenge_id) : null;
      if (!cid) continue;
      if (!isActionPromptType(m.type, m.payload)) continue;

      const payload = m.payload ?? {};
      const status = String(payload?.status ?? "open").toLowerCase();
      if (status === "resolved") continue;

      const target = payload?.target_user_id ? String(payload.target_user_id) : null;
      const isForMe = !target || (myIdForUi && target === String(myIdForUi));
      if (!isForMe) continue;

      map[cid] = m;
    }
    return map;
  }, [messages, myIdForUi]);

  const openPromptByChallenge = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const cid of Object.keys(openPromptMsgByChallenge)) {
      map[cid] = true;
    }
    return map;
  }, [openPromptMsgByChallenge]);

  type PinnedChallenge = {
    challengeId: string;
    gameTitle: string;
    action: ChallengeActionState;
    challenge: ChallengeRow;
  };

  const { pinnedActive, pinnedCompleted } = useMemo(() => {
    const active: PinnedChallenge[] = [];
    const completed: PinnedChallenge[] = [];

    for (const [cid, ch] of Object.entries(challengesById)) {
      const action = deriveChallengeActionState({
        challenge: ch,
        meId: myIdForUi,
        playerState: playerStateByChallengeId[cid],
        currentTurnUserId: currentTurnByChallengeId[cid]?.current_turn_user_id ?? null,
        hasOpenPromptForMe: openPromptByChallenge[cid] ?? false,
      });

      const entry: PinnedChallenge = {
        challengeId: cid,
        gameTitle: gameTitleForThread(ch.game_type ?? ch.game_key),
        action,
        challenge: ch,
      };

      if (action.bucket === "completed" || isTerminalChallenge(ch)) {
        completed.push(entry);
      } else if (action.isActive || action.bucket === "needs_action" || action.bucket === "waiting") {
        active.push(entry);
      }
    }

    active.sort((a, b) => {
      if (a.action.bucket === "needs_action" && b.action.bucket !== "needs_action") return -1;
      if (b.action.bucket === "needs_action" && a.action.bucket !== "needs_action") return 1;
      return 0;
    });

    return { pinnedActive: active, pinnedCompleted: completed };
  }, [challengesById, playerStateByChallengeId, currentTurnByChallengeId, openPromptByChallenge, myIdForUi]);

  const activeChallengeIds = useMemo(() => new Set(pinnedActive.map((p) => p.challengeId)), [pinnedActive]);

  const historyMessages = useMemo(() => {
    return messages.filter((m) => {
      const t = String(m.type ?? "").toLowerCase();
      if (t === "text") return true;
      // Challenge events live in pinned sections — thread is for chat only
      if (m.challenge_id) return false;
      return false;
    });
  }, [messages]);

  const handlePinnedChallengeAction = useCallback(
    (entry: PinnedChallenge) => {
      const { challengeId, action } = entry;
      const promptMsg = openPromptMsgByChallenge[challengeId];

      if (promptMsg) {
        handlePromptYes(promptMsg);
        return;
      }

      if (action.ctaLabel === "Check In") {
        quickCheckIn(challengeId);
        return;
      }
      if (action.ctaLabel === "Submit Score" || action.ctaLabel === "Report Winner") {
        openSubmitModalForChallenge(challengeId);
        return;
      }
      if (action.ctaLabel === "Confirm / Dispute") {
        const promptMsg = openPromptMsgByChallenge[challengeId];
        if (promptMsg) handlePromptYes(promptMsg);
        else openChallenge(challengeId);
        return;
      }
      if (action.ctaLabel === "Join") {
        handleJoin(challengeId, entry.challenge.created_by);
        return;
      }
      openChallenge(challengeId);
    },
    [openPromptMsgByChallenge, handlePromptYes, quickCheckIn, openSubmitModalForChallenge, handleJoin, openChallenge]
  );

  const shouldShowActionsOnEventCard = useCallback(
    (cid: string, messageId: string) => {
      if (openPromptByChallenge[cid]) return false;
      if (activeChallengeIds.has(cid)) return false;
      return latestMsgIdByChallenge[cid] === messageId;
    },
    [latestMsgIdByChallenge, openPromptByChallenge, activeChallengeIds]
  );

  // Same primary CTA as challenge screen bottom bar: Join Challenge, Check In, Submit Result, Your turn — Play, etc.
  const buildEventActions = useCallback(
    (cid: string, msg: ThreadMessageRow, challenge?: ChallengeRow): ThreadCardAction[] | undefined => {
      if (!cid) return undefined;

      const status = String(challenge?.status ?? "").toLowerCase();
      const isOpen = status === "open";
      const isCompleted = status === "completed";
      const terminal = isTerminalChallenge(challenge);
      const completed = isCompletedLike(String(msg.type ?? ""), challenge);
      const kind = normalizeKind(challenge?.kind);
      const st = playerStateByChallengeId[cid];

      // Completed: View Results (primary)
      if (completed) {
        return [{ label: "View Results", kind: "primary", onPress: () => openResults(cid) }];
      }

      if (terminal) return undefined;

      // Open challenge: Join or Waiting
      if (isOpen) {
        const isPlayer = !!st; // has player state = already joined
        const isLocked = Boolean(
          challenge?.invite_only && (challenge as any).invited_user_id ||
          (challenge as any).opponent_user_id
        );
        if (!myIdForUi) return [{ label: "Log in", kind: "primary", onPress: () => router.push("/auth/login") }];
        if (!isPlayer) return [{ label: "Join Challenge", kind: "primary", onPress: () => handleJoin(cid, (challenge as any)?.created_by) }];
        if (isLocked) return [{ label: "Locked", kind: "secondary", onPress: onResync }];
        return [{ label: "Waiting…", kind: "secondary", onPress: onResync }];
      }

      // E-game: report winner, confirm/dispute
      if (kind === "egame") {
        if (!st) return [{ label: "Loading…", kind: "secondary", onPress: onResync }];
        if (status === "cancelled") return [{ label: "Cancelled", kind: "secondary", onPress: onResync }];
        if (status === "disputed") return [{ label: "Disputed — Refresh", kind: "secondary", onPress: onResync }];
        if (status === "awaiting_confirmation") {
          const reportedBy = (challenge as any)?.result_reported_by ?? null;
          const iReported = Boolean(myIdForUi && reportedBy && String(reportedBy) === String(myIdForUi));
          if (iReported) return [{ label: "Awaiting confirm…", kind: "secondary", onPress: onResync }];
          return [{ label: "Confirm / Dispute", kind: "primary", onPress: () => openChallenge(cid) }];
        }
        if (!st.meSubmitted) return [{ label: "Report Winner", kind: "primary", onPress: () => openSubmitModalForChallenge(cid) }];
        return [{ label: "Waiting…", kind: "secondary", onPress: onResync }];
      }

      // In-person: check-in → AI proof report → opponent confirm
      if (kind === "in_person") {
        if (!st) return [{ label: "Loading…", kind: "secondary", onPress: onResync }];
        if (status === "cancelled") return [{ label: "Cancelled", kind: "secondary", onPress: onResync }];
        if (status === "disputed") return [{ label: "Disputed — Refresh", kind: "secondary", onPress: onResync }];
        if (status === "awaiting_confirmation") {
          const reportedBy = (challenge as any)?.result_reported_by ?? null;
          const iReported = Boolean(myIdForUi && reportedBy && String(reportedBy) === String(myIdForUi));
          if (iReported) return [{ label: "Awaiting confirm…", kind: "secondary", onPress: onResync }];
          return [{ label: "Confirm / Dispute", kind: "primary", onPress: () => openChallenge(cid) }];
        }
        if (!st.meCheckedIn)
          return [{ label: "Check In", kind: "primary", onPress: () => quickCheckIn(cid) }];
        if (st.bothCheckedIn && !st.meSubmitted)
          return [{ label: "Report + AI Proof", kind: "primary", onPress: () => openSubmitModalForChallenge(cid) }];
        if (st.meSubmitted) return [{ label: "Waiting on opponent…", kind: "secondary", onPress: onResync }];
        return [{ label: "Refresh", kind: "secondary", onPress: onResync }];
      }

      // Phone: Your turn — Play, Play Game, Opponent's turn, etc.
      const gameKey = String(challenge?.game_type ?? "").toLowerCase();
      const turnBased = isTurnBasedGameType(gameKey);
      const oneAttempt = isOneAttemptGameType(gameKey);

      // For turn-based: use challenge_turns.current_turn_user_id (loaded in currentTurnByChallengeId)
      const turnUserId =
        turnBased && currentTurnByChallengeId[cid]
          ? currentTurnByChallengeId[cid].current_turn_user_id
          : pickTurnUserId(msg, challenge);
      const isMyTurn = Boolean(turnUserId && myIdForUi && String(turnUserId) === String(myIdForUi));

      if (turnBased) {
        if (!turnUserId) return [{ label: "Match starting…", kind: "secondary", onPress: onResync }];
        if (!isMyTurn) return [{ label: "Opponent's turn", kind: "secondary", onPress: onResync }];
        return [{ label: "Your turn — Play", kind: "primary", onPress: () => openChallenge(cid) }];
      }

      if (oneAttempt && st?.meSubmitted && !isCompleted) {
        return [{ label: "Waiting…", kind: "secondary", onPress: onResync }];
      }

      return [{ label: "Play Game", kind: "primary", onPress: () => openChallenge(cid) }];
    },
    [
      myIdForUi,
      router,
      openChallenge,
      openResults,
      handleJoin,
      openSubmitModalForChallenge,
      quickCheckIn,
      onResync,
      playerStateByChallengeId,
      currentTurnByChallengeId,
    ]
  );

  const headerTitle = useMemo(() => displayNameFor(opponentProfile, opponentId ?? undefined), [opponentProfile, opponentId]);
  const recordLabel = useMemo(() => `Record: ${record.w}-${record.l}${record.t ? `-${record.t}` : ""}`, [record]);

  const renderItem = useCallback(
    ({ item }: { item: ThreadMessageRow }) => {
      const mine = isMine(meId ?? storeUser?.id ?? null, item);
      const when = formatTime(item.created_at);

      const cid = item.challenge_id ? String(item.challenge_id) : null;
      const challenge = cid ? challengesById[cid] : undefined;

      // PROMPT CARD
      if (isActionPromptType(item.type, item.payload)) {
        const payload = item.payload ?? {};
        const status = String(payload?.status ?? "open").toLowerCase();
        const target = payload?.target_user_id ? String(payload.target_user_id) : null;

        const myId2 = meId ?? storeUser?.id ?? null;
        const isForMe = !target || (myId2 && target === String(myId2));

        const cfg = promptConfigFor(item);
        const gameTitle = gameTitleForThread(challenge?.game_type ?? challenge?.game_key, item.payload);
        const promptSubtitle = cfg?.subtitle ? mergeGameIntoTitle(gameTitle, cfg.subtitle) : gameTitle !== "Game" ? gameTitle : undefined;

        if (status === "resolved" || !isForMe) {
          const resolvedLabel = String(payload?.resolution_label ?? "").trim();
          return (
            <ThreadActionCard
              title={enrichThreadEventTitle(resolvedLabel || msgText(item), gameTitle)}
              subtitle={promptSubtitle}
              meta={challenge ? formatChallengeFeePrizeMeta(challenge) : undefined}
              timeLabel={when || undefined}
            />
          );
        }

        return (
          <ThreadActionCard
            title={cfg?.title ? mergeGameIntoTitle(gameTitle, cfg.title) : enrichThreadEventTitle(msgText(item), gameTitle)}
            subtitle={promptSubtitle}
            meta={challenge ? formatChallengeFeePrizeMeta(challenge) : undefined}
            timeLabel={when || undefined}
            primaryLabel={cfg?.yesText ?? "Yes"}
            secondaryLabel={cfg?.noText ?? "No"}
            onPrimary={() => handlePromptYes(item)}
            onSecondary={() => handlePromptNo(item)}
          />
        );
      }

      // MATCH RESULT CARD
      if (isMatchCompleteMessage(item.type) && challenge) {
        const gameTitle = gameTitleForThread(challenge.game_type ?? challenge.game_key, item.payload);
        const winnerUserId =
          challenge.winner_user_id ?? item.payload?.winner_user_id ?? null;
        const myId2 = meId ?? storeUser?.id ?? null;

        let actions: ThreadCardAction[] | undefined;
        const showActionsHere = cid ? shouldShowActionsOnEventCard(cid, String(item.id)) : false;
        if (cid && showActionsHere) {
          actions = buildEventActions(cid, item, challenge);
        }

        return (
          <ThreadMatchResultCard
            gameTitle={gameTitle}
            winnerUserId={winnerUserId ? String(winnerUserId) : null}
            myId={myId2 ? String(myId2) : null}
            mySide={{
              userId: String(myId2 ?? ""),
              name: profileDisplayName(myProfile, myId2 ?? undefined),
              avatarUrl: myProfile?.avatar_url ?? null,
            }}
            opponentSide={{
              userId: String(opponentId ?? ""),
              name: displayNameFor(opponentProfile, opponentId ?? undefined),
              avatarUrl: (opponentProfile as any)?.avatar_url ?? null,
            }}
            prizeCents={Number(challenge.win_reward_cents ?? 0)}
            timeLabel={when || undefined}
            actions={actions}
          />
        );
      }

      // EVENT CARD
      if (isEventLike(item)) {
        let actions: ThreadCardAction[] | undefined;

        const showActionsHere = cid ? shouldShowActionsOnEventCard(cid, String(item.id)) : false;
        if (cid && showActionsHere) {
          actions = buildEventActions(cid, item, challenge);
        }

        const gameTitle = gameTitleForThread(
          challenge?.game_type ?? challenge?.game_key,
          item.payload
        );
        const eventTitle = enrichThreadEventTitle(msgText(item), gameTitle);

        return (
          <ThreadActionCard
            title={eventTitle}
            meta={challenge ? formatChallengeFeePrizeMeta(challenge) : gameTitle !== "Game" ? gameTitle : undefined}
            timeLabel={when || undefined}
            iconName={threadEventIconName(item.type) as any}
            actions={actions}
          />
        );
      }

      // TEXT bubble
      return <ThreadMessageItem mine={mine} text={msgText(item)} timeLabel={when || undefined} />;
    },
    [
      meId,
      storeUser?.id,
      myProfile,
      opponentId,
      opponentProfile,
      challengesById,
      shouldShowActionsOnEventCard,
      buildEventActions,
      handlePromptYes,
      handlePromptNo,
    ]
  );

  if (!threadId) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.error}>Missing thread id.</Text>
      </View>
    );
  }

  const keyboardOffset = Platform.OS === "ios" ? 12 : 0;
  const composerBottomPad = 12 + insets.bottom;
  const listBottomPad = 16 + 70 + composerBottomPad;

  const submitChallenge = submitChallengeId ? challengesById[submitChallengeId] : undefined;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={keyboardOffset}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>

        <View style={styles.headerCenter}>
          <Avatar
            imageUrl={(opponentProfile as any)?.avatar_url}
            name={headerTitle}
            size={40}
          />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {recordLabel}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable onPress={() => setChallengeSheetOpen(true)} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="list" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={onResync} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="sync" size={20} color="#fff" />
          </Pressable>
          <Pressable onPress={onHelp} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="help-circle-outline" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ChallengeCenterSheet
        visible={challengeSheetOpen}
        onClose={() => setChallengeSheetOpen(false)}
        threadId={threadId}
        meId={meId}
        opponentId={opponentId}
        onOpenChallenge={(id: string) => {
          setChallengeSheetOpen(false);
          openChallenge(id);
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.sub}>Loading…</Text>
        </View>
      ) : (
        <FlatList
          ref={(r) => {
            listRef.current = r;
          }}
          style={{ flex: 1 }}
          data={historyMessages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 14, paddingBottom: listBottomPad }}
          ListHeaderComponent={
            <>
              {pinnedActive.length > 0 ? (
                <View style={styles.pinnedSection}>
                  <Text style={styles.sectionTitle}>Active challenges</Text>
                  {pinnedActive.map((entry) => (
                    <ActiveChallengePin
                      key={entry.challengeId}
                      gameTitle={entry.gameTitle}
                      action={entry.action}
                      onPress={() => handlePinnedChallengeAction(entry)}
                    />
                  ))}
                </View>
              ) : null}

              {pinnedCompleted.length > 0 ? (
                <View style={styles.pinnedSection}>
                  <Pressable
                    onPress={() => setShowCompleted((v) => !v)}
                    style={({ pressed }) => [styles.completedToggle, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.sectionTitle}>
                      Completed ({pinnedCompleted.length})
                    </Text>
                    <Ionicons
                      name={showCompleted ? "chevron-up" : "chevron-down"}
                      size={18}
                      color="rgba(255,255,255,0.5)"
                    />
                  </Pressable>
                  {showCompleted
                    ? pinnedCompleted.map((entry) => (
                        <ActiveChallengePin
                          key={entry.challengeId}
                          gameTitle={entry.gameTitle}
                          action={entry.action}
                          onPress={() => openChallenge(entry.challengeId)}
                          compact
                        />
                      ))
                    : null}
                </View>
              ) : null}

              {(pinnedActive.length > 0 || (showCompleted && pinnedCompleted.length > 0)) ? (
                <View style={styles.threadDivider}>
                  <View style={styles.threadDividerLine} />
                  <Text style={styles.threadDividerText}>Message thread</Text>
                  <View style={styles.threadDividerLine} />
                </View>
              ) : null}
            </>
          }
        />
      )}

      <View style={[styles.composerWrap, { paddingBottom: composerBottomPad }]}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={sendText}
            disabled={sending || text.trim().length === 0}
            style={({ pressed }) => [
              styles.sendBtn,
              (sending || text.trim().length === 0) && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {sending ? <ActivityIndicator /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>

        <Text style={styles.composerHint}>Private thread • Chat lives below active games</Text>
      </View>

      {/* Submit Result Modal */}
      <Modal visible={submitOpen} transparent animationType="fade" onRequestClose={closeSubmitModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Submit Result</Text>

            <Text style={styles.modalSub}>
              {submitChallenge?.game_type ? `${submitChallenge.game_type} • ` : ""}
              {submitChallengeId ? `Challenge ${String(submitChallengeId).slice(0, 8)}…` : ""}
            </Text>

            <View style={{ height: 10 }} />

            <Pressable
              onPress={() => submitWinner("me")}
              disabled={submitLoading}
              style={({ pressed }) => [styles.modalBtnPrimary, pressed && { opacity: 0.9 }, submitLoading && { opacity: 0.6 }]}
            >
              <Text style={styles.modalBtnText}>I Won</Text>
            </Pressable>

            <Pressable
              onPress={() => submitWinner("opponent")}
              disabled={submitLoading}
              style={({ pressed }) => [styles.modalBtnSecondary, pressed && { opacity: 0.9 }, submitLoading && { opacity: 0.6 }]}
            >
              <Text style={styles.modalBtnText}>Opponent Won</Text>
            </Pressable>

            <Pressable
              onPress={() => submitWinner("tie")}
              disabled={submitLoading}
              style={({ pressed }) => [styles.modalBtnSecondary, pressed && { opacity: 0.9 }, submitLoading && { opacity: 0.6 }]}
            >
              <Text style={styles.modalBtnText}>Tie</Text>
            </Pressable>

            <Pressable onPress={closeSubmitModal} disabled={submitLoading} style={({ pressed }) => [styles.modalBtnGhost, pressed && { opacity: 0.9 }]}>
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>

            {submitLoading ? (
              <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator />
                <Text style={{ color: "rgba(255,255,255,0.7)", fontWeight: "800" }}>Submitting…</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <MatchProofBundleModal
        visible={egameReportOpen}
        challengeId={submitChallengeId}
        challengeKind={submitChallenge?.kind ?? null}
        gameType={submitChallenge?.game_type ?? null}
        entryFeeCents={submitChallenge?.entry_fee_cents}
        winRewardCents={submitChallenge?.win_reward_cents}
        leagueId={(submitChallenge as any)?.league_id ?? null}
        reporterUserId={String(meId ?? storeUser?.id ?? "")}
        opponentUserId={String(opponentId ?? "")}
        loading={submitLoading}
        onClose={closeSubmitModal}
        onSubmit={submitEgameWinnerFromModal}
      />

      <MatchResultModal
        visible={!!matchResult}
        gameTitle={matchResult?.gameTitle ?? "Match"}
        gameKey={matchResult?.outcome.gameType}
        outcome={matchResult?.outcome ?? null}
        challengeId={matchResult?.challengeId ?? null}
        opponentUserId={matchResult?.opponentUserId ?? null}
        onClose={() => setMatchResult(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819" },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#060a14",
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#fff", fontWeight: "800", fontSize: 17 },
  headerSub: { color: "rgba(255,255,255,0.5)", fontWeight: "700", marginTop: 2, fontSize: 12 },
  headerActions: { flexDirection: "row", gap: 8 },

  sub: { color: "rgba(255,255,255,0.6)", marginTop: 8, fontWeight: "700" },
  error: { color: "#f87171", marginTop: 8, paddingHorizontal: 14, fontWeight: "800" },

  pinnedSection: { marginBottom: 8 },
  sectionTitle: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "900",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  completedToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  threadDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  threadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  threadDividerText: {
    color: "rgba(255,255,255,0.4)",
    fontWeight: "800",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#060a14",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    padding: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  input: {
    flex: 1,
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    minHeight: 40,
    maxHeight: 110,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.35)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.55)",
  },
  composerHint: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "800",
    marginTop: 8,
    paddingHorizontal: 6,
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#070b1f",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalSub: { color: "rgba(255,255,255,0.65)", fontWeight: "800", marginTop: 6 },

  modalBtnPrimary: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "rgba(99,102,241,0.30)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.55)",
  },
  modalBtnSecondary: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalBtnGhost: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalBtnText: { color: "#fff", fontWeight: "900" },
  modalBtnGhostText: { color: "rgba(255,255,255,0.75)", fontWeight: "900" },
});