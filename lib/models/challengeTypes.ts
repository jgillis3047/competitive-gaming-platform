export type ChallengeStatus =
  | "open"
  | "accepted"
  | "in-progress"
  | "checked-in"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled"
  | "disputed";

export type ChallengeKind = "phone" | "in_person" | "admin_event" | "egame";

export type InPersonRules = {
  location_text?: string | null;
  checkin_window_minutes?: number | null;
  best_of?: number | null;
};

/** Phone-game match options (stored on challenge_created event payload). */
export type PhoneRules = {
  /** Math 24: puzzles per player before submit (1, 3, 5, or 10). */
  set_count?: number | null;
};

// lib/models/challengeTypes.ts

export type ChallengeRow = {
  id: string;
  status: ChallengeStatus;
  kind?: ChallengeKind | null;
  created_by: string | null;

  // ✅ use this everywhere for config + routing
  game_key?: string | null;

  // (optional legacy/back-compat if some old rows still have it)
  game_type?: string | null;

  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
  winner_user_id: string | null;
  completed_at: string | null;

  invite_only?: boolean | null;
  invited_user_id?: string | null;
  opponent_user_id?: string | null;
  show_competitor_names_public?: boolean | null;

  settled_at?: string | null;
  settlement_status?: string | null;

  expires_at?: string | null;
  in_person_rules?: InPersonRules | null;
  checkin_deadline?: string | null;

  title: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  message?: string | null;

  /** E-game tiered verification */
  pending_winner_user_id?: string | null;
  result_reported_by?: string | null;
  result_reported_at?: string | null;
  result_confirm_by?: string | null;
  result_proof_path?: string | null;
  league_id?: string | null;

  turn_user_id?: string | null;
  current_turn_user_id?: string | null;
  next_turn_user_id?: string | null;
};