// lib/backend/wearableRunValidation.ts — Running activities via wearable sync (no video AI)

import { getInPersonGameSpec, type WearableProvider } from "../data/inPersonGameSpecs";
import { validateCategoryScore } from "../data/leaderboardTaxonomy";
import type { AiVerdict } from "../models/visionTypes";
import { matchWorkoutToRunSlug } from "../wearable/matchRunActivity";
import type { WearableImportSource, WearableWorkoutSample } from "../wearable/types";

export type WearableRunProof = {
  recordSlug: string;
  reportedScoreLabel: string;
  reportedScoreSec: number;
  provider: WearableProvider;
  screenshotStoragePath?: string | null;
  activityDateIso?: string | null;
  importSource?: WearableImportSource | null;
  importedWorkout?: WearableWorkoutSample | null;
};

export type WearableValidationResult = {
  verdict: AiVerdict;
  confidence: number;
  summary: string;
  flags: string[];
  detected_score: string | null;
  detected_numeric: number | null;
  score_matches: boolean;
};

const PROVIDER_LABELS: Record<WearableProvider, string> = {
  apple_watch: "Apple Watch",
  garmin: "Garmin",
  fitbit: "Fitbit",
  coros: "Coros",
  polar: "Polar",
  other: "Wearable",
};

export function validateWearableRunProof(proof: WearableRunProof): WearableValidationResult {
  const spec = getInPersonGameSpec(proof.recordSlug);
  const flags: string[] = [];

  if (!spec || spec.validatorKind !== "wearable_sync") {
    return {
      verdict: "rejected",
      confidence: 0.2,
      summary: "Unknown or unsupported running activity.",
      flags: ["invalid_slug"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
    };
  }

  const hasImport = Boolean(proof.importedWorkout);
  const hasScreenshot = Boolean(proof.screenshotStoragePath?.trim());

  if (!hasImport && !hasScreenshot) {
    return {
      verdict: "rejected",
      confidence: 0.25,
      summary:
        "Import from Apple Health / Garmin GPX, or upload a wearable activity screenshot.",
      flags: ["no_wearable_proof"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
    };
  }

  const parsed = validateCategoryScore(proof.recordSlug, proof.reportedScoreLabel);
  if (parsed == null || parsed <= 0) {
    return {
      verdict: "rejected",
      confidence: 0.3,
      summary: "Enter a valid time for this activity.",
      flags: ["invalid_time"],
      detected_score: null,
      detected_numeric: null,
      score_matches: false,
    };
  }

  if (proof.importedWorkout) {
    const match = matchWorkoutToRunSlug(proof.recordSlug, proof.importedWorkout, parsed);
    flags.push(...match.flags);
    if (proof.importSource) flags.push(`import:${proof.importSource}`);
    if (!match.matches) {
      return {
        verdict: "needs_review",
        confidence: 0.45,
        summary: `Imported workout does not match ${spec.title} requirements. Check distance or activity type.`,
        flags,
        detected_score: proof.reportedScoreLabel,
        detected_numeric: parsed,
        score_matches: false,
      };
    }
  } else if (proof.activityDateIso) {
    const activityDay = new Date(proof.activityDateIso).toDateString();
    const today = new Date().toDateString();
    if (activityDay !== today) {
      flags.push("activity_not_today");
    }
  }

  const provider = PROVIDER_LABELS[proof.provider] ?? "Wearable";
  const hasDateIssue = flags.includes("activity_not_today");
  const importBoost = hasImport ? 0.08 : 0;

  const importNote = hasImport
    ? ` (${proof.importSource === "apple_health" ? "Apple Health" : proof.importSource === "garmin_gpx" ? "Garmin GPX" : "device"} sync)`
    : "";

  return {
    verdict: hasDateIssue ? "needs_review" : "approved",
    confidence: Math.min(0.95, (hasDateIssue ? 0.55 : 0.85) + importBoost),
    summary: `${provider} activity logged for ${spec.title}${importNote}. Time: ${proof.reportedScoreLabel}. Opponent can confirm.`,
    flags,
    detected_score: proof.reportedScoreLabel,
    detected_numeric: parsed,
    score_matches: true,
  };
}
