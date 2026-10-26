// lib/backend/inPersonAiValidation.ts — Route each in-person activity to the right AI validator

import {
  validatorConfigForGameType,
  validatorConfigForSlug,
  type AiValidatorKind,
  type InPersonValidatorConfig,
} from "../data/inPersonAiValidation";
import { isWearableRunSlug } from "../data/inPersonGameSpecs";
import type { WearableProvider } from "../data/inPersonGameSpecs";
import { validateWearableRunProof } from "./wearableRunValidation";
import { resolveInPersonVisionProfile, resolveInPersonVisionProfileFromSlug } from "../data/inPersonVisionConfig";
import type { InPersonVisionMode } from "../data/inPersonVisionConfig";
import { scoresMatch, pickDetectedNumeric } from "../utils/scoreCompare";
import type { AiVerdict, SportKey } from "../models/visionTypes";
import { invokeAiReviewMatch } from "./aiVision";
import {
  buildShootingRuleReviewPrompt,
  requiresArcValidation,
} from "../data/shootingRecordingRules";
import {
  createShootingSession,
  fetchShootingSession,
  triggerShootingAnalysis,
} from "./shootingSession";
import type { ShootingSessionType } from "../models/visionTypes";

export type InPersonValidationResult = {
  verdict: AiVerdict;
  confidence: number;
  summary: string;
  flags: string[];
  detected_score: string | null;
  detected_numeric: number | null;
  score_matches: boolean;
  validator_kind: AiValidatorKind;
  used_shot_tracker: boolean;
  shooting_session_id?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollShootingSession(
  sessionId: string,
  maxWaitMs = 120_000
): Promise<{ makes: number; confidence: number; best_streak: number; usedOpenAi: boolean } | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const row = await fetchShootingSession(sessionId);
    if (!row) return null;
    if (row.status === "complete" && row.makes != null) {
      const err = String(row.error_message ?? "");
      return {
        makes: Number(row.makes),
        confidence: Number(row.confidence ?? 0.5),
        best_streak: Number(row.best_streak ?? 0),
        usedOpenAi: err.toLowerCase().includes("openai"),
      };
    }
    if (row.status === "failed") return null;
    await sleep(2500);
  }
  return null;
}

async function validateWithShotTracker(params: {
  userId: string;
  config: InPersonValidatorConfig;
  videoPath: string;
  reportedScore: number;
  challengeId?: string | null;
}): Promise<InPersonValidationResult> {
  const vision = resolveInPersonVisionProfileFromSlug(params.config.slug);
  const sessionType = (vision.shootingSessionType ?? "mixed") as ShootingSessionType;

  const session = await createShootingSession({
    userId: params.userId,
    sessionType,
    challengeId: params.challengeId ?? null,
    videoPath: params.videoPath,
    timeLimitSec: vision.timeLimitSec ?? null,
  });

  await triggerShootingAnalysis({
    sessionId: session.id,
    videoPath: params.videoPath,
    sessionType,
    timeLimitSec: vision.timeLimitSec ?? null,
    recordSlug: params.config.slug,
  });

  const tracked = await pollShootingSession(session.id);
  if (!tracked) {
    return {
      verdict: "needs_review",
      confidence: 0.4,
      summary: "Shot tracker could not finish — upload clearer hoop-facing video or try Arena Vision first.",
      flags: ["shot_tracker_timeout"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
      validator_kind: "shot_tracker",
      used_shot_tracker: true,
      shooting_session_id: session.id,
    };
  }

  const sessionRow = await fetchShootingSession(session.id);
  const ruleFlags = sessionRow?.rule_flags ?? [];
  const qualifiedMakes = sessionRow?.qualified_makes ?? tracked.makes;

  const useStreak = params.config.slug.includes("streak") || params.config.kind === "vision_streak";
  const detected = useStreak
    ? Math.max(tracked.best_streak, qualifiedMakes)
    : qualifiedMakes;

  let flags: string[] = [...ruleFlags];
  if (ruleFlags.some((f) => f.startsWith("inside_arc_makes") || f === "activity_not_verified")) {
    flags.push("arc_rules_violation");
  }
  if (
    vision.timeLimitSec &&
    sessionRow?.video_duration_sec != null &&
    sessionRow.video_duration_sec > vision.timeLimitSec + 2
  ) {
    flags.push("video_over_time_limit");
  }

  const matches = scoresMatch({
    reported: params.reportedScore,
    detected,
    higherIsBetter: params.config.higherIsBetter,
    tolerancePct: params.config.tolerancePct,
  });
  if (!matches) flags.push("score_mismatch");

  let verdict: AiVerdict =
    tracked.confidence >= 0.6 && matches && !flags.includes("arc_rules_violation")
      ? "approved"
      : "needs_review";

  if (flags.includes("rule_review_rejected") || flags.includes("activity_not_verified")) {
    verdict = flags.includes("rule_review_rejected") ? "rejected" : "needs_review";
  }

  const enforceArc = requiresArcValidation(params.config.slug, sessionType);
  if (enforceArc && flags.includes("activity_not_verified")) {
    verdict = "needs_review";
  }

  if (enforceArc && !flags.includes("activity_not_verified")) {
    const ruleReview = await invokeAiReviewMatch({
      challengeId: params.challengeId ?? null,
      sportKey: "basketball",
      gameType: params.config.title,
      recordSlug: params.config.slug,
      activityTitle: params.config.title,
      mode: "timed_shooting",
      validatorKind: "vision_count",
      validationRules: buildShootingRuleReviewPrompt({
        activityTitle: params.config.title,
        recordSlug: params.config.slug,
        timeLimitSec: vision.timeLimitSec ?? null,
      }),
      reportedScore: String(params.reportedScore),
      proofStoragePaths: [params.videoPath],
    });

    if (ruleReview.activity_verified === false) {
      flags.push(...(ruleReview.flags ?? []), "activity_not_verified");
      verdict =
        ruleReview.recommendation === "rejected"
          ? "rejected"
          : "needs_review";
    }
  }

  const sourceLabel = tracked.usedOpenAi ? "AI vision" : "Shot tracker";
  const arcNote =
    enforceArc && qualifiedMakes !== tracked.makes
      ? ` (${qualifiedMakes} qualified behind arc)`
      : "";

  return {
    verdict,
    confidence: tracked.confidence,
    summary: `${sourceLabel}: ${qualifiedMakes} makes${arcNote}${tracked.best_streak ? `, best streak ${tracked.best_streak}` : ""}.`,
    flags: [...new Set(flags)],
    detected_score: String(detected),
    detected_numeric: detected,
    score_matches: matches,
    validator_kind: "shot_tracker",
    used_shot_tracker: true,
    shooting_session_id: session.id,
  };
}

async function validateWithVision(params: {
  config: InPersonValidatorConfig;
  sportKey: SportKey;
  gameType?: string | null;
  mode?: InPersonVisionMode;
  reportedScore: number;
  reportedScoreLabel: string;
  proofStoragePaths: string[];
  challengeId?: string | null;
}): Promise<InPersonValidationResult> {
  const review = await invokeAiReviewMatch({
    challengeId: params.challengeId ?? null,
    sportKey: params.sportKey,
    gameType: params.gameType ?? params.config.title,
    recordSlug: params.config.slug,
    activityTitle: params.config.title,
    mode: params.mode,
    validatorKind: params.config.kind === "shot_tracker" ? "vision_count" : params.config.kind,
    validationRules: params.config.validationRules,
    reportedScore: params.reportedScoreLabel,
    proofStoragePaths: params.proofStoragePaths,
  });

  const detectedNumeric = pickDetectedNumeric({
    detected_count: review.detected_count,
    detected_streak: review.detected_streak,
    detected_time_sec: review.detected_time_sec,
    detected_distance: review.detected_distance,
    detected_level: review.detected_level,
    detected_score: review.detected_score,
  });

  const matches =
    detectedNumeric != null
      ? scoresMatch({
          reported: params.reportedScore,
          detected: detectedNumeric,
          higherIsBetter: params.config.higherIsBetter,
          tolerancePct: params.config.tolerancePct,
        })
      : review.score_matches_reported ?? false;

  let verdict = review.recommendation ?? "needs_review";
  if (detectedNumeric != null && !matches && verdict === "approved") {
    verdict = "needs_review";
  }

  return {
    verdict,
    confidence: review.confidence,
    summary: review.summary,
    flags: [...(review.flags ?? []), ...(matches ? [] : ["score_mismatch"])],
    detected_score: review.detected_score ?? (detectedNumeric != null ? String(detectedNumeric) : null),
    detected_numeric: detectedNumeric,
    score_matches: matches,
    validator_kind: params.config.kind,
    used_shot_tracker: false,
  };
}

export async function validateInPersonProof(params: {
  userId: string;
  recordSlug?: string | null;
  gameType?: string | null;
  reportedScore: number;
  reportedScoreLabel: string;
  proofStoragePaths: string[];
  proofMediaType?: "image" | "video" | null;
  challengeId?: string | null;
  wearableProvider?: WearableProvider | null;
  activityDateIso?: string | null;
}): Promise<InPersonValidationResult> {
  const slug = params.recordSlug ?? resolveInPersonVisionProfile(params.gameType).recordSlug ?? null;

  if (slug && isWearableRunSlug(slug)) {
    const wearable = validateWearableRunProof({
      recordSlug: slug,
      reportedScoreLabel: params.reportedScoreLabel,
      reportedScoreSec: params.reportedScore,
      provider: params.wearableProvider ?? "other",
      screenshotStoragePath: params.proofStoragePaths[0] ?? "",
      activityDateIso: params.activityDateIso,
    });
    return {
      verdict: wearable.verdict,
      confidence: wearable.confidence,
      summary: wearable.summary,
      flags: wearable.flags,
      detected_score: wearable.detected_score,
      detected_numeric: wearable.detected_numeric,
      score_matches: wearable.score_matches,
      validator_kind: "wearable_sync",
      used_shot_tracker: false,
    };
  }

  const config = params.recordSlug
    ? validatorConfigForSlug(params.recordSlug)
    : validatorConfigForGameType(params.gameType);

  const vision = params.recordSlug
    ? resolveInPersonVisionProfileFromSlug(params.recordSlug)
    : resolveInPersonVisionProfile(params.gameType);

  if (!params.proofStoragePaths.length) {
    return {
      verdict: "rejected",
      confidence: 0.2,
      summary: "Proof required — record video or photo for AI validation.",
      flags: ["no_proof"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
      validator_kind: config.kind,
      used_shot_tracker: false,
    };
  }

  if (config.requiresVideo && params.proofMediaType !== "video") {
    return {
      verdict: "needs_review",
      confidence: 0.35,
      summary: `${config.title} needs video proof for reliable AI validation.`,
      flags: ["video_required"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
      validator_kind: config.kind,
      used_shot_tracker: false,
    };
  }

  const videoPath = params.proofStoragePaths[0];

  if (config.kind === "shot_tracker" && params.proofMediaType === "video" && videoPath) {
    return validateWithShotTracker({
      userId: params.userId,
      config,
      videoPath,
      reportedScore: params.reportedScore,
      challengeId: params.challengeId,
    });
  }

  return validateWithVision({
    config,
    sportKey: vision.sportKey,
    gameType: params.gameType,
    mode: vision.mode,
    reportedScore: params.reportedScore,
    reportedScoreLabel: params.reportedScoreLabel,
    proofStoragePaths: params.proofStoragePaths,
    challengeId: params.challengeId,
  });
}
