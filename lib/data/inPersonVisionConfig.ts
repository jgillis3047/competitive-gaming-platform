// lib/data/inPersonVisionConfig.ts — Vision routing (from inPersonGameSpecs)

import type { GolfFormat, ShootingSessionType, SportKey } from "../models/visionTypes";
import { getInPersonGameSpec, isRetiredInPersonSlug, listActiveInPersonGameSpecs } from "./inPersonGameSpecs";

export type InPersonVisionMode =
  | "match_proof"
  | "timed_shooting"
  | "golf_round"
  | "golf_shot"
  | "activity_proof"
  | "wearable_sync";

export type InPersonVisionProfile = {
  sportKey: SportKey;
  mode: InPersonVisionMode;
  proofRequired: boolean;
  proofHint: string;
  visionRoute: "/vision/shooting-session" | "/vision/run-wearable" | "/golf/start" | "/vision/activity-practice" | null;
  shootingSessionType?: ShootingSessionType;
  timeLimitSec?: number;
  golfFormat?: GolfFormat;
  leaderboardSlug?: string;
  recordSlug?: string;
  scoreFromAi: "makes" | "streak" | "reported_score" | "carry_yards" | "none";
  usesShotTracker?: boolean;
  usesGolfAi?: boolean;
  usesWearableSync?: boolean;
  recordingRequirements: string[];
  submitChecklist: string[];
};

const DEFAULT_PROFILE: InPersonVisionProfile = {
  sportKey: "other",
  mode: "match_proof",
  proofRequired: true,
  proofHint: "Upload proof for AI or wearable validation.",
  visionRoute: null,
  scoreFromAi: "none",
  recordingRequirements: [],
  submitChecklist: [],
};

function profileFromSpec(slug: string): InPersonVisionProfile {
  const s = getInPersonGameSpec(slug);
  if (!s) return { ...DEFAULT_PROFILE, recordSlug: slug };

  const mode: InPersonVisionMode =
    s.validatorKind === "wearable_sync" ? "wearable_sync" : s.mode;

  return {
    sportKey: s.sportKey as SportKey,
    mode,
    proofRequired: s.proofRequired,
    proofHint: s.proofHint,
    visionRoute: s.visionRoute,
    shootingSessionType: s.shootingSessionType,
    timeLimitSec: s.timeLimitSec,
    golfFormat: s.golfFormat,
    leaderboardSlug: s.slug,
    recordSlug: s.slug,
    scoreFromAi: s.scoreFromAi === "streak" ? "makes" : s.scoreFromAi,
    usesShotTracker: s.usesShotTracker,
    usesGolfAi: s.usesGolfAi,
    usesWearableSync: s.usesWearableSync,
    recordingRequirements: s.recordingRequirements,
    submitChecklist: s.submitChecklist,
  };
}

const GAME_TYPE_ALIASES: Record<string, string> = {
  "basketball 1v1": "twenty_one_1v1",
  "irl: 1v1 basketball": "twenty_one_1v1",
  "basketball 3v3": "three_v_three_to_21",
  "irl: 3v3 basketball": "three_v_three_to_21",
  "basketball 5v5": "five_v_five_full_court",
  "irl: 5v5 basketball": "five_v_five_full_court",
  horse: "horse_rounds_survived",
  "irl: horse": "horse_rounds_survived",
  knockout: "knockout_survivor_rounds",
  "irl: knockout": "knockout_survivor_rounds",
  "around the world": "around_the_world_spots",
  "irl: around the world": "around_the_world_spots",
  "golf closest to pin": "closest_to_pin_feet",
  "closest to pin": "closest_to_pin_feet",
  "free throw streak": "free_throw_streak",
  "3pt streak": "three_point_streak",
  "pickleball 2v2": "pickleball_two_v_two_to_11",
  "irl: pickleball 2v2": "pickleball_two_v_two_to_11",
  "soccer penalties": "soccer_penalty_streak",
  "irl: soccer penalties": "soccer_penalty_streak",
  "irl: golf / longest carry": "carry_distance_yards",
  "irl: mile / run": "mile_run",
};

const SLUG_PROFILES: Record<string, InPersonVisionProfile> = Object.fromEntries(
  listActiveInPersonGameSpecs().map((s) => [s.slug, profileFromSpec(s.slug)])
);

const KEYWORD_RULES: { test: (gt: string) => boolean; slug: string }[] = [
  { test: (gt) => gt.includes("3pt streak") || gt.includes("3-point streak"), slug: "three_point_streak" },
  { test: (gt) => gt.includes("3pt") || gt.includes("3-point") || gt.includes("three point"), slug: "three_pointers_60s" },
  { test: (gt) => gt.includes("free throw streak"), slug: "free_throw_streak" },
  { test: (gt) => gt.includes("free throw"), slug: "free_throws_100" },
  { test: (gt) => gt.includes("closest") && gt.includes("pin"), slug: "closest_to_pin_feet" },
  { test: (gt) => gt.includes("carry") || gt.includes("longest drive"), slug: "carry_distance_yards" },
  { test: (gt) => gt.includes("golf") || gt.includes("range"), slug: "long_drive_yards" },
  { test: (gt) => gt.includes("mile") || gt.includes("5k") || gt.includes("run"), slug: "mile_run" },
  { test: (gt) => gt.includes("horse"), slug: "horse_rounds_survived" },
  { test: (gt) => gt.includes("knockout"), slug: "knockout_survivor_rounds" },
  { test: (gt) => gt.includes("around the world"), slug: "around_the_world_spots" },
  { test: (gt) => gt.includes("pickleball"), slug: "pickleball_two_v_two_to_11" },
  { test: (gt) => gt.includes("penalt") || gt.includes("soccer"), slug: "soccer_penalty_streak" },
  { test: (gt) => gt.includes("tennis"), slug: "tennis_serve_speed_mph" },
  { test: (gt) => gt.includes("volleyball"), slug: "volleyball_serve_targets_20" },
  { test: (gt) => gt.includes("frisbee"), slug: "frisbee_target_hits_20" },
  { test: (gt) => gt.includes("burpee") || gt.includes("pushup") || gt.includes("plank"), slug: "burpees_2m" },
  { test: (gt) => gt.includes("basketball") || gt.includes("1v1") || gt.includes("3v3") || gt.includes("5v5"), slug: "twenty_one_1v1" },
];

function normalizeGameType(gameType: string): string {
  return String(gameType ?? "")
    .toLowerCase()
    .trim()
    .replace(/^irl:\s*/i, "");
}

export function resolveInPersonVisionProfileFromSlug(slug: string): InPersonVisionProfile {
  if (isRetiredInPersonSlug(slug)) return DEFAULT_PROFILE;
  return SLUG_PROFILES[slug] ?? profileFromSpec(slug);
}

export function resolveInPersonVisionProfile(gameType: string | null | undefined): InPersonVisionProfile {
  const raw = String(gameType ?? "").trim();
  if (!raw) return DEFAULT_PROFILE;

  const normalized = normalizeGameType(raw);
  const aliasSlug = GAME_TYPE_ALIASES[normalized];
  if (aliasSlug && SLUG_PROFILES[aliasSlug]) return SLUG_PROFILES[aliasSlug];

  if (SLUG_PROFILES[raw] || SLUG_PROFILES[normalized]) {
    return SLUG_PROFILES[raw] ?? SLUG_PROFILES[normalized];
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.test(normalized)) return SLUG_PROFILES[rule.slug] ?? profileFromSpec(rule.slug);
  }

  return DEFAULT_PROFILE;
}

export function listAllInPersonVisionProfiles(): InPersonVisionProfile[] {
  return Object.values(SLUG_PROFILES);
}

export function visionDeepLink(
  profile: InPersonVisionProfile,
  challengeId: string
): string | null {
  if (!profile.visionRoute) return null;
  const base = profile.visionRoute;
  const params = new URLSearchParams({ challengeId });
  if (profile.shootingSessionType) params.set("sessionType", profile.shootingSessionType);
  if (profile.timeLimitSec) params.set("timeLimitSec", String(profile.timeLimitSec));
  if (profile.golfFormat) params.set("golfFormat", profile.golfFormat);
  if (profile.recordSlug) params.set("recordSlug", profile.recordSlug);
  return `${base}?${params.toString()}`;
}
