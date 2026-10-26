// lib/backend/rematchActions.ts
import { supabase } from "./supabaseClient";
import {
    appendThreadPrompt,
    appendThreadSystemMessage,
    buildPromptId,
    getOrCreateThreadByUsers,
    resolveThreadPromptByPromptId,
    upsertThreadPreview,
} from "./threadActions";

/**
 * DB table: rematch_offers
 * columns:
 * id, thread_id, from_user_id, to_user_id, source_challenge_id,
 * proposed_game_key, proposed_entry_fee, proposed_prize, status,
 * created_at, responded_at
 *
 * Flow:
 * - createRematchOffer(): inserts offer row, then inserts an in-thread prompt (targeted to to_user_id)
 * - respondToRematchOffer(): calls ONE RPC respond_to_rematch_offer(), resolves prompt, posts a system message
 *
 * RPC (SECURITY DEFINER):
 * respond_to_rematch_offer(p_offer_id uuid, p_responder_id uuid, p_accept boolean) returns uuid
 */

export async function createRematchOffer(params: {
  threadId: string;
  sourceChallengeId: string;
  fromUserId: string;
  toUserId: string;

  // optional overrides (defaults come from source challenge if available)
  proposedGameKey?: string | null;
  proposedEntryFee?: number | null;
  proposedPrize?: number | null;
}): Promise<{ offerId: string }> {
  const threadId = String(params.threadId ?? "").trim();
  const sourceChallengeId = String(params.sourceChallengeId ?? "").trim();
  const fromUserId = String(params.fromUserId ?? "").trim();
  const toUserId = String(params.toUserId ?? "").trim();

  if (!threadId || !sourceChallengeId || !fromUserId || !toUserId) {
    throw new Error("createRematchOffer missing required fields.");
  }

  // Pull source challenge for defaults if caller didn't pass overrides
  const { data: base, error: baseErr } = await supabase
    .from("challenges")
    .select("id,game_type,entry_fee_cents,win_reward_cents")
    .eq("id", sourceChallengeId)
    .maybeSingle();

  if (baseErr) throw new Error(baseErr.message);

  const proposed_game_key = params.proposedGameKey ?? (base as any)?.game_type ?? null;
  const proposed_entry_fee = params.proposedEntryFee ?? (base as any)?.entry_fee_cents ?? null;
  const proposed_prize = params.proposedPrize ?? (base as any)?.win_reward_cents ?? null;

  // 1) Create offer row
  const { data: offer, error: offErr } = await supabase
    .from("rematch_offers")
    .insert({
      thread_id: threadId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      source_challenge_id: sourceChallengeId,
      proposed_game_key,
      proposed_entry_fee,
      proposed_prize,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (offErr) throw new Error(offErr.message);

  const offerId = String((offer as any)?.id ?? "").trim();
  if (!offerId) throw new Error("Failed to create rematch offer.");

  // 2) Insert prompt message into thread_messages (idempotent via appendThreadPrompt)
  const promptId = buildPromptId({
    promptType: "prompt_accept_rematch",
    challengeId: sourceChallengeId,
    turnKey: offerId, // unique per offer
  });

  await appendThreadPrompt({
    threadId,
    promptType: "prompt_accept_rematch",
    promptId,
    label: "Rematch offer",
    challengeId: sourceChallengeId,
    targetUserId: toUserId,
    yesText: "Accept",
    noText: "Decline",
    rematchOfferId: offerId,
    payload: {
      title: "Rematch?",
      subtitle: proposed_game_key
        ? `Play ${proposed_game_key} again? Same stakes as last match.`
        : "Your opponent wants to play again.",
      proposed: {
        proposed_game_key,
        proposed_entry_fee,
        proposed_prize,
      },
    },
  });

  // 3) Preview
  await upsertThreadPreview(threadId, "Rematch offer — waiting for reply.");

  return { offerId };
}

/** Send a rematch prompt in the private thread with the opponent (from a completed challenge). */
export async function sendRematchOfferFromChallenge(params: {
  fromUserId: string;
  toUserId: string;
  sourceChallengeId: string;
}): Promise<{ threadId: string; offerId: string }> {
  const fromUserId = String(params.fromUserId ?? "").trim();
  const toUserId = String(params.toUserId ?? "").trim();
  const sourceChallengeId = String(params.sourceChallengeId ?? "").trim();

  if (!fromUserId || !toUserId || !sourceChallengeId) {
    throw new Error("Missing user or challenge for rematch.");
  }
  if (fromUserId === toUserId) {
    throw new Error("Cannot rematch yourself.");
  }

  const threadId = await getOrCreateThreadByUsers(fromUserId, toUserId);
  const { offerId } = await createRematchOffer({
    threadId,
    sourceChallengeId,
    fromUserId,
    toUserId,
  });

  return { threadId, offerId };
}

export async function respondToRematchOffer(params: {
  offerId: string;
  responderId: string; // who clicked accept/decline
  accept: boolean;
}): Promise<{ acceptedChallengeId?: string }> {
  const offerId = String(params.offerId ?? "").trim();
  const responderId = String(params.responderId ?? "").trim();
  const accept = Boolean(params.accept);

  if (!offerId || !responderId) throw new Error("respondToRematchOffer missing ids.");

  // Read offer for thread_id + source_challenge_id (so we can resolve prompt + update preview)
  const { data: offer, error: readErr } = await supabase
    .from("rematch_offers")
    .select("id,thread_id,source_challenge_id,to_user_id,status")
    .eq("id", offerId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  if (!offer) throw new Error("Rematch offer not found.");

  const threadId = String((offer as any).thread_id ?? "").trim();
  const sourceChallengeId = String((offer as any).source_challenge_id ?? "").trim();
  const toUserId = String((offer as any).to_user_id ?? "").trim();

  if (!threadId || !sourceChallengeId) throw new Error("Rematch offer missing thread/source challenge.");

  // Client-side guard (server should enforce too)
  if (toUserId && responderId !== toUserId) {
    throw new Error("Only the invited opponent can respond to this rematch offer.");
  }

  // ✅ ONE RPC does everything (validate, lock offer, update status, create challenge/players if accepted)
  const { data: newChallengeId, error: rpcErr } = await supabase.rpc("respond_to_rematch_offer", {
    p_offer_id: offerId,
    p_responder_id: responderId,
    p_accept: accept,
  });

  if (rpcErr) throw new Error(rpcErr.message);

  // Resolve prompt so buttons disappear (best-effort)
  const promptId = buildPromptId({
    promptType: "prompt_accept_rematch",
    challengeId: sourceChallengeId,
    turnKey: offerId,
  });

  await resolveThreadPromptByPromptId({
    threadId,
    promptId,
    resolverUserId: responderId,
    resolution: accept ? "yes" : "no",
    resolutionLabel: accept ? "Accepted." : "Declined.",
  });

  // Add a clean system message (best-effort)
  const systemLabel = accept
    ? "✅ Rematch accepted. New challenge created."
    : "❌ Rematch declined.";

  await appendThreadSystemMessage({
    threadId,
    label: systemLabel,
    challengeId: newChallengeId ? String(newChallengeId) : sourceChallengeId,
    payload: { rematch_offer_id: offerId },
  });

  // Preview
  await upsertThreadPreview(threadId, accept ? "✅ Rematch accepted." : "❌ Rematch declined.");

  return {
    acceptedChallengeId: newChallengeId ? String(newChallengeId) : undefined,
  };
}
