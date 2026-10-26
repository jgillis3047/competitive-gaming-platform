// lib/backend/threadActionDispatcher.ts
import { checkInToInPersonChallenge } from "./challengeActions";
import { respondToRematchOffer } from "./rematchActions";
import { appendThreadEvent, appendThreadSystemMessage, resolveThreadPrompt } from "./threadActions";

export type PromptResolution = "yes" | "no" | "dismiss";

export type DispatchPromptParams = {
  messageId: string;
  threadId: string;
  promptType: string; // e.g. "prompt_check_in"
  payload?: any;

  resolverUserId: string;
  opponentId?: string | null;
  challengeId?: string | null;

  resolution: PromptResolution;
  resolutionLabel?: string;
};

function cleanLabel(x: any, fallback: string) {
  const s = String(x ?? "").trim();
  return s.length ? s : fallback;
}

export async function dispatchThreadPromptAction(params: DispatchPromptParams): Promise<void> {
  const { messageId, threadId, promptType, payload, resolverUserId, opponentId, challengeId, resolution, resolutionLabel } = params;

  const pt = String(promptType ?? "").toLowerCase();
  const rid = String(resolverUserId ?? "").trim();
  const tid = String(threadId ?? "").trim();
  const mid = String(messageId ?? "").trim();

  if (!tid || !mid || !rid) throw new Error("dispatchThreadPromptAction missing ids.");

  const finalize = async (label: string, res: PromptResolution = resolution) => {
    await resolveThreadPrompt({
      messageId: mid,
      resolverUserId: rid,
      resolution: res,
      resolutionLabel: cleanLabel(label, "Done."),
    });
  };

  // NO / DISMISS: resolve + optional tiny system message
  if (resolution !== "yes") {
    const label =
      resolutionLabel ??
      (resolution === "no" ? "Declined." : "Dismissed.");

    await finalize(label, resolution);

    await appendThreadSystemMessage({
      threadId: tid,
      label: cleanLabel(label, "Done."),
      challengeId: challengeId ?? null,
      payload: { prompt_type: pt, resolver_user_id: rid },
    });

    return;
  }

  // YES path
  try {
    // -------- CHECK IN --------
    if (pt === "prompt_check_in") {
      if (!challengeId) throw new Error("prompt_check_in missing challengeId.");

      await checkInToInPersonChallenge({ challengeId: String(challengeId), userId: rid });

      await finalize("Checked in.", "yes");

      await appendThreadEvent({
        threadId: tid,
        senderId: rid,
        type: "check_in",
        label: "✅ Checked in.",
        challengeId: String(challengeId),
        payload: { prompt_type: pt },
      });

      return;
    }

    // -------- SUBMIT RESULT (UI handles modal) --------
    if (pt === "prompt_submit_result") {
      await finalize("Opening submit flow.", "yes");

      await appendThreadSystemMessage({
        threadId: tid,
        label: "Submit your result when finished.",
        challengeId: challengeId ?? null,
        payload: { prompt_type: pt, resolver_user_id: rid },
      });

      return;
    }

    // -------- PLAY TURN (UI navigates) --------
    if (pt === "prompt_play_turn") {
      await finalize("Opening game.", "yes");

      await appendThreadSystemMessage({
        threadId: tid,
        label: "Your turn — play now.",
        challengeId: challengeId ?? null,
        payload: { prompt_type: pt, resolver_user_id: rid },
      });

      return;
    }

    // -------- REMATCH --------
    if (pt === "prompt_accept_rematch") {
      const offerId =
        payload?.rematch_offer_id ??
        payload?.rematchOfferId ??
        null;

      if (!offerId) throw new Error("prompt_accept_rematch missing offer id.");

      // This uses your RPC flow inside rematchActions now (best practice)
      const { acceptedChallengeId } = await respondToRematchOffer({
        offerId: String(offerId),
        responderId: rid,
        accept: true,
      });

      await finalize("Accepted.", "yes");

      await appendThreadSystemMessage({
        threadId: tid,
        label: "✅ Rematch accepted. New challenge created.",
        challengeId: acceptedChallengeId ?? challengeId ?? null,
        payload: { prompt_type: pt, resolver_user_id: rid, rematch_offer_id: String(offerId), new_challenge_id: acceptedChallengeId ?? null },
      });

      return;
    }

    // Unknown prompt
    await finalize("Done.", "yes");
  } catch (e: any) {
    const msg = cleanLabel(e?.message, "Action failed.");

    // Resolve as dismissed so it can’t be spam tapped forever
    await finalize(msg, "dismiss");

    await appendThreadSystemMessage({
      threadId: tid,
      label: `Action failed: ${msg}`,
      challengeId: challengeId ?? null,
      payload: { prompt_type: pt, resolver_user_id: rid, error: msg },
    });

    throw e;
  }
}
