// lib/thread/threadMessageTypes.ts

/**
 * SINGLE SOURCE OF TRUTH
 * Keep these in sync with your DB enum `thread_message_type`.
 *
 * Recommended enum values in DB:
 * - text
 * - system
 * - challenge_created
 * - challenge_accepted
 * - prompt_checkin
 * - checkin_confirmed
 * - prompt_submit_result
 * - result_submitted
 * - disputed
 * - challenge_completed
 * - payout_processed
 * - prompt_rematch
 */

export type ThreadMessageType =
  | "text"
  | "system"
  | "challenge_created"
  | "challenge_accepted"
  | "prompt_checkin"
  | "checkin_confirmed"
  | "prompt_submit_result"
  | "result_submitted"
  | "disputed"
  | "challenge_completed"
  | "payout_processed"
  | "prompt_rematch";

export type ThreadActionType =
  | "OPEN_CHALLENGE"
  | "CHECK_IN_YES"
  | "CHECK_IN_NO"
  | "SUBMIT_RESULT_WIN_ME"
  | "SUBMIT_RESULT_WIN_OPP"
  | "SUBMIT_RESULT_TIE"
  | "REMATCH_OFFER"
  | "REMATCH_ACCEPT"
  | "REMATCH_DECLINE";

export type ThreadAction = {
  actionId: string; // unique per button (uuid or `${messageId}:x`)
  type: ThreadActionType;
  label: string;
  // optional UI hints
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;

  // routing / action payload
  challengeId?: string | null;
  opponentId?: string | null;
};

export type ThreadMessagePayload = {
  // what you show
  label?: string | null;
  body?: string | null;

  // for text messages
  text?: string | null;

  // optional challenge context
  challenge_id?: string | null;
  challenge_title?: string | null;
  game_type?: string | null;
  kind?: "phone" | "in_person" | "admin_event" | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;

  // interactive actions
  actions?: ThreadAction[] | null;

  // catch-all
  [k: string]: any;
};

export function isPromptType(t?: string | null) {
  const x = String(t ?? "").toLowerCase();
  return x.startsWith("prompt_");
}
