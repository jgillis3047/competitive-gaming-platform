import { isOneAttemptGameType, isTurnBasedGameType } from "../data/gameConfig";
import type { ChallengeRow } from "../models/challengeTypes";
import { gameTitleForThread } from "./threadMessageDisplay";

export type ChallengeBucket = "needs_action" | "waiting" | "completed" | "pending";

export type PlayerState = {
  meCheckedIn: boolean;
  oppCheckedIn: boolean;
  bothCheckedIn: boolean;
  meSubmitted: boolean;
  oppSubmitted: boolean;
};

export type ChallengeActionState = {
  bucket: ChallengeBucket;
  statusLabel: string;
  pillLabel: string;
  ctaLabel: string | null;
  ctaKind: "primary" | "secondary" | null;
  isActive: boolean;
};

function normalizeKind(raw: unknown): string {
  const k = String(raw ?? "").toLowerCase();
  if (k === "in_person" || k === "in-person" || k === "inperson") return "in_person";
  return k;
}

export function normalizeChallengeStatus(raw?: string | null): string {
  return String(raw ?? "").toLowerCase().replace(/_/g, "-");
}

export function isTerminalChallenge(ch?: ChallengeRow | null): boolean {
  const status = normalizeChallengeStatus(ch?.status);
  // Only use challenge status — settlement flags alone must not hide live games
  return status === "completed" || status === "cancelled" || status === "disputed";
}

export function isActiveChallenge(ch?: ChallengeRow | null): boolean {
  if (!ch) return false;
  if (isTerminalChallenge(ch)) return false;
  const status = normalizeChallengeStatus(ch.status);
  return status !== "open";
}

/** Show in Needs Action tab — Play, Resume, Join, Check In, etc. */
export function isActionableState(action: ChallengeActionState): boolean {
  if (action.bucket === "needs_action") return true;
  if (action.ctaLabel) return true;
  return false;
}

export function isPlayableState(action: ChallengeActionState): boolean {
  return isActionableState(action) || Boolean(action.ctaLabel);
}

export function deriveChallengeActionState(params: {
  challenge: ChallengeRow;
  meId: string | null;
  playerState?: PlayerState | null;
  currentTurnUserId?: string | null;
  hasOpenPromptForMe?: boolean;
}): ChallengeActionState {
  const { challenge, meId, playerState: st, currentTurnUserId, hasOpenPromptForMe } = params;
  const gameTitle = gameTitleForThread(challenge.game_type ?? challenge.game_key);
  const status = normalizeChallengeStatus(challenge.status);
  const terminal = isTerminalChallenge(challenge);
  const kind = normalizeKind(challenge.kind);

  if (terminal || status === "completed") {
    return {
      bucket: "completed",
      statusLabel: "COMPLETED",
      pillLabel: `${gameTitle} done`,
      ctaLabel: "View Results",
      ctaKind: "secondary",
      isActive: false,
    };
  }

  if (status === "open") {
    const isPlayer = Boolean(st);
    const needsJoin = meId && !isPlayer;
    return {
      bucket: needsJoin ? "needs_action" : "waiting",
      statusLabel: needsJoin ? "JOIN" : "OPEN",
      pillLabel: needsJoin ? `${gameTitle} open` : `${gameTitle} waiting`,
      ctaLabel: needsJoin ? "Join" : null,
      ctaKind: needsJoin ? "primary" : null,
      isActive: true,
    };
  }

  if (hasOpenPromptForMe) {
    return {
      bucket: "needs_action",
      statusLabel: "YOUR TURN",
      pillLabel: `${gameTitle} action`,
      ctaLabel: "Respond",
      ctaKind: "primary",
      isActive: true,
    };
  }

  if (kind === "egame") {
    if (status === "disputed") {
      return {
        bucket: "waiting",
        statusLabel: "DISPUTED",
        pillLabel: `${gameTitle} disputed`,
        ctaLabel: null,
        ctaKind: null,
        isActive: true,
      };
    }
    if (status === "awaiting-confirmation") {
      const reportedBy = (challenge as any).result_reported_by ?? null;
      const iReported = Boolean(meId && reportedBy && String(reportedBy) === String(meId));
      if (iReported) {
        return {
          bucket: "waiting",
          statusLabel: "AWAITING",
          pillLabel: `${gameTitle} awaiting confirm`,
          ctaLabel: "View",
          ctaKind: "secondary",
          isActive: true,
        };
      }
      return {
        bucket: "needs_action",
        statusLabel: "CONFIRM",
        pillLabel: `${gameTitle} confirm result`,
        ctaLabel: "Confirm / Dispute",
        ctaKind: "primary",
        isActive: true,
      };
    }
    if (!st?.meSubmitted) {
      return {
        bucket: "needs_action",
        statusLabel: "REPORT",
        pillLabel: `${gameTitle} report winner`,
        ctaLabel: "Report Winner",
        ctaKind: "primary",
        isActive: true,
      };
    }
    return {
      bucket: "waiting",
      statusLabel: "WAITING",
      pillLabel: `${gameTitle} waiting`,
      ctaLabel: "View",
      ctaKind: "secondary",
      isActive: true,
    };
  }

  // Accepted or started — both players should see Play in Needs Action
  if (status === "accepted" || status === "in-progress") {
    const gameKey = String(challenge.game_type ?? challenge.game_key ?? "").toLowerCase();
    const turnBased = isTurnBasedGameType(gameKey);
    const oneAttempt = isOneAttemptGameType(gameKey);
    const isMyTurn = Boolean(currentTurnUserId && meId && String(currentTurnUserId) === String(meId));

    if (turnBased) {
      if (currentTurnUserId && !isMyTurn) {
        return {
          bucket: "waiting",
          statusLabel: "WAITING",
          pillLabel: `${gameTitle} waiting`,
          ctaLabel: "Resume",
          ctaKind: "secondary",
          isActive: true,
        };
      }
      return {
        bucket: "needs_action",
        statusLabel: isMyTurn ? "YOUR TURN" : "MATCH READY",
        pillLabel: isMyTurn ? `${gameTitle} your turn` : `${gameTitle} ready`,
        ctaLabel: "Play",
        ctaKind: "primary",
        isActive: true,
      };
    }

    if (oneAttempt && st?.meSubmitted) {
      return {
        bucket: "waiting",
        statusLabel: "WAITING",
        pillLabel: `${gameTitle} waiting`,
        ctaLabel: "Resume",
        ctaKind: "secondary",
        isActive: true,
      };
    }

    return {
      bucket: "needs_action",
      statusLabel: "MATCH READY",
      pillLabel: `${gameTitle} ready`,
      ctaLabel: "Play",
      ctaKind: "primary",
      isActive: true,
    };
  }

  if (kind === "in_person") {
    if (status === "disputed") {
      return {
        bucket: "waiting",
        statusLabel: "DISPUTED",
        pillLabel: `${gameTitle} disputed`,
        ctaLabel: null,
        ctaKind: null,
        isActive: true,
      };
    }
    if (!st?.meCheckedIn) {
      return {
        bucket: "needs_action",
        statusLabel: "CHECK IN",
        pillLabel: `${gameTitle} check-in`,
        ctaLabel: "Check In",
        ctaKind: "primary",
        isActive: true,
      };
    }
    if (st.bothCheckedIn && !st.meSubmitted) {
      return {
        bucket: "needs_action",
        statusLabel: "SUBMIT SCORE",
        pillLabel: `${gameTitle} submit`,
        ctaLabel: "Submit Score",
        ctaKind: "primary",
        isActive: true,
      };
    }
    if (st.meSubmitted && !st.oppSubmitted) {
      return {
        bucket: "waiting",
        statusLabel: "WAITING",
        pillLabel: `${gameTitle} waiting`,
        ctaLabel: "Resume",
        ctaKind: "secondary",
        isActive: true,
      };
    }
    return {
      bucket: "waiting",
      statusLabel: "ACTIVE",
      pillLabel: `${gameTitle} live`,
      ctaLabel: "Resume",
      ctaKind: "secondary",
      isActive: true,
    };
  }

  const gameKey = String(challenge.game_type ?? challenge.game_key ?? "").toLowerCase();
  const turnBased = isTurnBasedGameType(gameKey);
  const oneAttempt = isOneAttemptGameType(gameKey);
  const isMyTurn = Boolean(currentTurnUserId && meId && String(currentTurnUserId) === String(meId));

  if (turnBased) {
    if (!currentTurnUserId) {
      return {
        bucket: "needs_action",
        statusLabel: "MATCH READY",
        pillLabel: `${gameTitle} ready`,
        ctaLabel: "Play",
        ctaKind: "primary",
        isActive: true,
      };
    }
    if (isMyTurn) {
      return {
        bucket: "needs_action",
        statusLabel: "YOUR TURN",
        pillLabel: `${gameTitle} your turn`,
        ctaLabel: "Play",
        ctaKind: "primary",
        isActive: true,
      };
    }
    return {
      bucket: "waiting",
      statusLabel: "WAITING",
      pillLabel: `${gameTitle} waiting`,
      ctaLabel: "Resume",
      ctaKind: "secondary",
      isActive: true,
    };
  }

  if (oneAttempt && st?.meSubmitted) {
    return {
      bucket: "waiting",
      statusLabel: "WAITING",
      pillLabel: `${gameTitle} waiting`,
      ctaLabel: "Resume",
      ctaKind: "secondary",
      isActive: true,
    };
  }

  return {
    bucket: "needs_action",
    statusLabel: "ACTIVE",
    pillLabel: `${gameTitle} live`,
    ctaLabel: "Play",
    ctaKind: "primary",
    isActive: true,
  };
}

export function formatAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function isActionPromptType(typeRaw: string | null | undefined, payload?: any): boolean {
  const t = String(typeRaw ?? "").toLowerCase();
  if (t === "prompt") {
    const pid = String(payload?.prompt_id ?? payload?.promptId ?? "");
    if (!pid) return false;
    const prefix = pid.split(":")[0];
    return (
      prefix === "prompt_check_in" ||
      prefix === "prompt_submit_result" ||
      prefix === "prompt_accept_rematch" ||
      prefix === "prompt_play_turn" ||
      prefix === "prompt_confirm_result"
    );
  }
  return (
    t === "checkin_prompt" ||
    t === "submit_result_prompt" ||
    t === "rematch_offer" ||
    t === "turn_prompt" ||
    t === "prompt_check_in" ||
    t === "prompt_submit_result" ||
    t === "prompt_accept_rematch" ||
    t === "prompt_play_turn" ||
    t === "prompt_confirm_result"
  );
}

export function previewFromMessage(m?: { type?: string | null; payload?: any | null } | null, fallback?: string | null): string {
  if (!m) return (fallback ?? "").trim() || "Tap to open";
  const t = String(m.type ?? "").toLowerCase();
  if (t === "text") {
    const txt = String(m.payload?.text ?? "").trim();
    return txt.length ? txt : "Message";
  }
  const label = String(m.payload?.label ?? "").trim();
  if (label.length) return label;
  const body = String(m.payload?.body ?? "").trim();
  if (body.length) return body;
  return (fallback ?? "").trim() || t || "Update";
}
