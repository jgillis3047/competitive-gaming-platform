// lib/backend/matchVerification.ts
// Unified match result reporting with proof bundles + AI review (egame + in-person)

import {
  EGAME_CONFIRM_HOURS,
  getEgameProofRequirement,
} from "./egameVerification";
import { insertMatchProofs, runAiMatchReview, type ProofUploadItem } from "./matchProof";
import { supabase } from "./supabaseClient";
import { appendThreadEvent, appendThreadPrompt, buildPromptId } from "./threadActions";
import type { ChallengeKind } from "../models/challengeTypes";
import { resolveInPersonVisionProfile } from "../data/inPersonVisionConfig";
import { inferSportKey } from "../models/visionTypes";

export { confirmEgameResult, disputeEgameResult, tryAutoConfirmEgameResult } from "./egameVerification";
export { getEgameProofRequirement, EGAME_CONFIRM_HOURS };

type ChallengePlayerRow = {
  user_id: string;
  role: "creator" | "opponent";
  checked_in_at?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function hoursFromNowIso(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

async function loadChallenge(challengeId: string) {
  const { data, error } = await supabase
    .from("challenges")
    .select(
      `id, title, game_type, status, kind, entry_fee_cents, win_reward_cents,
       created_by, winner_user_id, league_id,
       pending_winner_user_id, result_reported_by, result_reported_at,
       result_confirm_by, result_proof_path`
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
    .select("user_id, role, checked_in_at")
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
  await supabase.from("challenge_events").insert({
    challenge_id: params.challengeId,
    type: params.type,
    actor_user_id: params.actorUserId ?? null,
    body: params.body,
    payload: params.payload ?? {},
  });
}

async function ensureConfirmPrompt(params: {
  challengeId: string;
  creatorId: string;
  opponentId: string;
  loserId: string;
  gameType: string | null;
  confirmBy: string;
  aiSummary?: string | null;
}) {
  const threadId = await ensureThreadForUsers(params.creatorId, params.opponentId);
  const game = params.gameType?.trim() || "Match";
  const aiNote = params.aiSummary ? ` ${params.aiSummary.slice(0, 80)}` : "";

  const promptId = buildPromptId({
    promptType: "prompt_confirm_result",
    challengeId: params.challengeId,
    turnKey: params.loserId,
  });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_confirm_result",
    promptId,
    label: `${game} — Confirm result?${aiNote}`,
    challengeId: params.challengeId,
    targetUserId: params.loserId,
    yesText: "Confirm",
    noText: "Dispute",
    payload: {
      title: `${game} — Confirm result?`,
      subtitle: `Opponent reported a winner. Confirm or dispute within ${EGAME_CONFIRM_HOURS}h.`,
      game_type: params.gameType,
      confirm_by: params.confirmBy,
      ai_summary: params.aiSummary ?? null,
    },
  });
}

/** Report winner with optional proof bundle + AI review. Works for egame and in_person. */
export async function reportMatchWinner(params: {
  challengeId: string;
  reporterUserId: string;
  winnerUserId: string | null;
  reportedScore?: string | null;
  proofMediaPath?: string | null;
  proofBundle?: ProofUploadItem[];
}): Promise<{ aiReviewId?: string; aiSummary?: string | null }> {
  const { challengeId, reporterUserId, winnerUserId, reportedScore, proofMediaPath, proofBundle } =
    params;
  if (!challengeId || !reporterUserId) throw new Error("Missing challenge or user.");

  const challenge = await loadChallenge(challengeId);
  const kind = String(challenge.kind ?? "") as ChallengeKind;
  if (!["egame", "in_person"].includes(kind)) {
    throw new Error("AI proof review is for e-game and in-person matches.");
  }
  if (challenge.status === "completed" || challenge.status === "cancelled") return {};
  if (challenge.status === "awaiting_confirmation") {
    throw new Error("Result already reported — waiting on opponent.");
  }

  const ps = await loadPlayers(challengeId);
  const creator = ps.find((p) => p.role === "creator");
  const opponent = ps.find((p) => p.role === "opponent");
  if (!creator || !opponent) throw new Error("Both players must join first.");

  const isParticipant =
    creator.user_id === reporterUserId || opponent.user_id === reporterUserId;
  if (!isParticipant) throw new Error("Only participants can report results.");

  const loserId = creator.user_id === reporterUserId ? opponent.user_id : creator.user_id;
  const visionProfile = kind === "in_person" ? resolveInPersonVisionProfile(challenge.game_type) : null;
  const sportKey = visionProfile?.sportKey ?? inferSportKey(challenge.game_type);

  const bundleItems = proofBundle ?? [];
  const hasProof = Boolean(proofMediaPath?.trim()) || bundleItems.length > 0;

  if (kind === "in_person") {
    const bothCheckedIn = Boolean(creator.checked_in_at) && Boolean(opponent.checked_in_at);
    if (!bothCheckedIn) {
      throw new Error("Both players must check in before reporting results.");
    }
    if (challenge.status !== "checked-in" && challenge.status !== "accepted") {
      /* allow report once both checked in even if status lagging */
    }
  }

  const proofReq = await getEgameProofRequirement({
    entryFeeCents: challenge.entry_fee_cents,
    winRewardCents: challenge.win_reward_cents,
    leagueId: challenge.league_id,
    reporterUserId,
    opponentUserId: loserId,
  });

  const proofMandatory =
    kind === "in_person" ? (visionProfile?.proofRequired ?? true) : proofReq.required;

  if (proofMandatory && !hasProof) {
    throw new Error(
      visionProfile?.proofHint ?? "Proof required — upload a clip, photo, or scorecard."
    );
  }

  const primaryProofPath = proofMediaPath?.trim() || bundleItems[0]?.storagePath || null;
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
      result_proof_path: primaryProofPath,
      updated_at: reportedAt,
    })
    .eq("id", challengeId)
    .in("status", ["accepted", "in-progress", "checked-in"]);

  if (upErr) throw new Error(upErr.message);

  await supabase
    .from("challenge_players")
    .update({ submitted: true, reported_winner_user_id: winnerUserId })
    .eq("challenge_id", challengeId)
    .eq("user_id", reporterUserId);

  if (bundleItems.length > 0) {
    await insertMatchProofs({
      challengeId,
      uploadedBy: reporterUserId,
      sportKey,
      items: bundleItems,
    });
  }

  let aiSummary: string | null = null;
  let aiReviewId: string | undefined;

  const allProofPaths = [
    ...bundleItems.map((b) => b.storagePath),
    ...(primaryProofPath && !bundleItems.some((b) => b.storagePath === primaryProofPath)
      ? [primaryProofPath]
      : []),
  ];

  if (allProofPaths.length > 0) {
    try {
      const review = await runAiMatchReview({
        challengeId,
        gameType: challenge.game_type,
        reportedScore: reportedScore ?? null,
        proofStoragePaths: allProofPaths,
        challengeKind: kind === "in_person" ? "in_person" : "egame",
        reporterUserId,
        primaryProofType: bundleItems[0]?.proofType ?? (primaryProofPath ? "video" : null),
      });
      aiSummary = review.summary;
      aiReviewId = review.id;
    } catch {
      aiSummary = "AI review pending — opponent confirmation still required.";
    }
  }

  const game =
    String(challenge.game_type ?? "").trim() || (kind === "in_person" ? "In-person" : "E-game");
  const proofNote = hasProof ? " Proof attached." : "";
  const aiNote = aiSummary ? ` AI: ${aiSummary.slice(0, 120)}` : "";
  const label = `${game} — Winner reported.${proofNote}${aiNote} Opponent has ${EGAME_CONFIRM_HOURS}h to confirm.`;

  await insertEvent({
    challengeId,
    type: "result_reported",
    actorUserId: reporterUserId,
    body: label,
    payload: {
      winner_user_id: winnerUserId,
      proof_path: primaryProofPath,
      proof_count: allProofPaths.length,
      ai_summary: aiSummary,
      confirm_by: confirmBy,
    },
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
      proof_path: primaryProofPath,
      ai_summary: aiSummary,
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
    aiSummary,
  });

  try {
    const { notifyUser } = await import("./notifications");
    await notifyUser({
      targetUserId: loserId,
      type: "challenge_win",
      title: "Confirm match result",
      body: `Your opponent reported a winner in ${game}. Confirm or dispute.`,
      link: `/matches/thread/${await ensureThreadForUsers(creator.user_id, opponent.user_id)}`,
    });
  } catch {
    /* optional */
  }

  return { aiReviewId, aiSummary };
}
