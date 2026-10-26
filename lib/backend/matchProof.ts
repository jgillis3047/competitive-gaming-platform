// lib/backend/matchProof.ts — Match proof bundles + AI review orchestration

import { validateInPersonProof } from "./inPersonAiValidation";
import { invokeAiReviewMatch } from "./aiVision";
import { supabase } from "./supabaseClient";
import { validateCategoryScore } from "../data/leaderboardTaxonomy";
import type {
  AiMatchReviewRow,
  MatchProofRow,
  ProofType,
  SportKey,
} from "../models/visionTypes";
import { resolveInPersonVisionProfile } from "../data/inPersonVisionConfig";
import { inferSportKey } from "../models/visionTypes";

export type ProofUploadItem = {
  storagePath: string;
  proofType: ProofType;
};

export async function insertMatchProofs(params: {
  challengeId: string;
  uploadedBy: string;
  sportKey: SportKey;
  items: ProofUploadItem[];
}): Promise<MatchProofRow[]> {
  const rows = params.items.map((item) => ({
    challenge_id: params.challengeId,
    uploaded_by: params.uploadedBy,
    proof_type: item.proofType,
    storage_path: item.storagePath,
    sport_key: params.sportKey,
    status: "pending",
  }));

  const { data, error } = await supabase.from("match_proofs").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as MatchProofRow[];
}

export async function fetchMatchProofs(challengeId: string): Promise<MatchProofRow[]> {
  const { data, error } = await supabase
    .from("match_proofs")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MatchProofRow[];
}

export async function fetchLatestAiReview(challengeId: string): Promise<AiMatchReviewRow | null> {
  const { data, error } = await supabase
    .from("ai_match_reviews")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...(data as AiMatchReviewRow),
    flags: Array.isArray((data as any).flags) ? (data as any).flags : [],
  };
}

export async function runAiMatchReview(params: {
  challengeId: string;
  gameType: string | null;
  reportedScore?: string | null;
  proofStoragePaths: string[];
  challengeKind?: "in_person" | "egame";
  reporterUserId?: string;
  primaryProofType?: "video" | "photo" | "scorecard" | null;
}): Promise<AiMatchReviewRow> {
  const vision = resolveInPersonVisionProfile(params.gameType);
  const sportKey = vision.sportKey ?? inferSportKey(params.gameType);
  const paths = params.proofStoragePaths.filter(Boolean);

  let review;
  try {
    const reportedLabel = params.reportedScore ?? null;
    let reportedNum: number | null = null;
    if (reportedLabel) {
      reportedNum = vision.recordSlug
        ? validateCategoryScore(vision.recordSlug, reportedLabel)
        : null;
      if (reportedNum == null) {
        const n = Number(String(reportedLabel).replace(/[^\d.]/g, ""));
        reportedNum = Number.isFinite(n) && n > 0 ? n : null;
      }
    }

    if (
      params.challengeKind === "in_person" &&
      params.reporterUserId &&
      reportedNum != null &&
      reportedNum > 0
    ) {
      const validated = await validateInPersonProof({
        userId: params.reporterUserId,
        recordSlug: vision.recordSlug ?? null,
        gameType: params.gameType,
        reportedScore: reportedNum,
        reportedScoreLabel: reportedLabel ?? String(reportedNum),
        proofStoragePaths: paths,
        proofMediaType:
          params.primaryProofType === "video"
            ? "video"
            : params.primaryProofType === "photo" || params.primaryProofType === "scorecard"
              ? "image"
              : null,
        challengeId: params.challengeId,
      });
      review = {
        detected_sport: sportKey,
        summary: validated.summary,
        detected_score: validated.detected_score,
        confidence: validated.confidence,
        flags: validated.flags,
        recommendation: validated.verdict,
        score_matches_reported: validated.score_matches,
      };
    } else {
      review = await invokeAiReviewMatch({
        challengeId: params.challengeId,
        sportKey,
        gameType: params.gameType,
        recordSlug: vision.recordSlug ?? null,
        activityTitle: params.gameType,
        mode: vision.mode,
        reportedScore: params.reportedScore ?? null,
        proofStoragePaths: paths,
      });
    }
  } catch (e: any) {
    // Store failed review so UI can show status
    const { data } = await supabase
      .from("ai_match_reviews")
      .insert({
        challenge_id: params.challengeId,
        sport_key: sportKey,
        verdict: "needs_review",
        confidence: 0,
        summary: e?.message ?? "AI review unavailable — manual confirmation required.",
        flags: ["ai_unavailable"],
        reported_score: params.reportedScore ?? null,
      })
      .select("*")
      .single();
    return {
      ...(data as AiMatchReviewRow),
      flags: ["ai_unavailable"],
    };
  }

  const verdict =
    review.recommendation ??
    (review.confidence >= 0.85 && review.flags.length === 0 ? "approved" : "needs_review");

  const { data, error } = await supabase
    .from("ai_match_reviews")
    .insert({
      challenge_id: params.challengeId,
      sport_key: sportKey,
      verdict,
      confidence: review.confidence,
      detected_score: review.detected_score,
      reported_score: params.reportedScore ?? null,
      summary: review.summary,
      flags: review.flags,
      raw_response: review,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (paths.length > 0) {
    await supabase
      .from("match_proofs")
      .update({ status: "reviewed" })
      .eq("challenge_id", params.challengeId)
      .in("storage_path", paths);
  }

  return {
    ...(data as AiMatchReviewRow),
    flags: Array.isArray((data as any).flags) ? (data as any).flags : [],
  };
}

export function aiReviewBadge(review: AiMatchReviewRow | null): {
  label: string;
  color: "green" | "yellow" | "red" | "gray";
} {
  if (!review) return { label: "No AI review", color: "gray" };
  const pct = Math.round(Number(review.confidence ?? 0) * 100);
  if (review.verdict === "approved") return { label: `AI verified ${pct}%`, color: "green" };
  if (review.verdict === "rejected") return { label: `AI flagged ${pct}%`, color: "red" };
  return { label: `AI review ${pct}%`, color: "yellow" };
}
