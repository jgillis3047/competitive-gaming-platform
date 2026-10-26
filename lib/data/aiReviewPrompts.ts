// lib/data/aiReviewPrompts.ts — Sport- and activity-specific AI proof instructions

import type { InPersonVisionMode } from "./inPersonVisionConfig";
import { getInPersonGameSpec } from "./inPersonGameSpecs";
import { getLeaderboardCategory } from "./leaderboardTaxonomy";
import type { SportKey } from "../models/visionTypes";
import { jsonSchemaForValidator as validatorJsonSchema, type AiValidatorKind } from "./inPersonAiValidation";

export type AiReviewContext = {
  sportKey: SportKey;
  gameType?: string | null;
  recordSlug?: string | null;
  mode?: InPersonVisionMode;
  activityTitle?: string | null;
  validationRules?: string | null;
};

function activityTitle(ctx: AiReviewContext): string {
  if (ctx.activityTitle) return ctx.activityTitle;
  if (ctx.recordSlug) return getLeaderboardCategory(ctx.recordSlug)?.title ?? ctx.recordSlug;
  return ctx.gameType?.trim() || "In-person activity";
}

export function buildAiReviewPrompt(ctx: AiReviewContext): string {
  const slug = ctx.recordSlug ?? "";
  const title = activityTitle(ctx);
  const spec = slug ? getInPersonGameSpec(slug) : null;
  const reported = "Reported score is provided separately — compare when visible.";

  if (ctx.validationRules?.trim()) {
    return `${ctx.validationRules.trim()}\n${reported}\nReturn JSON only.`;
  }

  if (spec?.aiReviewPromptExtra) {
    const reqs = spec.recordingRequirements.map((r) => `- ${r}`).join("\n");
    return `Analyze proof for "${title}".
${spec.validationRules}
Recording requirements:
${reqs}
${spec.aiReviewPromptExtra}
${reported}
Return JSON only.`;
  }

  if (ctx.mode === "timed_shooting" || spec?.usesShotTracker) {
    return `Analyze this basketball shooting proof for "${title}".
- Sideline/baseline camera with court markings visible
- Count visible MADE baskets vs misses
- Note timer window if applicable
${reported}
Return JSON only.`;
  }

  if (spec?.usesGolfAi || ctx.sportKey === "golf") {
    return `Analyze this golf proof for "${title}".
- Scorecard: read player names, hole scores, totals if visible
- Swing video: verify real golf swing, ball flight, range/course setting
- Distance markers or range display if shown
${reported}
Return JSON only.`;
  }

  if (ctx.sportKey === "fitness") {
    return `Analyze this fitness/gym proof for "${title}".
- Verify exercise matches activity (reps, holds, cardio machine readout)
- Count reps or read timer/hold duration if clearly visible
- Flag stock footage, wrong exercise, or unreadable displays
${reported}
Return JSON only.`;
  }

  if (ctx.mode === "match_proof") {
    return `Analyze this head-to-head match proof for "${title}".
- Both competitors or teams should be identifiable
- Final score or winning moment should be visible or stated
${reported}
Return JSON only.`;
  }

  return `Analyze this sports proof for "${title}".
- Verify authentic footage/photo for the claimed activity
- Read any visible score, time, count, or distance
- Flag obvious edits, wrong sport, or missing result evidence
${reported}
Return JSON only.`;
}

export function slugUsesShotTracker(slug: string): boolean {
  return getInPersonGameSpec(slug)?.usesShotTracker === true;
}

export function slugUsesGolfAi(slug: string): boolean {
  return getInPersonGameSpec(slug)?.usesGolfAi === true;
}

export function jsonSchemaForValidator(kind: AiValidatorKind | null): string {
  return validatorJsonSchema(kind ?? "vision_count");
}
