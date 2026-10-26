// lib/data/shootingRecordingRules.ts — Recording requirements for basketball shot tracking

import type { ShootingSessionType } from "../models/visionTypes";

export const SHOOTING_RECORDING_REQUIREMENTS = [
  "Sideline or baseline angle — the 3-point arc must be visible in frame",
  "Full body of the shooter visible at release on every attempt",
  "Keep the entire hoop in frame",
  "Use a stable phone position (tripod or propped) — no handheld panning",
] as const;

export function defaultTimeLimitSec(sessionType: ShootingSessionType, recordSlug?: string | null): number | null {
  if (recordSlug === "three_pointers_60s") return 60;
  if (sessionType === "three_point" && !recordSlug) return 60;
  return null;
}

/** Activities where makes must be behind the 3-point arc. */
export function requiresArcValidation(recordSlug?: string | null, sessionType?: ShootingSessionType): boolean {
  if (recordSlug === "three_pointers_60s" || recordSlug === "halfcourt_makes_10") return true;
  return sessionType === "three_point";
}

export function buildShootingRuleReviewPrompt(params: {
  activityTitle: string;
  recordSlug?: string | null;
  timeLimitSec?: number | null;
}): string {
  const timeRule = params.timeLimitSec
    ? `Video must be ${params.timeLimitSec} seconds or less. Flag if footage clearly exceeds ${params.timeLimitSec}s.`
    : "Flag if a timed challenge window is clearly exceeded.";

  return `Activity: "${params.activityTitle}".
${timeRule}
All counted makes must be legitimate 3-pointers taken from behind the 3-point arc.
Flag and set activity_verified=false if:
- Shots are layups, dunks, or inside-the-arc attempts presented as 3-pointers
- The 3-point arc is not visible (cannot verify distance)
- Shooter's full body is not visible at release
- Camera angle is behind the basket only (no arc visible)
- Obvious video edits, replays, or wrong sport footage

Only approve when shots match the claimed activity and arc rules.`;
}
