// lib/backend/egameVerification.ts
// Tiered e-game verification: winner reports → loser confirms/disputes → auto-confirm.

import { supabase } from "./supabaseClient";
import { settleChallenge } from "./challengeActions";
import { notifyWinnerIfLeaderboardQualifies } from "./leaderboardQualification";
import { appendThreadEvent, appendThreadPrompt, buildPromptId, resolveThreadPrompt } from "./threadActions";
import type { ChallengeRow } from "../models/challengeTypes";

export const EGAME_CONFIRM_HOURS = 12;
export const MATCH_TRUST_THRESHOLD = 70;

type ChallengePlayerRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  role: "creator" | "opponent";
  submitted?: boolean | null;
  reported_winner_user_id?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function hoursFromNowIso(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function threadGameTitle(gameType: string | null | undefined): string {
  return String(gameType ?? "").trim() || "E-game";
}

async function loadChallenge(challengeId: string): Promise<ChallengeRow & {
  pending_winner_user_id?: string | null;
  result_reported_by?: string | null;
  result_reported_at?: string | null;
  result_confirm_by?: string | null;
  result_proof_path?: string | null;
  league_id?: string | null;
}> {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `
      id, title, game_type, status, kind, entry_fee_cents, win_reward_cents,
      created_by, winner_user_id, completed_at, league_id,
      pending_winner_user_id, result_reported_by, result_reported_at,
      result_confirm_by, result_proof_path
    `
    )
    .eq("id", challengeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Challenge not found.");
  return data as any;
}

async function loadPlayers(challengeId: string): Promise<ChallengePlayerRow[]> {
  const { data, error } = await supabase
    .from("challenge_players")
    .select("id, challenge_id, user_id, role, submitted, reported_winner_user_id")
    .eq("challenge_id", challengeId);

  if (error) throw new Error(error.message);
  return (data ?? []) as ChallengePlayerRow[];
}

async function ensureThreadForUsers(userAId: string, userBId: string): Promise<string> {
  const A = String(userAId);
  const B = String(userBId);
  const user_low = A < B ? A : B;
  const user_high = A < B ? B : A;
  const pair_key = `${user_low}:${user_high}`;

  const { data: existing } = await supabase
    .from("threads")
    .select("id")
    .eq("user_low", user_low)
    .eq("user_high", user_high)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data: created, error } = await supabase
    .from("threads")
    .insert({ user_low, user_high, pair_key, last_message_at: nowIso(), last_preview: "" })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!created?.id) throw new Error("Failed to create thread.");
  return String(created.id);
}

async function insertEvent(params: {
  challengeId: string;
  type: string;
  actorUserId?: string | null;
  body: string;
  payload?: any;
}) {
  const { error } = await supabase.from("challenge_events").insert({
    challenge_id: params.challengeId,
    type: params.type,
    actor_user_id: params.actorUserId ?? null,
    body: params.body,
    payload: params.payload ?? {},
  });
  if (error) console.warn("[egameVerification] insertEvent:", error.message);
}

/** Trust score 0–100; lower = more disputes on record. */
export async function getUserMatchTrustScore(userId: string): Promise<number> {
  if (!userId) return 50;

  const { data } = await supabase
    .from("profiles")
    .select("match_dispute_count")
    .eq("id", userId)
    .maybeSingle();

  const disputes = Number((data as any)?.match_dispute_count ?? 0);
  return Math.max(0, Math.min(100, 100 - disputes * 25));
}

export type EgameProofRequirement = {
  required: boolean;
  reasons: string[];
};

/** Proof required for paid/pot, crown context, or low-trust players. */
export async function getEgameProofRequirement(params: {
  entryFeeCents?: number | null;
  winRewardCents?: number | null;
  leagueId?: string | null;
  reporterUserId: string;
  opponentUserId: string;
}): Promise<EgameProofRequirement> {
  const reasons: string[] = [];
  const entry = Number(params.entryFeeCents ?? 0);
  const reward = Number(params.winRewardCents ?? 0);

  if (entry > 0 || reward > 0) reasons.push("money_on_the_line");
  if (params.leagueId) reasons.push("crown_or_league");

  const [reporterTrust, opponentTrust] = await Promise.all([
    getUserMatchTrustScore(params.reporterUserId),
    getUserMatchTrustScore(params.opponentUserId),
  ]);

  if (reporterTrust < MATCH_TRUST_THRESHOLD) reasons.push("reporter_low_trust");
  if (opponentTrust < MATCH_TRUST_THRESHOLD) reasons.push("opponent_low_trust");

  return { required: reasons.length > 0, reasons };
}

async function bumpDisputeCount(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("match_dispute_count")
    .eq("id", userId)
    .maybeSingle();

  const current = Number((data as any)?.match_dispute_count ?? 0);
  await supabase
    .from("profiles")
    .update({ match_dispute_count: current + 1 })
    .eq("id", userId);
}

async function ensureConfirmPrompt(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
  loserId: string;
  gameType: string | null;
  confirmBy: string;
}) {
  const { challengeId, creatorId, opponentId, loserId, gameType, confirmBy } = params;
  const threadId = await ensureThreadForUsers(creatorId, opponentId);
  const game = threadGameTitle(gameType);

  const promptId = buildPromptId({
    promptType: "prompt_confirm_result",
    challengeId,
    turnKey: loserId,
  });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_confirm_result",
    promptId,
    label: `${game} — Confirm result?`,
    challengeId,
    targetUserId: loserId,
    yesText: "Confirm",
    noText: "Dispute",
    payload: {
      title: `${game} — Confirm result?`,
      subtitle: `Opponent reported a winner. Confirm or dispute within ${EGAME_CONFIRM_HOURS}h.`,
      game_type: gameType,
      confirm_by: confirmBy,
    },
  });
}

async function completeEgameChallenge(params: {
  challenge: ChallengeRow & { pending_winner_user_id?: string | null };
  winnerUserId: string | null;
  actorUserId: string;
  creatorId: string;
  opponentId: string;
  completionLabel: string;
  autoConfirmed?: boolean;
}) {
  const { challenge, winnerUserId, actorUserId, creatorId, opponentId, completionLabel, autoConfirmed } = params;
  const doneISO = nowIso();

  const { error: completeErr } = await supabase
    .from("challenges")
    .update({
      status: "completed",
      winner_user_id: winnerUserId,
      completed_at: doneISO,
      updated_at: doneISO,
      expires_at: null,
      pending_winner_user_id: null,
      result_confirm_by: null,
    })
    .eq("id", challenge.id)
    .in("status", ["awaiting_confirmation", "in-progress", "accepted", "disputed"]);

  if (completeErr) throw new Error(completeErr.message);

  await insertEvent({
    challengeId: challenge.id,
    type: "completed",
    actorUserId,
    body: completionLabel,
    payload: { winner_user_id: winnerUserId, auto_confirmed: autoConfirmed ?? false },
  });

  await appendThreadEvent({
    userAId: creatorId,
    userBId: opponentId,
    senderId: null,
    type: "challenge_completed",
    label: completionLabel,
    challengeId: challenge.id,
    payload: { winner_user_id: winnerUserId, game_type: challenge.game_type, auto_confirmed: autoConfirmed ?? false },
  });

  await settleChallenge({ challengeId: challenge.id, actorUserId });

  void notifyWinnerIfLeaderboardQualifies({
    winnerUserId,
    gameType: challenge.game_type,
    challengeId: challenge.id,
  });

  if (String(challenge.kind ?? "") === "in_person") {
    void import("./visionLeaderboardSync").then(({ syncInPersonVisionToLeaderboard }) =>
      syncInPersonVisionToLeaderboard({
        challengeId: challenge.id,
        winnerUserId: winnerUserId ?? null,
        gameType: challenge.game_type ?? null,
      }).catch(() => {})
    );
  }
}

/** Winner reports result. Proof optional unless tier rules require it. */
export async function reportEgameWinner(params: {
  challengeId: string;
  reporterUserId: string;
  winnerUserId: string | null;
  proofMediaPath?: string | null;
}): Promise<void> {
  const { challengeId, reporterUserId, winnerUserId, proofMediaPath } = params;
  if (!challengeId || !reporterUserId) throw new Error("Missing challenge or user.");

  const challenge = await loadChallenge(challengeId);
  if ((challenge.kind ?? "") !== "egame") throw new Error("Not an e-game challenge.");
  if (challenge.status === "completed" || challenge.status === "cancelled") return;
  if (challenge.status === "awaiting_confirmation") throw new Error("Result already reported — waiting on opponent.");

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator");
  const opponent = ps.find((p) => p.role === "opponent");
  if (!creator || !opponent) throw new Error("Both players must join first.");

  const isParticipant = creator.user_id === reporterUserId || opponent.user_id === reporterUserId;
  if (!isParticipant) throw new Error("Only participants can report results.");

  const loserId = creator.user_id === reporterUserId ? opponent.user_id : creator.user_id;

  const proofReq = await getEgameProofRequirement({
    entryFeeCents: challenge.entry_fee_cents,
    winRewardCents: challenge.win_reward_cents,
    leagueId: (challenge as any).league_id,
    reporterUserId,
    opponentUserId: loserId,
  });

  if (proofReq.required && !proofMediaPath?.trim()) {
    throw new Error("Proof required for this match — upload a screenshot or clip.");
  }

  const reportedAt = nowIso();
  const confirmBy = hoursFromNowIso(EGAME_CONFIRM_HOURS);

  const { error: upErr } = await supabase
    .from("challenges")
    .update({
      status: "awaiting_confirmation",
      pending_winner_user_id: winnerUserId,
      result_reported_by: reporterUserId,
      result_reported_at: reportedAt,
      result_confirm_by: confirmBy,
      result_proof_path: proofMediaPath?.trim() || null,
      updated_at: reportedAt,
    })
    .eq("id", challengeId)
    .in("status", ["accepted", "in-progress"]);

  if (upErr) throw new Error(upErr.message);

  await supabase
    .from("challenge_players")
    .update({ submitted: true, reported_winner_user_id: winnerUserId })
    .eq("challenge_id", challengeId)
    .eq("user_id", reporterUserId);

  const game = threadGameTitle(challenge.game_type);
  const proofNote = proofMediaPath ? " Proof attached." : "";
  const label = `${game} — Winner reported.${proofNote} Opponent has ${EGAME_CONFIRM_HOURS}h to confirm.`;

  await insertEvent({
    challengeId,
    type: "result_reported",
    actorUserId: reporterUserId,
    body: label,
    payload: { winner_user_id: winnerUserId, proof_path: proofMediaPath ?? null, confirm_by: confirmBy },
  });

  await appendThreadEvent({
    userAId: creator.user_id,
    userBId: opponent.user_id,
    senderId: null,
    type: "result_reported",
    label,
    challengeId,
    payload: {
      winner_user_id: winnerUserId,
      proof_path: proofMediaPath ?? null,
      confirm_by: confirmBy,
      game_type: challenge.game_type,
    },
  });

  await ensureConfirmPrompt({
    challengeId,
    creatorId: creator.user_id,
    opponentId: opponent.user_id,
    loserId,
    gameType: challenge.game_type ?? null,
    confirmBy,
  });

  try {
    const { notifyUser } = await import("./notifications");
    await notifyUser({
      targetUserId: loserId,
      type: "score_submitted",
      title: "Confirm match result",
      body: `Your opponent reported a winner in ${game}. Confirm or dispute.`,
      link: `/matches/thread/${await ensureThreadForUsers(creator.user_id, opponent.user_id)}`,
    });
  } catch {
    /* optional */
  }
}

/** Loser confirms the reported result. */
export async function confirmEgameResult(params: {
  challengeId: string;
  userId: string;
  promptMessageId?: string | null;
}): Promise<void> {
  const { challengeId, userId, promptMessageId } = params;

  const challenge = await loadChallenge(challengeId);
  if (challenge.status !== "awaiting_confirmation") {
    await tryAutoConfirmEgameResult(challengeId);
    const latest = await loadChallenge(challengeId);
    if (latest.status === "completed") return;
    throw new Error("No result pending confirmation.");
  }

  if (challenge.result_reported_by === userId) {
    throw new Error("Reporter cannot confirm their own result.");
  }

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator");
  const opponent = ps.find((p) => p.role === "opponent");
  if (!creator || !opponent) throw new Error("Challenge not ready.");

  const winnerUserId = challenge.pending_winner_user_id ?? null;
  const reward = Number(challenge.win_reward_cents ?? 0);
  const game = threadGameTitle(challenge.game_type);
  const completedLabel =
    winnerUserId == null
      ? `${game} — Match completed (tie).`
      : reward > 0
        ? `${game} — Result confirmed (+$${(reward / 100).toFixed(2)}).`
        : `${game} — Result confirmed.`;

  await completeEgameChallenge({
    challenge,
    winnerUserId,
    actorUserId: userId,
    creatorId: creator.user_id,
    opponentId: opponent.user_id,
    completionLabel: completedLabel,
  });

  if (promptMessageId) {
    await resolveThreadPrompt({
      messageId: promptMessageId,
      resolverUserId: userId,
      resolution: "yes",
      resolutionLabel: "Confirmed.",
    });
  }
}

/** Loser disputes the reported result. */
export async function disputeEgameResult(params: {
  challengeId: string;
  userId: string;
  promptMessageId?: string | null;
}): Promise<void> {
  const { challengeId, userId, promptMessageId } = params;

  const challenge = await loadChallenge(challengeId);
  if (challenge.status !== "awaiting_confirmation") throw new Error("Nothing to dispute.");

  if (challenge.result_reported_by === userId) {
    throw new Error("Reporter cannot dispute their own report.");
  }

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator");
  const opponent = ps.find((p) => p.role === "opponent");
  if (!creator || !opponent) throw new Error("Challenge not ready.");

  const nowISO = nowIso();
  const game = threadGameTitle(challenge.game_type);

  const { error } = await supabase
    .from("challenges")
    .update({ status: "disputed", updated_at: nowISO })
    .eq("id", challengeId)
    .eq("status", "awaiting_confirmation");

  if (error) throw new Error(error.message);

  const reporterId = challenge.result_reported_by ?? null;
  if (reporterId) await bumpDisputeCount(reporterId);
  await bumpDisputeCount(userId);

  const label = `${game} — Disputed. Admin review may be needed.`;

  await insertEvent({
    challengeId,
    type: "disputed",
    actorUserId: userId,
    body: label,
    payload: {
      reported_winner: challenge.pending_winner_user_id,
      proof_path: challenge.result_proof_path ?? null,
    },
  });

  await appendThreadEvent({
    userAId: creator.user_id,
    userBId: opponent.user_id,
    senderId: null,
    type: "disputed",
    label,
    challengeId,
    payload: { game_type: challenge.game_type },
  });

  if (promptMessageId) {
    await resolveThreadPrompt({
      messageId: promptMessageId,
      resolverUserId: userId,
      resolution: "no",
      resolutionLabel: "Disputed.",
    });
  }
}

/** Auto-confirm if confirmation deadline passed with no dispute. */
export async function tryAutoConfirmEgameResult(challengeId: string): Promise<boolean> {
  let challenge: Awaited<ReturnType<typeof loadChallenge>>;
  try {
    challenge = await loadChallenge(challengeId);
  } catch {
    return false;
  }

  if (challenge.status !== "awaiting_confirmation") return challenge.status === "completed";
  if (!challenge.result_confirm_by) return false;

  const deadline = new Date(challenge.result_confirm_by).getTime();
  if (Date.now() < deadline) return false;

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator");
  const opponent = ps.find((p) => p.role === "opponent");
  if (!creator || !opponent) return false;

  const winnerUserId = challenge.pending_winner_user_id ?? null;
  const game = threadGameTitle(challenge.game_type);
  const reward = Number(challenge.win_reward_cents ?? 0);
  const completedLabel =
    winnerUserId == null
      ? `${game} — Auto-confirmed (tie).`
      : reward > 0
        ? `${game} — Auto-confirmed after ${EGAME_CONFIRM_HOURS}h (+$${(reward / 100).toFixed(2)}).`
        : `${game} — Auto-confirmed after ${EGAME_CONFIRM_HOURS}h.`;

  await completeEgameChallenge({
    challenge,
    winnerUserId,
    actorUserId: challenge.result_reported_by ?? creator.user_id,
    creatorId: creator.user_id,
    opponentId: opponent.user_id,
    completionLabel: completedLabel,
    autoConfirmed: true,
  });

  return true;
}
