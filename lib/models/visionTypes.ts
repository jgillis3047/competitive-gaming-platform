// lib/models/visionTypes.ts — AI Vision proof & tracking types

export type SportKey =
  | "basketball"
  | "golf"
  | "running"
  | "fitness"
  | "pickleball"
  | "tennis"
  | "soccer"
  | "volleyball"
  | "frisbee"
  | "other";

export type ProofType = "video" | "photo" | "scorecard";

export type AiVerdict = "approved" | "needs_review" | "rejected";

export type MatchProofRow = {
  id: string;
  challenge_id: string;
  uploaded_by: string;
  proof_type: ProofType;
  storage_path: string;
  sport_key: SportKey | null;
  status: string;
  created_at: string;
};

export type AiMatchReviewRow = {
  id: string;
  challenge_id: string;
  sport_key: SportKey | null;
  verdict: AiVerdict | null;
  confidence: number | null;
  detected_score: string | null;
  reported_score: string | null;
  summary: string | null;
  flags: string[];
  created_at: string;
};

export type AiReviewResponse = {
  detected_sport: SportKey;
  summary: string;
  detected_score: string | null;
  confidence: number;
  flags: string[];
  recommendation: AiVerdict;
  activity_verified?: boolean;
  score_matches_reported?: boolean;
  both_players_visible?: boolean;
  detected_count?: number | null;
  detected_streak?: number | null;
  detected_time_sec?: number | null;
  detected_distance?: number | null;
  detected_level?: number | null;
};

export type ShootingSessionType = "free_throw" | "three_point" | "midrange" | "mixed";

export type ShootingSessionRow = {
  id: string;
  user_id: string;
  challenge_id: string | null;
  video_path: string | null;
  session_type: ShootingSessionType;
  status: "uploading" | "processing" | "complete" | "failed";
  total_shots: number | null;
  makes: number | null;
  misses: number | null;
  fg_percent: number | null;
  best_streak: number | null;
  confidence: number | null;
  error_message: string | null;
  video_duration_sec: number | null;
  time_limit_sec: number | null;
  qualified_makes: number | null;
  rule_flags: string[];
  created_at: string;
  completed_at: string | null;
};

export type TrackedShotRow = {
  id: string;
  session_id: string;
  shot_number: number;
  result: "make" | "miss";
  confidence: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  behind_arc: boolean | null;
  behind_arc_confidence: number | null;
};

export type GolfFormat =
  | "stroke_play"
  | "match_play"
  | "longest_drive"
  | "closest_to_pin"
  | "putting"
  | "range";

export type GolfSessionRow = {
  id: string;
  challenge_id: string | null;
  course_name: string;
  course_lat: number | null;
  course_lng: number | null;
  holes: number;
  format: GolfFormat;
  status: "active" | "submitted" | "reviewed" | "completed";
  started_at: string | null;
  ended_at: string | null;
  created_by: string;
  opponent_user_id: string | null;
  created_at: string;
};

export type GolfHoleScoreRow = {
  id: string;
  session_id: string;
  user_id: string;
  hole_number: number;
  strokes: number;
  putts: number | null;
  fairway_result: string | null;
  gir: boolean | null;
  penalties: number;
};

export type GolfProofType =
  | "scorecard"
  | "tee_video"
  | "putt_video"
  | "gps_checkin"
  | "group_photo";

export type GolfAiReviewRow = {
  id: string;
  session_id: string;
  verdict: AiVerdict | null;
  detected_winner: string | null;
  detected_scores: Record<string, number> | null;
  summary: string | null;
  confidence: number | null;
  flags: string[];
  created_at: string;
};

export type CourtAttemptAiReview = {
  verdict: AiVerdict | null;
  confidence: number | null;
  summary: string | null;
  detected_score: string | null;
  flags: string[];
};

/** Infer sport from challenge game_type or record slug. */
export function inferSportKey(gameType: string | null | undefined): SportKey {
  const gt = String(gameType ?? "").toLowerCase();
  if (gt.includes("golf") || gt.includes("putt") || gt.includes("carry") || gt.includes("drive")) return "golf";
  if (
    gt.includes("basketball") ||
    gt.includes("horse") ||
    gt.includes("knockout") ||
    gt.includes("3pt") ||
    gt.includes("free throw") ||
    gt.includes("layup") ||
    gt.includes("pointer") ||
    gt.includes("dunk")
  ) {
    return "basketball";
  }
  if (gt.includes("mile") || gt.includes("5k") || gt.includes("run") || gt.includes("dash") || gt.includes("sprint"))
    return "running";
  if (
    gt.includes("burpee") ||
    gt.includes("pushup") ||
    gt.includes("plank") ||
    gt.includes("bench") ||
    gt.includes("squat") ||
    gt.includes("pullup") ||
    gt.includes("fitness") ||
    gt.includes("gym")
  )
    return "fitness";
  if (gt.includes("pickleball")) return "pickleball";
  if (gt.includes("tennis")) return "tennis";
  if (gt.includes("soccer") || gt.includes("penalt")) return "soccer";
  if (gt.includes("volleyball")) return "volleyball";
  if (gt.includes("frisbee")) return "frisbee";
  return "other";
}
