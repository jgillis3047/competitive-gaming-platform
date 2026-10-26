// lib/backend/challengeActions.ts
import { supabase } from "./supabaseClient";
import {
  chargeEntryFeeCreator,
  chargeEntryFeeOpponent,
  ensureWalletAccountForUser,
} from "./walletService";

import {
  appendThreadEvent,
  appendThreadPrompt,
  buildPromptId,
  resolveThreadPrompt,
} from "./threadActions";

import type {
  ChallengeRow,
  InPersonRules,
  PhoneRules,
} from "../models/challengeTypes";
import { getGameConfig, isTurnBasedGameType } from "../data/gameConfig";
import { notifyWinnerIfLeaderboardQualifies } from "./leaderboardQualification";

export type ScoreSort = "asc" | "desc"; // asc = lower wins (time), desc = higher wins (points)

function threadGameTitle(gameType: string | null | undefined): string {
  const cfg = getGameConfig(gameType);
  const fallback = String(gameType ?? "").trim();
  return cfg?.title ?? (fallback || "Game");
}

function threadGameLabel(gameType: string | null | undefined, message: string): string {
  return `${threadGameTitle(gameType)} — ${message}`;
}



type ChallengePlayerRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  role: "creator" | "opponent";
  score: number | null;
  submitted?: boolean | null;
  checked_in_at?: string | null;

  // in-person only
  reported_winner_user_id?: string | null;
};

/**
 * ---------------------------
 * EXPIRATION CONFIG
 * ---------------------------
 */
const OPEN_EXPIRE_MINUTES = 60; // open challenge expires if nobody joins
const ACTIVE_EXPIRE_MINUTES = 30; // accepted/in-progress expires if not completed

function minutesFromNowIso(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function pairUsers(a: string, b: string) {
  const A = String(a);
  const B = String(b);
  return A < B ? { user_low: A, user_high: B } : { user_low: B, user_high: A };
}

/**
 * ✅ Ensure a single thread exists for this pair (returns threadId)
 * Uses threads columns: id, user_low, user_high, pair_key, created_at...
 */
async function ensureThreadForUsers(userAId: string, userBId: string): Promise<string> {
  const { user_low, user_high } = pairUsers(userAId, userBId);
  const pair_key = `${user_low}:${user_high}`;

  const { data: existing, error: readErr } = await supabase
    .from("threads")
    .select("id")
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .maybeSingle();

  if (!readErr && existing?.id) return String(existing.id);

  // Create if missing
  const { data: created, error: insErr } = await supabase
    .from("threads")
    .insert({
      user_low,
      user_high,
      pair_key,
      last_message_at: nowIso(),
      last_preview: "",
    })
    .select("id")
    .maybeSingle();

  if (insErr) throw new Error(insErr.message);
  if (!created?.id) throw new Error("Failed to create thread.");
  return String(created.id);
}

async function getOpponentIdFromPlayers(challengeId: string, meId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("challenge_players")
    .select("user_id")
    .eq("challenge_id", challengeId);

  if (error) return null;

  const other = (data ?? [])
    .map((r: any) => String(r.user_id))
    .find((uid) => uid !== String(meId));

  return other ?? null;
}

/**
 * Challenge timeline events (per-challenge, legacy)
 */
async function insertEvent(params: {
  challengeId: string;
  type: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  body: string;
  payload?: any;
}) {
  const { challengeId, type, actorUserId, targetUserId, body, payload } = params;

  const { error } = await supabase.from("challenge_events").insert({
    challenge_id: challengeId,
    type,
    actor_user_id: actorUserId ?? null,
    target_user_id: targetUserId ?? null,
    body,
    payload: payload ?? {},
  });

  if (error) {
    console.warn("[challengeActions] insertEvent failed:", error.message);
  }
}

async function ensureEventOnce(params: {
  challengeId: string;
  type: string;
  actorUserId?: string | null;
  body: string;
  payload?: any;
}) {
  const { challengeId, type, actorUserId, body, payload } = params;

  try {
    const { data, error } = await supabase
      .from("challenge_events")
      .select("id")
      .eq("challenge_id", challengeId)
      .eq("type", type)
      .limit(1);

    if (error) throw error;
    if (data?.length) return;

    await insertEvent({ challengeId, type, actorUserId, body, payload });
  } catch (e: any) {
    console.warn("[challengeActions] ensureEventOnce failed:", e?.message ?? e);
  }
}

function inferScoreSortFromGameType(gameType?: string | null): ScoreSort {
  const gt = (gameType ?? "").toLowerCase();
  if (gt.includes("sudoku")) return "asc";
  if (gt.includes("math24") || gt.includes("math-24") || gt.includes("math 24")) return "asc";
  if (gt.includes("number pattern")) return "asc";
  if (gt.includes("match card")) return "asc";
  return "desc";
}

function pickWinner(
  creator: ChallengePlayerRow,
  opponent: ChallengePlayerRow,
  sort: ScoreSort
): { winnerUserId: string | null; isTie: boolean } {
  const creatorScore = Number(creator.score);
  const opponentScore = Number(opponent.score);

  if (!Number.isFinite(creatorScore) || !Number.isFinite(opponentScore)) {
    return { winnerUserId: null, isTie: false };
  }

  const isTie = creatorScore === opponentScore;
  if (isTie) return { winnerUserId: null, isTie: true };

  if (sort === "asc") {
    return {
      winnerUserId: creatorScore < opponentScore ? creator.user_id : opponent.user_id,
      isTie: false,
    };
  }

  return {
    winnerUserId: creatorScore > opponentScore ? creator.user_id : opponent.user_id,
    isTie: false,
  };
}

async function loadChallenge(challengeId: string): Promise<ChallengeRow> {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id,
      title,
      message,
      game_type,
      status,
      entry_fee_cents,
      win_reward_cents,
      entry_fee_cents,
      win_reward_cents,
      created_by,
      created_at,
      updated_at,
      kind,
      in_person_rules,
      checkin_deadline,
      expires_at,
      completed_at,
      winner_user_id,
      winner_team_id,
      creator_team_id,
      opponent_team_id,
      settlement_status,
      opponent_user_id,
      settled_at,
      invite_only,
      invited_user_id,
      show_competitor_names_public,
      winner_rating_delta,
      loser_rating_delta
    `
    )
    .eq("id", challengeId)
    .maybeSingle();

  if (error) {
    console.error("[challengeActions] loadChallenge error:", error);
    throw new Error(error.message);
  }
  if (!data) throw new Error("Challenge not found.");
  return data as unknown as ChallengeRow;
}

async function loadPlayers(challengeId: string): Promise<ChallengePlayerRow[]> {
  const { data, error } = await supabase
    .from("challenge_players")
    .select("id, challenge_id, user_id, role, score, submitted, checked_in_at, reported_winner_user_id")
    .eq("challenge_id", challengeId);

  if (error) {
    console.error("[challengeActions] loadPlayers error:", error);
    throw new Error(error.message);
  }

  return (data ?? []) as ChallengePlayerRow[];
}

/**
 * ---------------------------
 * THREAD PROMPT HELPERS (NEW: threadId-based)
 * ---------------------------
 */

async function findPromptMessageId(params: {
  threadId: string;
  promptType: string;
  promptId: string;
}): Promise<string | null> {
  const { threadId, promptType, promptId } = params;

  // We search by type + payload.prompt_id (stored by appendThreadPrompt)
  const { data, error } = await supabase
    .from("thread_messages")
    .select("id,payload")
    .eq("thread_id", threadId)
    .eq("type", promptType)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return null;

  const rows = (data ?? []) as any[];
  const hit = rows.find((r) => String(r?.payload?.prompt_id ?? "") === String(promptId));
  return hit?.id ? String(hit.id) : null;
}

async function ensureCheckInPrompts(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
}) {
  const { challengeId, creatorId, opponentId } = params;
  const threadId = await ensureThreadForUsers(creatorId, opponentId);

  let gameType: string | null = null;
  try {
    const ch = await loadChallenge(challengeId);
    gameType = ch.game_type ?? null;
  } catch {
    // ignore
  }
  const game = threadGameTitle(gameType);

  const p1 = buildPromptId({ promptType: "prompt_check_in", challengeId, turnKey: creatorId });
  const p2 = buildPromptId({ promptType: "prompt_check_in", challengeId, turnKey: opponentId });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_check_in",
    promptId: p1,
    label: threadGameLabel(gameType, "Check in when you arrive."),
    challengeId,
    targetUserId: creatorId,
    yesText: "Check in",
    noText: "Not yet",
    payload: {
      title: `${game} — Check in?`,
      subtitle: "Both players must check in before submitting results.",
      game_type: gameType,
    },
  });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_check_in",
    promptId: p2,
    label: threadGameLabel(gameType, "Check in when you arrive."),
    challengeId,
    targetUserId: opponentId,
    yesText: "Check in",
    noText: "Not yet",
    payload: {
      title: `${game} — Check in?`,
      subtitle: "Both players must check in before submitting results.",
      game_type: gameType,
    },
  });
}

async function resolveCheckInPrompt(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
  resolverUserId: string;
  resolution: "yes" | "no" | "dismiss";
  label?: string;
}) {
  const { challengeId, creatorId, opponentId, resolverUserId, resolution, label } = params;

  const threadId = await ensureThreadForUsers(creatorId, opponentId);

  const pid = buildPromptId({
    promptType: "prompt_check_in",
    challengeId,
    turnKey: resolverUserId,
  });

  const messageId = await findPromptMessageId({
    threadId,
    promptType: "prompt_check_in",
    promptId: pid,
  });

  if (!messageId) return;

  await resolveThreadPrompt({
    messageId,
    resolverUserId,
    resolution,
    resolutionLabel: label ?? undefined,
  });
}

async function ensureSubmitResultPrompts(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
}) {
  const { challengeId, creatorId, opponentId } = params;
  const threadId = await ensureThreadForUsers(creatorId, opponentId);

  let gameType: string | null = null;
  try {
    const ch = await loadChallenge(challengeId);
    gameType = ch.game_type ?? null;
  } catch {
    // ignore
  }
  const game = threadGameTitle(gameType);

  const p1 = buildPromptId({ promptType: "prompt_submit_result", challengeId, turnKey: creatorId });
  const p2 = buildPromptId({ promptType: "prompt_submit_result", challengeId, turnKey: opponentId });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_submit_result",
    promptId: p1,
    label: threadGameLabel(gameType, "Submit the result when finished."),
    challengeId,
    targetUserId: creatorId,
    yesText: "Submit",
    noText: "Later",
    payload: {
      title: `${game} — Submit result?`,
      subtitle: "Submit who won when finished.",
      game_type: gameType,
    },
  });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_submit_result",
    promptId: p2,
    label: threadGameLabel(gameType, "Submit the result when finished."),
    challengeId,
    targetUserId: opponentId,
    yesText: "Submit",
    noText: "Later",
    payload: {
      title: `${game} — Submit result?`,
      subtitle: "Submit who won when finished.",
      game_type: gameType,
    },
  });
}

async function resolveSubmitPrompt(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
  resolverUserId: string;
  resolution: "yes" | "no" | "dismiss";
  label?: string;
}) {
  const { challengeId, creatorId, opponentId, resolverUserId, resolution, label } = params;
  const threadId = await ensureThreadForUsers(creatorId, opponentId);

  const pid = buildPromptId({
    promptType: "prompt_submit_result",
    challengeId,
    turnKey: resolverUserId,
  });

  const messageId = await findPromptMessageId({
    threadId,
    promptType: "prompt_submit_result",
    promptId: pid,
  });

  if (!messageId) return;

  await resolveThreadPrompt({
    messageId,
    resolverUserId,
    resolution,
    resolutionLabel: label ?? undefined,
  });
}

async function dismissAllInPersonPrompts(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
  resolverUserId: string;
  label?: string;
}) {
  const { challengeId, creatorId, opponentId, label } = params;
  const l = label ?? "Closed.";

  await resolveCheckInPrompt({
    challengeId,
    creatorId,
    opponentId,
    resolverUserId: creatorId,
    resolution: "dismiss",
    label: l,
  });
  await resolveCheckInPrompt({
    challengeId,
    creatorId,
    opponentId,
    resolverUserId: opponentId,
    resolution: "dismiss",
    label: l,
  });

  await resolveSubmitPrompt({
    challengeId,
    creatorId,
    opponentId,
    resolverUserId: creatorId,
    resolution: "dismiss",
    label: l,
  });
  await resolveSubmitPrompt({
    challengeId,
    creatorId,
    opponentId,
    resolverUserId: opponentId,
    resolution: "dismiss",
    label: l,
  });
}

/**
 * Mark a turn-based online match complete (checkers, chess, etc.)
 */
export async function completeTurnBasedChallenge(params: {
  challengeId: string;
  winnerUserId: string;
  actorUserId: string;
  creatorUserId: string;
  opponentUserId: string;
  summaryLabel?: string;
}): Promise<void> {
  const {
    challengeId,
    winnerUserId,
    actorUserId,
    creatorUserId,
    opponentUserId,
    summaryLabel,
  } = params;

  let challenge: ChallengeRow;
  try {
    challenge = await loadChallenge(challengeId);
  } catch (e: any) {
    throw new Error(e?.message ?? "Challenge not found.");
  }

  if (challenge.status === "completed") {
    await settleChallenge({ challengeId, actorUserId }).catch(() => {});
    return;
  }

  const doneISO = nowIso();
  const reward = Number(challenge.win_reward_cents ?? 0);
  const completedLabel =
    summaryLabel ??
    threadGameLabel(
      challenge.game_type,
      reward > 0
        ? `Match completed — winner confirmed (+$${(reward / 100).toFixed(2)}).`
        : "Match completed — winner confirmed."
    );

  const { data: updated, error: completeErr } = await supabase
    .from("challenges")
    .update({
      status: "completed",
      winner_user_id: winnerUserId,
      completed_at: doneISO,
      updated_at: doneISO,
      expires_at: null,
    })
    .eq("id", challengeId)
    .in("status", ["accepted", "in-progress", "checked-in"])
    .select("id")
    .maybeSingle();

  if (completeErr) throw new Error(completeErr.message);

  if (!updated?.id) {
    const latest = await loadChallenge(challengeId);
    if (latest.status !== "completed") {
      throw new Error("Could not mark challenge completed.");
    }
    await settleChallenge({ challengeId, actorUserId }).catch(() => {});
    return;
  }

  await ensureEventOnce({
    challengeId,
    type: "completed",
    actorUserId,
    body: completedLabel,
    payload: { winner_user_id: winnerUserId },
  });

  await appendThreadEvent({
    userAId: creatorUserId,
    userBId: opponentUserId,
    senderId: null,
    type: "challenge_completed",
    label: completedLabel,
    challengeId,
    payload: { winner_user_id: winnerUserId, game_type: challenge.game_type },
  });

  await settleChallenge({ challengeId, actorUserId });

  void notifyWinnerIfLeaderboardQualifies({
    winnerUserId,
    gameType: challenge.game_type,
    challengeId,
  });
}

/**
 * Move accepted → in-progress when a participant taps Play (idempotent if already started).
 */
export async function startChallengeMatch(challengeId: string): Promise<void> {
  if (!challengeId) throw new Error("Missing challengeId.");

  const { data, error } = await supabase.rpc("start_challenge_match", {
    p_challenge_id: challengeId,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.toLowerCase().includes("could not find the function")) {
      const ch = await loadChallenge(challengeId);
      if (ch.status === "in-progress") return;

      const { data: moved, error: upErr } = await supabase
        .from("challenges")
        .update({
          status: "in-progress",
          updated_at: nowIso(),
          expires_at: minutesFromNowIso(ACTIVE_EXPIRE_MINUTES),
        })
        .eq("id", challengeId)
        .eq("status", "accepted")
        .select("id")
        .maybeSingle();

      if (upErr) throw new Error(upErr.message);
      if (!moved?.id) {
        const latest = await loadChallenge(challengeId);
        if (latest.status !== "in-progress") {
          throw new Error(
            "Could not start match. Apply the latest Supabase migration (start_challenge_match) or ask the creator to tap Play first."
          );
        }
      }
      return;
    }
    throw new Error(error.message);
  }

  if (!data) {
    const latest = await loadChallenge(challengeId);
    if (latest.status !== "in-progress") {
      throw new Error("Could not start match.");
    }
  }
}

/**
 * ✅ settlement (idempotent + logs to thread ONLY if it actually settled)
 */
export async function settleChallenge(params: {
  challengeId: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { challengeId, actorUserId } = params;
  if (!challengeId) throw new Error("Missing challengeId.");

  // Read BEFORE (for idempotency + to detect change)
  let before: ChallengeRow | null = null;
  try {
    before = await loadChallenge(challengeId);
    if (before?.settled_at) return;
  } catch {
    // still try RPC
  }

  // Call RPC (it may "successfully" do nothing if not completed yet)
  const { error: settleErr } = await supabase.rpc("settle_challenge", {
    p_challenge_id: challengeId,
  });

  if (settleErr) {
    console.error("[settleChallenge] settle_challenge error:", settleErr);
    throw new Error(settleErr.message);
  }

  // Read AFTER (source of truth)
  let after: ChallengeRow | null = null;
  try {
    after = await loadChallenge(challengeId);
  } catch {
    return; // can't verify, so don't log anything
  }

  // ✅ Only continue if it actually settled during this call
  const didSettleNow = !!after?.settled_at && !before?.settled_at;
  const settlementStatus = String(after?.settlement_status ?? "").toLowerCase();
  const statusOk = settlementStatus === "paid" || settlementStatus === "refunded";

  if (!didSettleNow || !statusOk) {
    // Not settled yet (or errored) -> DO NOT post "payout processed"
    return;
  }

  const winnerId = after?.winner_user_id ?? null;
  const reward = Number(after?.win_reward_cents ?? 0);

  const payoutText = threadGameLabel(
    after?.game_type,
    !winnerId
      ? "Payout processed — tie (refunds issued if applicable)."
      : `Payout processed — +$${(reward / 100).toFixed(2)} to winner.`
  );

  await ensureEventOnce({
    challengeId,
    type: "payout",
    actorUserId: actorUserId ?? null,
    body: payoutText,
    payload: { winner_user_id: winnerId, amount_cents: reward },
  });

  if (actorUserId) {
    const otherUserId = await getOpponentIdFromPlayers(challengeId, actorUserId);
    if (otherUserId) {
      await appendThreadEvent({
        userAId: actorUserId,
        userBId: otherUserId,
        senderId: null,
        type: "payout_processed",
        label: payoutText,
        challengeId,
        payload: { winner_user_id: winnerId, amount_cents: reward, game_type: after?.game_type },
      });
    }
  }
}

/**
 * PHONE create
 */
export async function createChallengeAndChargeCreator(params: {
  title: string;
  gameType: string;
  entryFeeCents: number;
  winRewardCents?: number;
  creatorUserId: string;
  message?: string | null;

  inviteOnly?: boolean;
  invitedUserId?: string | null;
  opponentUserId?: string | null;

  creatorTeamId?: string | null;
  opponentTeamId?: string | null;
  leagueId?: string | null;
  sponsoredBySellerId?: string | null;
  showCompetitorNamesPublic?: boolean;
  phoneRules?: PhoneRules | null;
}): Promise<string> {
  const {
    title,
    gameType,
    entryFeeCents,
    winRewardCents,
    creatorUserId,
    message,
    inviteOnly,
    invitedUserId,
    opponentUserId,
    creatorTeamId,
    opponentTeamId,
    leagueId,
    sponsoredBySellerId,
    showCompetitorNamesPublic,
    phoneRules,
  } = params;

  const lockedOpponent = opponentUserId ? String(opponentUserId) : null;

  if (!creatorUserId) throw new Error("Missing creator user id.");
  if (!title?.trim()) throw new Error("Missing title.");
  if (!gameType?.trim()) throw new Error("Missing game type.");

  const cleanMsg = (message ?? "").trim();
  const finalMsg = cleanMsg.length ? cleanMsg.slice(0, 140) : null;

  const strictInviteOnly = Boolean(inviteOnly);
  const inviteTarget = invitedUserId ? String(invitedUserId) : null;

  if (strictInviteOnly && !inviteTarget) {
    throw new Error("Strict invite only requires an invited user.");
  }

  await ensureWalletAccountForUser(creatorUserId);

  const computedReward = typeof winRewardCents === "number" ? winRewardCents : entryFeeCents * 2;

  const insertPayload: Record<string, unknown> = {
    title,
    kind: "phone",
    game_type: gameType,
    status: "open",
    entry_fee_cents: entryFeeCents,
    win_reward_cents: computedReward,
    created_by: creatorUserId,
    message: finalMsg,
    expires_at: minutesFromNowIso(OPEN_EXPIRE_MINUTES),
    invite_only: strictInviteOnly,
    invited_user_id: inviteTarget,
    opponent_user_id: lockedOpponent,
    show_competitor_names_public: showCompetitorNamesPublic !== false,
  };
  if (creatorTeamId) insertPayload.creator_team_id = creatorTeamId;
  if (opponentTeamId) insertPayload.opponent_team_id = opponentTeamId;
  if (leagueId) insertPayload.league_id = leagueId;
  if (sponsoredBySellerId) insertPayload.sponsored_by_seller_id = sponsoredBySellerId;

  const { data: inserted, error: insertErr } = await supabase
    .from("challenges")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[createChallengeAndChargeCreator] insertErr:", insertErr);
    throw new Error(insertErr?.message ?? "Failed to create challenge.");
  }

  const challengeId = String(inserted.id);

  // Ensure creator row
  const { data: existingCreator } = await supabase
    .from("challenge_players")
    .select("id")
    .eq("challenge_id", challengeId)
    .eq("user_id", creatorUserId)
    .maybeSingle();

  if (!existingCreator?.id) {
    const creatorRow: Record<string, unknown> = {
      challenge_id: challengeId,
      user_id: creatorUserId,
      role: "creator",
      score: null,
      submitted: false,
    };
    if (creatorTeamId) creatorRow.team_id = creatorTeamId;

    const { error: cpErr } = await supabase.from("challenge_players").insert([creatorRow]);
    if (cpErr) console.error("[createChallengeAndChargeCreator] cpErr:", cpErr);
  }

  if (entryFeeCents > 0) {
    await chargeEntryFeeCreator(creatorUserId, entryFeeCents, challengeId);
  }

  const createdPayload: Record<string, unknown> = { kind: "phone", game_type: gameType };
  if (phoneRules && Object.keys(phoneRules).length > 0) {
    createdPayload.phone_rules = phoneRules;
  }

  await insertEvent({
    challengeId,
    type: "challenge_created",
    actorUserId: creatorUserId,
    body: "Challenge created.",
    payload: createdPayload,
  });

  // THREAD: only if opponent is already known
  const knownOpponent = lockedOpponent || inviteTarget;
  if (knownOpponent) {
    await appendThreadEvent({
      userAId: creatorUserId,
      userBId: knownOpponent,
      senderId: creatorUserId,
      type: "challenge_created",
      label: threadGameLabel(gameType, "Challenge created."),
      challengeId,
      payload: createdPayload,
    });
  }

  return challengeId;
}

/**
 * IN-PERSON create
 */
export async function createInPersonChallengeAndChargeCreator(params: {
  title: string;
  gameType: string;
  entryFeeCents: number;
  winRewardCents?: number;
  creatorUserId: string;
  message?: string | null;
  inPersonRules: InPersonRules;

  opponentUserId?: string | null;
  inviteOnly?: boolean;
  invitedUserId?: string | null;

  creatorTeamId?: string | null;
  opponentTeamId?: string | null;
  leagueId?: string | null;
  sponsoredBySellerId?: string | null;
  showCompetitorNamesPublic?: boolean;
}): Promise<string> {
  const {
    title,
    gameType,
    entryFeeCents,
    winRewardCents,
    creatorUserId,
    message,
    inPersonRules,
    inviteOnly,
    invitedUserId,
    opponentUserId,
    creatorTeamId,
    opponentTeamId,
    leagueId,
    sponsoredBySellerId,
    showCompetitorNamesPublic,
  } = params;

  const lockedOpponent = opponentUserId ? String(opponentUserId) : null;

  if (!creatorUserId) throw new Error("Missing creator user id.");
  if (!title?.trim()) throw new Error("Missing title.");
  if (!gameType?.trim()) throw new Error("Missing game type.");

  const cleanMsg = (message ?? "").trim();
  const finalMsg = cleanMsg.length ? cleanMsg.slice(0, 140) : null;

  const strictInviteOnly = Boolean(inviteOnly);
  const inviteTarget = invitedUserId ? String(invitedUserId) : null;

  if (strictInviteOnly && !inviteTarget) {
    throw new Error("Strict invite only requires an invited user.");
  }

  await ensureWalletAccountForUser(creatorUserId);

  const computedReward = typeof winRewardCents === "number" ? winRewardCents : entryFeeCents * 2;

  const checkinWindow = Math.max(5, Math.min(180, Number(inPersonRules?.checkin_window_minutes ?? 30)));
  const deadline = minutesFromNowIso(checkinWindow);

  const rules: InPersonRules = {
    location_text: (inPersonRules?.location_text ?? null)
      ? String(inPersonRules.location_text).slice(0, 80)
      : null,
    checkin_window_minutes: checkinWindow,
    best_of: Math.max(1, Math.min(9, Number(inPersonRules?.best_of ?? 1))) || 1,
  };

  const inPersonPayload: Record<string, unknown> = {
    title,
    game_type: gameType,
    kind: "in_person",
    status: "open",
    entry_fee_cents: entryFeeCents,
    win_reward_cents: computedReward,
    created_by: creatorUserId,
    message: finalMsg,
    in_person_rules: rules,
    checkin_deadline: deadline,
    expires_at: minutesFromNowIso(OPEN_EXPIRE_MINUTES),
    invite_only: strictInviteOnly,
    invited_user_id: inviteTarget,
    opponent_user_id: lockedOpponent,
    show_competitor_names_public: showCompetitorNamesPublic !== false,
  };
  if (creatorTeamId) inPersonPayload.creator_team_id = creatorTeamId;
  if (opponentTeamId) inPersonPayload.opponent_team_id = opponentTeamId;
  if (leagueId) inPersonPayload.league_id = leagueId;
  if (sponsoredBySellerId) inPersonPayload.sponsored_by_seller_id = sponsoredBySellerId;

  const { data: inserted, error: insertErr } = await supabase
    .from("challenges")
    .insert([inPersonPayload])
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[createInPersonChallengeAndChargeCreator] insertErr:", insertErr);
    throw new Error(insertErr?.message ?? "Failed to create challenge.");
  }

  const challengeId = String(inserted.id);

  // Ensure creator row
  const { data: existingCreator } = await supabase
    .from("challenge_players")
    .select("id")
    .eq("challenge_id", challengeId)
    .eq("user_id", creatorUserId)
    .maybeSingle();

  if (!existingCreator?.id) {
    const creatorRow: Record<string, unknown> = {
      challenge_id: challengeId,
      user_id: creatorUserId,
      role: "creator",
      score: null,
      submitted: false,
      checked_in_at: null,
      reported_winner_user_id: null,
    };
    if (creatorTeamId) creatorRow.team_id = creatorTeamId;

    const { error: cpErr } = await supabase.from("challenge_players").insert([creatorRow]);
    if (cpErr) console.error("[createInPersonChallengeAndChargeCreator] cpErr:", cpErr);
  }

  if (entryFeeCents > 0) {
    await chargeEntryFeeCreator(creatorUserId, entryFeeCents, challengeId);
  }

  await insertEvent({
    challengeId,
    type: "challenge_created",
    actorUserId: creatorUserId,
    body: "Challenge created.",
    payload: {
      kind: "in_person",
      game_type: gameType,
      checkin_deadline: deadline,
      in_person_rules: rules,
    },
  });

  // THREAD: only if opponent is already known
  const knownOpponent = lockedOpponent || inviteTarget;
  if (knownOpponent) {
    const loc = (rules.location_text ?? "").trim();
    const locText = loc ? ` • Location: ${loc}` : "";
    const threadLabel = threadGameLabel(gameType, `Challenge created.${locText}`);

    await appendThreadEvent({
      userAId: creatorUserId,
      userBId: knownOpponent,
      senderId: creatorUserId,
      type: "challenge_created",
      label: threadLabel,
      challengeId,
      payload: { kind: "in_person", game_type: gameType, location_text: rules.location_text ?? null },
    });
  }

  return challengeId;
}

/**
 * E-GAME create (Rocket League, Valorant, etc. — play elsewhere, report winner)
 * Same as phone challenge but kind: "egame"; no in-app play, manual result like in-person but no check-in.
 */
export async function createEgameChallengeAndChargeCreator(params: {
  title: string;
  gameType: string;
  entryFeeCents: number;
  winRewardCents?: number;
  creatorUserId: string;
  message?: string | null;

  opponentUserId?: string | null;
  inviteOnly?: boolean;
  invitedUserId?: string | null;

  creatorTeamId?: string | null;
  opponentTeamId?: string | null;
  leagueId?: string | null;
  sponsoredBySellerId?: string | null;
  showCompetitorNamesPublic?: boolean;
}): Promise<string> {
  const {
    title,
    gameType,
    entryFeeCents,
    winRewardCents,
    creatorUserId,
    message,
    inviteOnly,
    invitedUserId,
    opponentUserId,
    creatorTeamId,
    opponentTeamId,
    leagueId,
    sponsoredBySellerId,
    showCompetitorNamesPublic,
  } = params;

  const lockedOpponent = opponentUserId ? String(opponentUserId) : null;
  if (!creatorUserId) throw new Error("Missing creator user id.");
  if (!title?.trim()) throw new Error("Missing title.");
  if (!gameType?.trim()) throw new Error("Missing game type.");

  const cleanMsg = (message ?? "").trim();
  const finalMsg = cleanMsg.length ? cleanMsg.slice(0, 140) : null;
  const strictInviteOnly = Boolean(inviteOnly);
  const inviteTarget = invitedUserId ? String(invitedUserId) : null;
  if (strictInviteOnly && !inviteTarget) throw new Error("Strict invite only requires an invited user.");

  await ensureWalletAccountForUser(creatorUserId);
  const computedReward = typeof winRewardCents === "number" ? winRewardCents : entryFeeCents * 2;

  const insertPayload: Record<string, unknown> = {
    title,
    kind: "egame",
    game_type: gameType,
    status: "open",
    entry_fee_cents: entryFeeCents,
    win_reward_cents: computedReward,
    created_by: creatorUserId,
    message: finalMsg,
    expires_at: minutesFromNowIso(OPEN_EXPIRE_MINUTES),
    invite_only: strictInviteOnly,
    invited_user_id: inviteTarget,
    opponent_user_id: lockedOpponent,
    show_competitor_names_public: showCompetitorNamesPublic !== false,
  };
  if (creatorTeamId) insertPayload.creator_team_id = creatorTeamId;
  if (opponentTeamId) insertPayload.opponent_team_id = opponentTeamId;
  if (leagueId) insertPayload.league_id = leagueId;
  if (sponsoredBySellerId) insertPayload.sponsored_by_seller_id = sponsoredBySellerId;

  const { data: inserted, error: insertErr } = await supabase
    .from("challenges")
    .insert([insertPayload])
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.error("[createEgameChallengeAndChargeCreator] insertErr:", insertErr);
    throw new Error(insertErr?.message ?? "Failed to create challenge.");
  }

  const challengeId = String(inserted.id);

  const { data: existingCreator } = await supabase
    .from("challenge_players")
    .select("id")
    .eq("challenge_id", challengeId)
    .eq("user_id", creatorUserId)
    .maybeSingle();

  if (!existingCreator?.id) {
    const creatorRow: Record<string, unknown> = {
      challenge_id: challengeId,
      user_id: creatorUserId,
      role: "creator",
      score: null,
      submitted: false,
    };
    if (creatorTeamId) creatorRow.team_id = creatorTeamId;
    const { error: cpErr } = await supabase.from("challenge_players").insert([creatorRow]);
    if (cpErr) console.error("[createEgameChallengeAndChargeCreator] cpErr:", cpErr);
  }

  if (entryFeeCents > 0) {
    await chargeEntryFeeCreator(creatorUserId, entryFeeCents, challengeId);
  }

  await insertEvent({
    challengeId,
    type: "challenge_created",
    actorUserId: creatorUserId,
    body: "E-game challenge created.",
    payload: { kind: "egame", game_type: gameType },
  });

  const knownOpponent = lockedOpponent || inviteTarget;
  if (knownOpponent) {
    await appendThreadEvent({
      userAId: creatorUserId,
      userBId: knownOpponent,
      senderId: creatorUserId,
      type: "challenge_created",
      label: threadGameLabel(gameType, "E-game challenge created."),
      challengeId,
      payload: { kind: "egame", game_type: gameType },
    });
  }

  return challengeId;
}

/**
 * ✅ In-person check-in
 * ALSO ensures prompts are created + resolved so buttons appear in the thread.
 */
export async function checkInToInPersonChallenge(params: {
  challengeId: string;
  userId: string;
}): Promise<void> {
  const { challengeId, userId } = params;
  if (!challengeId || !userId) throw new Error("Missing challengeId or userId.");

  const challenge = await loadChallenge(challengeId);
  if (challenge.kind !== "in_person") throw new Error("Not an in-person challenge.");

  if (challenge.status !== "accepted" && challenge.status !== "checked-in") {
    throw new Error("Challenge is not ready for check-in.");
  }

  if (challenge.checkin_deadline) {
    const now = Date.now();
    const deadline = new Date(challenge.checkin_deadline).getTime();
    if (now > deadline) throw new Error("Check-in window expired.");
  }

  const nowISO = nowIso();

  const { error } = await supabase
    .from("challenge_players")
    .update({ checked_in_at: nowISO })
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .is("checked_in_at", null);

  if (error) throw new Error(error.message);

  await insertEvent({
    challengeId,
    type: "check_in",
    actorUserId: userId,
    body: "Checked in.",
    payload: { checked_in_at: nowISO },
  });

  // Determine creator/opponent for prompt work
  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator") ?? null;
  const opp = ps.find((p) => p.role === "opponent") ?? null;

  const otherUserId = await getOpponentIdFromPlayers(challengeId, userId);

  // Thread event (keeps your existing feed)
  if (otherUserId) {
    await appendThreadEvent({
      userAId: userId,
      userBId: otherUserId,
      senderId: null,
      type: "check_in",
      label: threadGameLabel(challenge.game_type, "Checked in."),
      challengeId,
      payload: { checked_in_at: nowISO, game_type: challenge.game_type },
    });
  }

  // Ensure prompts exist and resolve the check-in prompt for THIS user
  if (creator && opp) {
    await ensureCheckInPrompts({
      challengeId,
      creatorId: creator.user_id,
      opponentId: opp.user_id,
    });

    await resolveCheckInPrompt({
      challengeId,
      creatorId: creator.user_id,
      opponentId: opp.user_id,
      resolverUserId: userId,
      resolution: "yes",
      label: "Checked in.",
    });
  }

  // If both checked in -> status flip + thread submit prompts
  const ps2 = await loadPlayers(challengeId);
  const creator2 = ps2.find((p) => p.role === "creator");
  const opp2 = ps2.find((p) => p.role === "opponent");
  const bothCheckedIn = !!creator2?.checked_in_at && !!opp2?.checked_in_at;

  if (!creator2 || !opp2) return;

  if (bothCheckedIn) {
    const { error: upErr } = await supabase
      .from("challenges")
      .update({ status: "checked-in", updated_at: nowISO })
      .eq("id", challengeId)
      .in("status", ["accepted", "checked-in"]);

    if (upErr) throw new Error(upErr.message);

    const label = threadGameLabel(
      challenge.game_type,
      "Both players checked in. You may submit results when finished."
    );

    await ensureEventOnce({
      challengeId,
      type: "both_checked_in",
      actorUserId: null,
      body: label,
      payload: { game_type: challenge.game_type },
    });

    await appendThreadEvent({
      userAId: creator2.user_id,
      userBId: opp2.user_id,
      senderId: null,
      type: "both_checked_in",
      label,
      challengeId,
      payload: { game_type: challenge.game_type },
    });

    // ✅ THIS is what makes the Submit buttons appear in-thread
    await ensureSubmitResultPrompts({
      challengeId,
      creatorId: creator2.user_id,
      opponentId: opp2.user_id,
    });
  }
}

/**
 * ✅ In-person submit result
 */
export async function submitInPersonResult(params: {
  challengeId: string;
  userId: string;
  winnerUserId: string | null;
}): Promise<void> {
  const { challengeId, userId, winnerUserId } = params;
  if (!challengeId || !userId) throw new Error("Missing challengeId or userId.");

  const nowISO = nowIso();
  const challenge = await loadChallenge(challengeId);

  if ((challenge.kind ?? "in_person") !== "in_person") throw new Error("Not an in-person challenge.");
  if (challenge.status === "cancelled") throw new Error("Challenge cancelled.");
  if (challenge.status === "completed") return;

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator") ?? null;
  const opp = ps.find((p) => p.role === "opponent") ?? null;
  if (!creator || !opp) throw new Error("Challenge is not ready (missing both players).");

  const isParticipant = creator.user_id === userId || opp.user_id === userId;
  if (!isParticipant) throw new Error("Only participants can submit results.");

  const bothCheckedIn = Boolean(creator.checked_in_at) && Boolean(opp.checked_in_at);
  if (!bothCheckedIn) throw new Error("Both players must check in before submitting results.");

  if (challenge.status !== "checked-in") {
    const { error: flipErr } = await supabase
      .from("challenges")
      .update({ status: "checked-in", updated_at: nowISO })
      .eq("id", challengeId)
      .in("status", ["accepted", "in-progress", "checked-in"]);
    if (flipErr) throw new Error(flipErr.message);
  }

  const { error: upErr } = await supabase
    .from("challenge_players")
    .update({
      submitted: true,
      reported_winner_user_id: winnerUserId,
    })
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);

  if (upErr) throw new Error(upErr.message);

  // Ensure submit prompts exist, and resolve THIS user's submit prompt
  await ensureSubmitResultPrompts({
    challengeId,
    creatorId: creator.user_id,
    opponentId: opp.user_id,
  });

  await resolveSubmitPrompt({
    challengeId,
    creatorId: creator.user_id,
    opponentId: opp.user_id,
    resolverUserId: userId,
    resolution: "yes",
    label: "Result submitted.",
  });

  await ensureEventOnce({
    challengeId,
    type: "result_submitted",
    actorUserId: userId,
    body: "Result submitted — waiting on opponent.",
    payload: { winner_user_id: winnerUserId },
  });

  const otherUserId = await getOpponentIdFromPlayers(challengeId, userId);
  if (otherUserId) {
    await appendThreadEvent({
      userAId: userId,
      userBId: otherUserId,
      senderId: null,
      type: "result_submitted",
      label: threadGameLabel(challenge.game_type, "Result submitted — waiting on opponent."),
      challengeId,
      payload: { winner_user_id: winnerUserId, game_type: challenge.game_type },
    });

    const psCheck = await loadPlayers(challengeId);
    const other = psCheck.find((p) => p.user_id === otherUserId);
    if (other && !other.submitted) {
      await ensureSubmitResultPrompts({
        challengeId,
        creatorId: creator.user_id,
        opponentId: opp.user_id,
      });
    }
  }

  const ps2 = await loadPlayers(challengeId);
  const creator2 = ps2.find((p) => p.role === "creator") ?? null;
  const opp2 = ps2.find((p) => p.role === "opponent") ?? null;
  if (!creator2 || !opp2) return;

  const bothSubmitted = Boolean(creator2.submitted) && Boolean(opp2.submitted);
  if (!bothSubmitted) return;

  const cWin = creator2.reported_winner_user_id ?? null;
  const oWin = opp2.reported_winner_user_id ?? null;
  const agrees = cWin === oWin;

  if (!agrees) {
    const { error: disputeErr } = await supabase
      .from("challenges")
      .update({ status: "disputed", updated_at: nowISO })
      .eq("id", challengeId);

    if (disputeErr) throw new Error(disputeErr.message);

    const label = threadGameLabel(
      challenge.game_type,
      "Disputed — players reported different outcomes."
    );

    await ensureEventOnce({
      challengeId,
      type: "disputed",
      actorUserId: null,
      body: label,
      payload: { creator_reported: cWin, opponent_reported: oWin, game_type: challenge.game_type },
    });

    await appendThreadEvent({
      userAId: creator2.user_id,
      userBId: opp2.user_id,
      senderId: null,
      type: "disputed",
      label,
      challengeId,
      payload: { creator_reported: cWin, opponent_reported: oWin, game_type: challenge.game_type },
    });

    await dismissAllInPersonPrompts({
      challengeId,
      creatorId: creator2.user_id,
      opponentId: opp2.user_id,
      resolverUserId: userId,
      label: "Disputed.",
    });

    return;
  }

  const winner = cWin; // can be null => tie

  // For team challenges: derive winner_team_id from winner user + creator/opponent teams
  const ch = challenge as { creator_team_id?: string | null; opponent_team_id?: string | null };
  const creatorTeamId = ch.creator_team_id ?? null;
  const opponentTeamId = ch.opponent_team_id ?? null;
  const isTeamChallenge = !!creatorTeamId || !!opponentTeamId;

  let winnerTeamId: string | null = null;
  if (isTeamChallenge && winner) {
    if (creator2.user_id === winner) winnerTeamId = creatorTeamId ?? null;
    else if (opp2.user_id === winner) winnerTeamId = opponentTeamId ?? null;
  }

  const updatePayload: Record<string, unknown> = {
    status: "completed",
    winner_user_id: winner,
    completed_at: nowISO,
    updated_at: nowISO,
    expires_at: null,
  };
  if (isTeamChallenge) updatePayload.winner_team_id = winnerTeamId;

  const { error: completeErr } = await supabase
    .from("challenges")
    .update(updatePayload)
    .eq("id", challengeId)
    .in("status", ["checked-in", "in-progress", "accepted", "disputed"]);

  if (completeErr) throw new Error(completeErr.message);

  const reward = Number(challenge.win_reward_cents ?? 0);
  const completedLabel = threadGameLabel(
    challenge.game_type,
    winner == null ? "Match completed — tie." : `Match completed — winner confirmed (+$${(reward / 100).toFixed(2)}).`
  );

  await ensureEventOnce({
    challengeId,
    type: "completed",
    actorUserId: userId,
    body: completedLabel,
    payload: { winner_user_id: winner, winner_team_id: winnerTeamId ?? undefined },
  });

  // ✅ CHANGE: completion is a SYSTEM message, not “sent by” a player
  await appendThreadEvent({
    userAId: creator2.user_id,
    userBId: opp2.user_id,
    senderId: null,
    type: "challenge_completed",
    label: completedLabel,
    challengeId,
    payload: {
      winner_user_id: winner,
      winner_team_id: winnerTeamId ?? undefined,
      game_type: challenge.game_type,
    },
  });

  await dismissAllInPersonPrompts({
    challengeId,
    creatorId: creator2.user_id,
    opponentId: opp2.user_id,
    resolverUserId: userId,
    label: "Completed.",
  });

  await settleChallenge({ challengeId, actorUserId: userId });

  void notifyWinnerIfLeaderboardQualifies({
    winnerUserId: winner,
    gameType: challenge.game_type,
    challengeId,
  });
}

/**
 * JOIN — supports both signatures
 * For open team challenges (creator_team_id set, opponent_team_id null), pass opponentTeamId (user's team).
 */
export async function joinChallenge(
  a: string | { challengeId: string; userId: string; opponentTeamId?: string | null },
  b?: string
): Promise<void> {
  const challengeId = typeof a === "string" ? String(a) : String(a.challengeId);
  const userId = typeof a === "string" ? String(b ?? "") : String(a.userId);
  const joinAsTeamId = typeof a === "object" ? a.opponentTeamId ?? null : null;

  if (!challengeId || !userId) throw new Error("Missing challengeId or userId.");

  const challenge = await loadChallenge(challengeId);

  if (!challenge.created_by) throw new Error("Challenge missing creator.");
  if (String(challenge.created_by) === userId) throw new Error("You can't join your own challenge.");

  const lockedOpponent = challenge.opponent_user_id ? String(challenge.opponent_user_id) : null;
  if (lockedOpponent && lockedOpponent !== userId) {
    throw new Error("This challenge is reserved for a specific opponent.");
  }

  const creatorTeamId = (challenge as { creator_team_id?: string | null }).creator_team_id ?? null;
  let opponentTeamId = (challenge as { opponent_team_id?: string | null }).opponent_team_id ?? null;

  // Open team challenge: opponent_team_id not set yet — joiner must pass their team
  if (creatorTeamId != null && opponentTeamId == null) {
    if (!joinAsTeamId) throw new Error("Pick a team to join this challenge.");
    const { data: inTeam } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", joinAsTeamId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!inTeam?.id) throw new Error("You must be a member of the team you're joining as.");
    if (joinAsTeamId === creatorTeamId) throw new Error("You can't join as the same team that created the challenge.");
    opponentTeamId = joinAsTeamId;
  } else if (opponentTeamId != null) {
    // Specific opponent team — joiner must be in that team
    const { data: inTeam } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", opponentTeamId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!inTeam?.id) throw new Error("This challenge is reserved for a specific team. Join that team first.");
  }

  const strict = Boolean(challenge.invite_only);
  const invited = challenge.invited_user_id ? String(challenge.invited_user_id) : null;
  if (strict && !invited) throw new Error("Strict invite only — missing invited user.");
  if (strict && invited !== userId) throw new Error("Strict invite only — you are not the invited player.");

  await ensureWalletAccountForUser(userId);

  const isInPerson = (challenge.kind ?? "phone") === "in_person";

  const opponentRow: any = {
    challenge_id: challengeId,
    user_id: userId,
    role: "opponent",
    score: null,
    submitted: false,
  };

  if (opponentTeamId) opponentRow.team_id = opponentTeamId;

  if (isInPerson) {
    opponentRow.checked_in_at = null;
    opponentRow.reported_winner_user_id = null;
  }

  const { error: upsertErr } = await supabase
    .from("challenge_players")
    .upsert(opponentRow, { onConflict: "challenge_id,user_id" });

  if (upsertErr) {
    const msg = String(upsertErr.message ?? "");
    const code = (upsertErr as any).code;
    const isDup = code === "23505" || msg.toLowerCase().includes("duplicate");
    if (!isDup) throw new Error(upsertErr.message);
  }

  const nowISO = nowIso();
  const activeExpiresAt = minutesFromNowIso(ACTIVE_EXPIRE_MINUTES);

  const statusUpdate: Record<string, unknown> = {
    status: "accepted",
    updated_at: nowISO,
    expires_at: activeExpiresAt,
  };
  if (opponentTeamId != null) statusUpdate.opponent_team_id = opponentTeamId;

  const { data: updated, error: statusErr } = await supabase
    .from("challenges")
    .update(statusUpdate)
    .eq("id", challengeId)
    .eq("status", "open")
    .select("id,status")
    .maybeSingle();

  if (statusErr) throw new Error(statusErr.message);

  if (updated?.id && updated.status === "accepted") {
    const entryFee = Number(challenge.entry_fee_cents ?? 0);
    if (entryFee > 0) {
      await chargeEntryFeeOpponent(userId, entryFee, challengeId);
    }

    await ensureEventOnce({
      challengeId,
      type: "challenge_accepted",
      actorUserId: userId,
      body: "Opponent joined — match accepted.",
      payload: {},
    });

    const creatorId = String(challenge.created_by);

    const isEgame = (challenge.kind ?? "phone") === "egame";
    let acceptLabel = "Opponent joined — match accepted.";
    if (isInPerson) {
      const loc = String(challenge.in_person_rules?.location_text ?? "").trim();
      const w = Number(challenge.in_person_rules?.checkin_window_minutes ?? 30);
      const locPart = loc ? ` Location: ${loc}.` : "";
      acceptLabel = `Opponent joined — match accepted.${locPart} Check-in window: ${w} min.`;
    } else if (isEgame) {
      const hasPot = Number(challenge.entry_fee_cents ?? 0) > 0;
      acceptLabel = hasPot
        ? "Match accepted — winner reports with proof. Opponent confirms within 12h."
        : "Match accepted — winner reports result. Opponent confirms within 12h.";
    }
    acceptLabel = threadGameLabel(challenge.game_type, acceptLabel);

    await appendThreadEvent({
      userAId: userId,
      userBId: creatorId,
      senderId: null,
      type: "challenge_accepted",
      label: acceptLabel,
      challengeId,
      payload: { kind: challenge.kind ?? "phone", game_type: challenge.game_type },
    });

    try {
      const { notifyUser } = await import("./notifications");
      const { NOTIFICATION_TYPES } = await import("./notificationTypes");
      await notifyUser({
        targetUserId: creatorId,
        type: NOTIFICATION_TYPES.CHALLENGE_ACCEPTED,
        title: "Challenge accepted",
        body: "Someone accepted your challenge. Tap to view.",
        link: `/challenge/${challengeId}`,
      });
    } catch (e) {
      console.warn("[joinChallenge] notifyUser failed:", e);
    }

    // ✅ This inserts the in-thread Check In buttons
    if (isInPerson) {
      await ensureCheckInPrompts({
        challengeId,
        creatorId,
        opponentId: userId,
      });
    }

    return;
  }

  const { data: mePlayer, error: meErr } = await supabase
    .from("challenge_players")
    .select("id, role")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!meErr && mePlayer?.id) {
    return;
  }

  const fresh = await loadChallenge(challengeId);
  if (fresh.status !== "open") {
    throw new Error("Challenge is no longer open to join.");
  }

  throw new Error("Could not accept challenge (RLS/policy). Fix challenges UPDATE policy for open challenges.");
}

/**
 * When both players have submitted scores but the match is still active, decide the winner.
 */
export async function finalizeScoreBasedChallengeIfReady(params: {
  challengeId: string;
  actorUserId: string;
  scoreSort?: ScoreSort;
}): Promise<boolean> {
  const { challengeId, actorUserId, scoreSort } = params;

  let latest: ChallengeRow;
  try {
    latest = await loadChallenge(challengeId);
  } catch {
    return false;
  }

  if (latest.status === "completed") return true;
  if (!["accepted", "in-progress"].includes(latest.status)) return false;

  const players = await loadPlayers(challengeId);
  const creator = players.find((p) => p.role === "creator");
  const opponent = players.find((p) => p.role === "opponent");
  if (!creator || !opponent) return false;
  if (!creator.submitted || !opponent.submitted) return false;

  const sort: ScoreSort = scoreSort ?? inferScoreSortFromGameType(latest.game_type);
  const { winnerUserId } = pickWinner(creator, opponent, sort);

  const doneISO = nowIso();
  const { data: updated, error: completeErr } = await supabase
    .from("challenges")
    .update({
      status: "completed",
      completed_at: doneISO,
      winner_user_id: winnerUserId,
      updated_at: doneISO,
      expires_at: null,
    })
    .eq("id", challengeId)
    .in("status", ["accepted", "in-progress"])
    .select("id")
    .maybeSingle();

  if (completeErr) throw new Error(completeErr.message);

  if (!updated?.id) {
    const recheck = await loadChallenge(challengeId);
    return recheck.status === "completed";
  }

  const completedLabel = threadGameLabel(
    latest.game_type,
    winnerUserId ? "Match completed — winner decided." : "Match completed — tie."
  );

  await ensureEventOnce({
    challengeId,
    type: "completed",
    actorUserId,
    body: completedLabel,
    payload: { winner_user_id: winnerUserId },
  });

  const otherUserId =
    creator.user_id === actorUserId ? opponent.user_id : creator.user_id;
  if (otherUserId) {
    await appendThreadEvent({
      userAId: actorUserId,
      userBId: otherUserId,
      senderId: null,
      type: "challenge_completed",
      label: completedLabel,
      challengeId,
      payload: { winner_user_id: winnerUserId, game_type: latest.game_type },
    });
  }

  await settleChallenge({ challengeId, actorUserId });

  const wScore =
    winnerUserId && creator.user_id === winnerUserId
      ? creator.score
      : winnerUserId && opponent.user_id === winnerUserId
        ? opponent.score
        : null;
  void notifyWinnerIfLeaderboardQualifies({
    winnerUserId,
    gameType: latest.game_type,
    winnerScore: wScore != null ? Number(wScore) : null,
    challengeId,
  });

  return true;
}

/**
 * Repair matches stuck after both players finished (scores submitted or board has a winner).
 */
export async function repairChallengeCompletion(params: {
  challengeId: string;
  actorUserId: string;
}): Promise<boolean> {
  const { challengeId, actorUserId } = params;

  let challenge: ChallengeRow;
  try {
    challenge = await loadChallenge(challengeId);
  } catch {
    return false;
  }

  if (challenge.status === "completed") return true;

  try {
    const finalized = await finalizeScoreBasedChallengeIfReady({
      challengeId,
      actorUserId,
    });
    if (finalized) return true;
  } catch (e) {
    console.warn("[repairChallengeCompletion] score finalize failed:", e);
  }

  if (!isTurnBasedGameType(challenge.game_type)) return false;

  const { data: turnRow, error: turnErr } = await supabase
    .from("challenge_turns")
    .select("state")
    .eq("challenge_id", challengeId)
    .maybeSingle();

  if (turnErr || !turnRow?.state) return false;

  const winnerColor = turnRow.state?.winner_color;
  if (winnerColor !== "red" && winnerColor !== "black") return false;

  const players = await loadPlayers(challengeId);
  const creator = players.find((p) => p.role === "creator");
  const opponent = players.find((p) => p.role === "opponent");
  if (!creator || !opponent) return false;

  const winnerUserId = winnerColor === "red" ? creator.user_id : opponent.user_id;

  try {
    await completeTurnBasedChallenge({
      challengeId,
      winnerUserId,
      actorUserId,
      creatorUserId: creator.user_id,
      opponentUserId: opponent.user_id,
    });
    return true;
  } catch (e) {
    console.warn("[repairChallengeCompletion] turn-based finalize failed:", e);
    return false;
  }
}

/**
 * Best-effort repair for the current user's active matches (Pulse + stuck results).
 */
export async function repairMyActiveChallenges(actorUserId: string, limit = 12): Promise<number> {
  if (!actorUserId) return 0;

  const { data: playerRows, error: playerErr } = await supabase
    .from("challenge_players")
    .select("challenge_id")
    .eq("user_id", actorUserId);

  if (playerErr || !playerRows?.length) return 0;

  const ids = [...new Set(playerRows.map((r: any) => String(r.challenge_id)).filter(Boolean))];
  if (!ids.length) return 0;

  const { data: activeRows, error: activeErr } = await supabase
    .from("challenges")
    .select("id")
    .in("id", ids)
    .in("status", ["accepted", "in-progress"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (activeErr || !activeRows?.length) return 0;

  let repaired = 0;
  for (const row of activeRows) {
    try {
      const ok = await repairChallengeCompletion({
        challengeId: String(row.id),
        actorUserId,
      });
      if (ok) repaired += 1;
    } catch {
      /* try next */
    }
  }
  return repaired;
}

/**
 * PHONE: submit results (scores)
 */
export async function submitChallengeResult(params: {
  challengeId: string;
  userId: string;
  score: number;
  scoreSort?: ScoreSort;
}): Promise<void> {
  const { challengeId, userId, score, scoreSort } = params;

  if (!challengeId || !userId) throw new Error("Missing challengeId or userId.");
  if (!Number.isFinite(score)) throw new Error("Score must be a number.");

  const challenge = await loadChallenge(challengeId);
  if (challenge.status === "completed") return;
  if (!["accepted", "in-progress"].includes(challenge.status)) {
    throw new Error("Challenge is not ready for score submission.");
  }

  const playersBefore = await loadPlayers(challengeId);
  const me = playersBefore.find((p) => p.user_id === userId);
  if (!me) throw new Error("You are not part of this challenge.");
  if (me.submitted) {
    await finalizeScoreBasedChallengeIfReady({ challengeId, actorUserId: userId, scoreSort });
    return;
  }

  const { error: updateErr } = await supabase
    .from("challenge_players")
    .update({ score, submitted: true })
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);

  if (updateErr) throw new Error(updateErr.message);

  await insertEvent({
    challengeId,
    type: "score_submitted",
    actorUserId: userId,
    body: "Score submitted — waiting on opponent.",
    payload: {},
  });

  const otherUserId = await getOpponentIdFromPlayers(challengeId, userId);
  if (otherUserId) {
    await appendThreadEvent({
      userAId: userId,
      userBId: otherUserId,
      senderId: null,
      type: "score_submitted",
      label: threadGameLabel(challenge.game_type, "Score submitted — waiting on opponent."),
      challengeId,
      payload: { score, game_type: challenge.game_type },
    });
  }

  if (challenge.status === "accepted") {
    await supabase
      .from("challenges")
      .update({
        status: "in-progress",
        updated_at: nowIso(),
        expires_at: minutesFromNowIso(ACTIVE_EXPIRE_MINUTES),
      })
      .eq("id", challengeId)
      .eq("status", "accepted");
  }

  await finalizeScoreBasedChallengeIfReady({ challengeId, actorUserId: userId, scoreSort });
}

/**
 * ✅ Legacy function kept (no feature removal)
 */
export async function submitChallengeScore(
  challengeId: string,
  userId: string,
  score: number
): Promise<void> {
  return submitChallengeResult({ challengeId, userId, score, scoreSort: "desc" });
}

export type ChallengeOutcome = {
  status: "waiting" | "completed";
  won: boolean | null;
  winnerUserId: string | null;
  winnerDisplayName: string | null;
  myScore: number | null;
  opponentScore: number | null;
  rewardCents: number | null;
  gameType: string | null;
  myRatingDelta?: number | null;
};

function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function profileDisplayName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  const name = String((data as any).display_name ?? "").trim() || String((data as any).username ?? "").trim();
  return name || null;
}

async function buildChallengeOutcome(
  challenge: ChallengeRow,
  userId: string,
  players: ChallengePlayerRow[]
): Promise<ChallengeOutcome> {
  const me = players.find((p) => p.user_id === userId) ?? null;
  const opp = players.find((p) => p.user_id !== userId) ?? null;
  const winnerId = challenge.winner_user_id ?? null;
  const won = winnerId == null ? null : winnerId === userId ? true : false;
  const winnerDisplayName = await profileDisplayName(winnerId);

  let myRatingDelta: number | null = null;
  const storedWinnerDelta = (challenge as any).winner_rating_delta;
  const storedLoserDelta = (challenge as any).loser_rating_delta;
  if (typeof storedWinnerDelta === "number" && winnerId === userId) {
    myRatingDelta = storedWinnerDelta;
  } else if (typeof storedLoserDelta === "number" && winnerId && winnerId !== userId) {
    myRatingDelta = storedLoserDelta;
  }

  return {
    status: "completed",
    won,
    winnerUserId: winnerId,
    winnerDisplayName,
    myScore: me?.score != null ? Number(me.score) : null,
    opponentScore: opp?.score != null ? Number(opp.score) : null,
    rewardCents: (challenge as any).win_reward_cents ?? null,
    gameType: challenge.game_type ?? null,
    myRatingDelta,
  };
}

const WAITING_OUTCOME = (gameType: string | null = null): ChallengeOutcome => ({
  status: "waiting",
  won: null,
  winnerUserId: null,
  winnerDisplayName: null,
  myScore: null,
  opponentScore: null,
  rewardCents: null,
  gameType,
});

/**
 * Poll until a challenge completes (or timeout). Triggers repair/finalize while waiting.
 */
export async function pollChallengeOutcome(params: {
  challengeId: string;
  userId: string;
  maxAttempts?: number;
  intervalMs?: number;
  scoreSort?: ScoreSort;
}): Promise<ChallengeOutcome> {
  const { challengeId, userId, maxAttempts = 24, intervalMs = 500, scoreSort } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0 && attempt % 4 === 0) {
      try {
        await repairChallengeCompletion({ challengeId, actorUserId: userId });
      } catch {
        /* ignore */
      }
    }

    let challenge: ChallengeRow;
    try {
      challenge = await loadChallenge(challengeId);
    } catch {
      return WAITING_OUTCOME();
    }

    const players = await loadPlayers(challengeId);

    if (challenge.status === "completed") {
      return buildChallengeOutcome(challenge, userId, players);
    }

    const creator = players.find((p) => p.role === "creator");
    const opponent = players.find((p) => p.role === "opponent");
    const bothSubmitted = Boolean(creator?.submitted) && Boolean(opponent?.submitted);

    if (bothSubmitted && ["accepted", "in-progress", "checked-in"].includes(challenge.status)) {
      try {
        const kind = (challenge as any).kind ?? "phone";
        if (kind !== "in_person" && kind !== "egame") {
          await finalizeScoreBasedChallengeIfReady({ challengeId, actorUserId: userId, scoreSort });
          const recheck = await loadChallenge(challengeId);
          if (recheck.status === "completed") {
            const ps2 = await loadPlayers(challengeId);
            return buildChallengeOutcome(recheck, userId, ps2);
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (attempt < maxAttempts - 1) {
      await sleepMs(intervalMs);
    }
  }

  try {
    const challenge = await loadChallenge(challengeId);
    return WAITING_OUTCOME(challenge.game_type ?? null);
  } catch {
    return WAITING_OUTCOME();
  }
}

export function outcomeHeadline(outcome: ChallengeOutcome): string {
  if (outcome.status !== "completed") return "Submitted — waiting on opponent";
  if (outcome.won === true) return "You won!";
  if (outcome.won === false) {
    return outcome.winnerDisplayName ? `${outcome.winnerDisplayName} wins` : "You lost";
  }
  return "It's a tie";
}

/** Lower time wins (e.g. Sudoku Race). */
export async function submitChallengeTime(
  challengeId: string,
  userId: string,
  timeSeconds: number
): Promise<void> {
  return submitChallengeResult({ challengeId, userId, score: timeSeconds, scoreSort: "asc" });
}

export async function cancelChallenge(params: {
  challengeId: string;
  reason?: string;
  actorUserId?: string | null;
}): Promise<void> {
  const { challengeId, reason, actorUserId } = params;
  if (!challengeId) throw new Error("Missing challengeId.");

  let gameType: string | null = null;
  try {
    const ch = await loadChallenge(challengeId);
    gameType = ch.game_type ?? null;
  } catch {
    // ignore
  }

  const { error } = await supabase.rpc("cancel_challenge", {
    p_challenge_id: challengeId,
    p_reason: reason ?? "creator_cancel",
  });

  if (error) throw new Error(error.message);

  await ensureEventOnce({
    challengeId,
    type: "cancelled",
    actorUserId: actorUserId ?? null,
    body: "Challenge cancelled.",
    payload: { reason: reason ?? "creator_cancel" },
  });

  let me = actorUserId ?? null;
  if (!me) {
    const { data: u } = await supabase.auth.getUser();
    me = u?.user?.id ?? null;
  }

  if (me) {
    const otherUserId = await getOpponentIdFromPlayers(challengeId, me);
    if (otherUserId) {
      await appendThreadEvent({
        userAId: me,
        userBId: otherUserId,
        senderId: null,
        type: "cancelled",
        label: threadGameLabel(gameType, "Challenge cancelled."),
        challengeId,
        payload: { reason: reason ?? "creator_cancel", game_type: gameType },
      });

      try {
        const ps = await loadPlayers(challengeId);
        const creator = ps.find((p) => p.role === "creator");
        const opp = ps.find((p) => p.role === "opponent");
        if (creator && opp) {
          await dismissAllInPersonPrompts({
            challengeId,
            creatorId: creator.user_id,
            opponentId: opp.user_id,
            resolverUserId: me,
            label: "Cancelled.",
          });
        }
      } catch {
        // ignore
      }
    }
  }
}
