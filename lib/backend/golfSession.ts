// lib/backend/golfSession.ts — Golf round tracking + proof

import { invokeAiReviewGolf } from "./aiVision";
import { supabase } from "./supabaseClient";
import type {
  GolfAiReviewRow,
  GolfFormat,
  GolfHoleScoreRow,
  GolfProofType,
  GolfSessionRow,
} from "../models/visionTypes";

export async function createGolfSession(params: {
  createdBy: string;
  courseName: string;
  courseLat?: number | null;
  courseLng?: number | null;
  holes?: number;
  format?: GolfFormat;
  opponentUserId?: string | null;
  challengeId?: string | null;
}): Promise<GolfSessionRow> {
  const { data, error } = await supabase
    .from("golf_sessions")
    .insert({
      created_by: params.createdBy,
      course_name: params.courseName.trim(),
      course_lat: params.courseLat ?? null,
      course_lng: params.courseLng ?? null,
      holes: params.holes ?? 18,
      format: params.format ?? "stroke_play",
      opponent_user_id: params.opponentUserId ?? null,
      challenge_id: params.challengeId ?? null,
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as GolfSessionRow;
}

export async function fetchGolfSession(sessionId: string): Promise<GolfSessionRow | null> {
  const { data, error } = await supabase
    .from("golf_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GolfSessionRow) ?? null;
}

export async function fetchUserGolfSessions(userId: string, limit = 20): Promise<GolfSessionRow[]> {
  const { data, error } = await supabase
    .from("golf_sessions")
    .select("*")
    .or(`created_by.eq.${userId},opponent_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GolfSessionRow[];
}

export async function upsertHoleScore(params: {
  sessionId: string;
  userId: string;
  holeNumber: number;
  strokes: number;
  putts?: number | null;
  fairwayResult?: string | null;
  gir?: boolean | null;
  penalties?: number;
}): Promise<void> {
  const { error } = await supabase.from("golf_hole_scores").upsert(
    {
      session_id: params.sessionId,
      user_id: params.userId,
      hole_number: params.holeNumber,
      strokes: params.strokes,
      putts: params.putts ?? null,
      fairway_result: params.fairwayResult ?? null,
      gir: params.gir ?? null,
      penalties: params.penalties ?? 0,
    },
    { onConflict: "session_id,user_id,hole_number" }
  );
  if (error) throw new Error(error.message);
}

export async function fetchHoleScores(sessionId: string): Promise<GolfHoleScoreRow[]> {
  const { data, error } = await supabase
    .from("golf_hole_scores")
    .select("*")
    .eq("session_id", sessionId)
    .order("hole_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GolfHoleScoreRow[];
}

export function totalStrokes(scores: GolfHoleScoreRow[], userId: string): number {
  return scores.filter((s) => s.user_id === userId).reduce((sum, s) => sum + s.strokes, 0);
}

export async function insertGolfProof(params: {
  sessionId: string;
  uploadedBy: string;
  proofType: GolfProofType;
  storagePath?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("golf_proofs").insert({
    session_id: params.sessionId,
    uploaded_by: params.uploadedBy,
    proof_type: params.proofType,
    storage_path: params.storagePath ?? null,
    ai_status: "pending",
  });
  if (error) throw new Error(error.message);
}

export async function fetchGolfProofs(sessionId: string) {
  const { data, error } = await supabase
    .from("golf_proofs")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitGolfSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("golf_sessions")
    .update({ status: "submitted", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function runGolfAiReview(params: {
  sessionId: string;
  proofStoragePaths: string[];
  reportedScores: Record<string, number>;
  playerIds: string[];
}): Promise<GolfAiReviewRow> {
  let result;
  try {
    result = await invokeAiReviewGolf({
      sessionId: params.sessionId,
      proofStoragePaths: params.proofStoragePaths,
      reportedScores: params.reportedScores,
    });
  } catch (e: any) {
    const { data } = await supabase
      .from("golf_ai_reviews")
      .insert({
        session_id: params.sessionId,
        verdict: "needs_review",
        confidence: 0,
        summary: e?.message ?? "AI review unavailable.",
        flags: ["ai_unavailable"],
        detected_scores: params.reportedScores,
      })
      .select("*")
      .single();
    return { ...(data as GolfAiReviewRow), flags: ["ai_unavailable"] };
  }

  const detectedScores = result.detected_scores ?? params.reportedScores;
  let detectedWinner: string | null = null;
  if (params.playerIds.length >= 2) {
    const [a, b] = params.playerIds;
    const scoreA = detectedScores[a] ?? Infinity;
    const scoreB = detectedScores[b] ?? Infinity;
    if (scoreA < scoreB) detectedWinner = a;
    else if (scoreB < scoreA) detectedWinner = b;
  }

  const { data, error } = await supabase
    .from("golf_ai_reviews")
    .insert({
      session_id: params.sessionId,
      verdict: result.verdict,
      confidence: result.confidence,
      summary: result.summary,
      flags: result.flags,
      detected_scores: detectedScores,
      detected_winner: detectedWinner,
      raw_response: result,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("golf_sessions").update({ status: "reviewed" }).eq("id", params.sessionId);

  return {
    ...(data as GolfAiReviewRow),
    flags: Array.isArray((data as any).flags) ? (data as any).flags : [],
  };
}

export async function fetchLatestGolfAiReview(sessionId: string): Promise<GolfAiReviewRow | null> {
  const { data, error } = await supabase
    .from("golf_ai_reviews")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...(data as GolfAiReviewRow),
    flags: Array.isArray((data as any).flags) ? (data as any).flags : [],
  };
}

export function golfFormatLabel(f: GolfFormat): string {
  switch (f) {
    case "stroke_play":
      return "Stroke Play";
    case "match_play":
      return "Match Play";
    case "longest_drive":
      return "Longest Drive";
    case "closest_to_pin":
      return "Closest to Pin";
    case "putting":
      return "Putting Challenge";
    case "range":
      return "Range Session";
    default:
      return f;
  }
}
