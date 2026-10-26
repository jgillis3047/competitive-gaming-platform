// lib/backend/visionLeaderboardSync.ts — Auto-post AI vision results to spot leaderboards

import * as Location from "expo-location";
import { resolveInPersonVisionProfile } from "../data/inPersonVisionConfig";
import { fetchNearbyCourts, submitCourtAttempt } from "./courts";
import { supabase } from "./supabaseClient";

function parseScoreNumber(reportedScore: string | null | undefined): number | null {
  if (!reportedScore?.trim()) return null;
  const digits = reportedScore.match(/\d+/g);
  if (!digits?.length) return null;
  const nums = digits.map((d) => parseInt(d, 10)).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.max(...nums);
}

async function resolveAiScore(params: {
  challengeId: string;
  winnerUserId: string | null;
  gameType: string | null;
  reportedScore?: string | null;
}): Promise<{ score: number; proofPath: string | null } | null> {
  const profile = resolveInPersonVisionProfile(params.gameType);
  if (!profile.leaderboardSlug || profile.scoreFromAi === "none") return null;

  const { data: session } = await supabase
    .from("shooting_sessions")
    .select("makes, total_shots, video_path, user_id, status")
    .eq("challenge_id", params.challengeId)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let score: number | null = null;
  let proofPath: string | null = null;

  if (session && params.winnerUserId && String(session.user_id) === String(params.winnerUserId)) {
    proofPath = (session as any).video_path ?? null;
    if (profile.scoreFromAi === "makes") {
      score = Number((session as any).qualified_makes ?? (session as any).makes ?? 0);
    }
  }

  if (score == null && profile.scoreFromAi === "reported_score") {
    score = parseScoreNumber(params.reportedScore);
  }

  if (score == null && profile.scoreFromAi === "carry_yards") {
    score = parseScoreNumber(params.reportedScore);
  }

  if (score == null || score <= 0) {
    const { data: proof } = await supabase
      .from("match_proofs")
      .select("storage_path")
      .eq("challenge_id", params.challengeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    proofPath = proofPath ?? (proof as any)?.storage_path ?? null;
    if (profile.scoreFromAi === "reported_score" || profile.scoreFromAi === "carry_yards") {
      score = parseScoreNumber(params.reportedScore);
    }
  }

  if (score == null || !Number.isFinite(score) || score <= 0) return null;
  return { score, proofPath };
}

/** After in-person challenge completes, push qualifying AI scores to the nearest arena leaderboard. */
export async function syncInPersonVisionToLeaderboard(params: {
  challengeId: string;
  winnerUserId: string | null;
  gameType: string | null;
  reportedScore?: string | null;
}): Promise<{ synced: boolean; courtId?: string; slug?: string }> {
  const profile = resolveInPersonVisionProfile(params.gameType);
  if (!profile.leaderboardSlug || !params.winnerUserId) {
    return { synced: false };
  }

  let reportedScore = params.reportedScore ?? null;
  if (!reportedScore) {
    const { data: review } = await supabase
      .from("ai_match_reviews")
      .select("reported_score, detected_score")
      .eq("challenge_id", params.challengeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reportedScore =
      (review as any)?.reported_score ?? (review as any)?.detected_score ?? null;
  }

  const resolved = await resolveAiScore({ ...params, reportedScore });
  if (!resolved) return { synced: false };

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { synced: false };

  const pos = await Location.getCurrentPositionAsync({});
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  const nearby = await fetchNearbyCourts(lat, lng, 5);
  const court = nearby[0];
  if (!court?.id) return { synced: false };

  try {
    await submitCourtAttempt({
      userId: params.winnerUserId,
      courtId: court.id,
      recordTypeSlug: profile.leaderboardSlug,
      scoreValue: resolved.score,
      checkinLat: lat,
      checkinLng: lng,
      proofMediaPath: resolved.proofPath,
      verificationLevel: resolved.proofPath ? "verified" : "basic",
    });
    return { synced: true, courtId: court.id, slug: profile.leaderboardSlug };
  } catch {
    return { synced: false };
  }
}
