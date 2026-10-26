import { ChallengeRow } from "../models/challengeTypes";

export type ChallengeUiAction =
  | "join"
  | "play"
  | "submit_score"
  | "check_in"
  | "submit_result"
  | "view_results"
  | "rematch"
  | "none";

type Params = {
  challenge: ChallengeRow;
  meId: string | null;
  creatorId: string | null;
  opponentId: string | null;
  playerState?: {
    meSubmitted?: boolean;
    meCheckedIn?: boolean;
    oppCheckedIn?: boolean;
    bothCheckedIn?: boolean;
  };
};

/**
 * Centralized UI Action Resolver
 * Used by BOTH Challenge Screen + Thread Screen
 */
export function getChallengeUiActions(params: Params): ChallengeUiAction[] {
  const {
    challenge,
    meId,
    creatorId,
    opponentId,
    playerState,
  } = params;

  if (!challenge || !meId) return ["none"];

  const status = String(challenge.status ?? "").toLowerCase();
  const kind = String(challenge.kind ?? "phone").toLowerCase();

  const isCreator = creatorId === meId;
  const isOpponent = opponentId === meId;
  const isParticipant = isCreator || isOpponent;

  // 🔒 Non-participants should only ever see Join (if open)
  if (!isParticipant) {
    if (status === "open") return ["join"];
    return ["none"];
  }

  // =========================================================
  // 🔥 IN-PERSON FLOW
  // =========================================================
  if (kind === "in_person") {
    if (status === "accepted") {
      if (!playerState?.meCheckedIn) {
        return ["check_in"];
      }
      return ["none"];
    }

    if (status === "checked-in") {
      if (playerState?.bothCheckedIn && !playerState?.meSubmitted) {
        return ["submit_result"];
      }
      return ["none"];
    }

    if (status === "completed") {
      return ["view_results", "rematch"];
    }

    return ["none"];
  }

  // =========================================================
  // 📱 PHONE / SCORE BASED
  // =========================================================
  if (status === "accepted" || status === "in-progress") {
    if (!playerState?.meSubmitted) {
      return ["submit_score"];
    }

    return ["none"];
  }

  if (status === "completed") {
    return ["view_results", "rematch"];
  }

  return ["none"];
}
