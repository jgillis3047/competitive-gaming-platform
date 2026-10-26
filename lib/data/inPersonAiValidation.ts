// lib/data/inPersonAiValidation.ts — Per-activity AI validation (from inPersonGameSpecs)

import { SPOTS_CATEGORIES } from "./leaderboardTaxonomy";
import {
  getInPersonGameSpec,
  listActiveInPersonGameSpecs,
  type AiValidatorKind,
} from "./inPersonGameSpecs";
import { resolveInPersonVisionProfile, resolveInPersonVisionProfileFromSlug } from "./inPersonVisionConfig";

export type { AiValidatorKind };

export type InPersonValidatorConfig = {
  slug: string;
  title: string;
  kind: AiValidatorKind;
  proofRequired: boolean;
  requiresVideo: boolean;
  scoreUnit: string;
  higherIsBetter: boolean;
  validationRules: string;
  tolerancePct: number;
  recordingRequirements: string[];
  submitChecklist: string[];
  attemptCap?: number;
};

function configFromSpec(slug: string): InPersonValidatorConfig {
  const s = getInPersonGameSpec(slug);
  if (!s) {
    return {
      slug,
      title: slug.replace(/_/g, " "),
      kind: "vision_count",
      proofRequired: true,
      requiresVideo: true,
      scoreUnit: "count",
      higherIsBetter: true,
      validationRules: `Validate proof for "${slug}".`,
      tolerancePct: 12,
      recordingRequirements: [],
      submitChecklist: [],
    };
  }
  return {
    slug: s.slug,
    title: s.title,
    kind: s.validatorKind,
    proofRequired: s.proofRequired,
    requiresVideo: s.requiresVideo,
    scoreUnit: s.scoreUnit,
    higherIsBetter: s.higherIsBetter,
    validationRules: s.validationRules,
    tolerancePct: s.tolerancePct,
    recordingRequirements: s.recordingRequirements,
    submitChecklist: s.submitChecklist,
    attemptCap: s.attemptCap,
  };
}

export function validatorConfigForSlug(slug: string): InPersonValidatorConfig {
  return configFromSpec(slug);
}

export function validatorConfigForGameType(gameType: string | null | undefined): InPersonValidatorConfig {
  const vision = resolveInPersonVisionProfile(gameType);
  if (vision.recordSlug) return validatorConfigForSlug(vision.recordSlug);
  const gt = String(gameType ?? "").toLowerCase();
  if (gt.includes("basketball") && gt.includes("1v1")) return validatorConfigForSlug("twenty_one_1v1");
  if (gt.includes("3v3")) return validatorConfigForSlug("three_v_three_to_21");
  if (gt.includes("5v5")) return validatorConfigForSlug("five_v_five_full_court");
  return {
    slug: "custom",
    title: String(gameType ?? "In-person challenge"),
    kind: "vision_match",
    proofRequired: true,
    requiresVideo: true,
    scoreUnit: "points",
    higherIsBetter: true,
    validationRules: `Verify reported result for "${gameType}" with authentic match or activity proof.`,
    tolerancePct: 15,
    recordingRequirements: ["Both sides or full activity visible", "Final result stated on camera"],
    submitChecklist: ["Proof attached", "Score stated clearly"],
  };
}

export const ALL_VALIDATOR_CONFIGS: InPersonValidatorConfig[] = SPOTS_CATEGORIES.map((c) =>
  validatorConfigForSlug(c.slug)
);

export function jsonSchemaForValidator(kind: AiValidatorKind): string {
  const base = `{
  "activity_verified": boolean,
  "summary": "1-2 sentences",
  "confidence": 0.0-1.0,
  "flags": ["string"],
  "recommendation": "approved|needs_review|rejected",
  "score_matches_reported": boolean`;
  switch (kind) {
    case "shot_tracker":
      return `${base},
  "detected_count": integer or null,
  "detected_streak": integer or null
}`;
    case "wearable_sync":
      return `${base},
  "wearable_proof_valid": boolean
}`;
    case "golf_vision":
      return `${base},
  "detected_distance": number or null,
  "detected_count": integer or null
}`;
    case "vision_time":
      return `${base},
  "detected_time_sec": number or null
}`;
    case "vision_distance":
      return `${base},
  "detected_distance": number or null
}`;
    case "vision_match":
      return `${base},
  "both_players_visible": boolean,
  "detected_score": "string or null"
}`;
    case "vision_streak":
      return `${base},
  "detected_streak": integer or null,
  "detected_count": integer or null
}`;
    case "vision_level":
      return `${base},
  "detected_level": integer or null
}`;
    default:
      return `${base},
  "detected_count": integer or null
}`;
  }
}

export function listValidatorSpecs() {
  return listActiveInPersonGameSpecs();
}
