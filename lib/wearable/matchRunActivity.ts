// lib/wearable/matchRunActivity.ts — Match imported workout to leaderboard slug

import { getInPersonGameSpec } from "../data/inPersonGameSpecs";
import type { WearableMatchResult, WearableWorkoutSample } from "./types";

const DISTANCE_TOLERANCE_PCT = 0.08;
const TIME_TOLERANCE_PCT = 0.03;

function withinPct(actual: number, expected: number, pct: number): boolean {
  if (expected <= 0) return true;
  const delta = Math.abs(actual - expected) / expected;
  return delta <= pct;
}

export function matchWorkoutToRunSlug(
  recordSlug: string,
  workout: WearableWorkoutSample,
  reportedTimeSec?: number | null
): WearableMatchResult {
  const spec = getInPersonGameSpec(recordSlug);
  const flags: string[] = [];
  const suggestedTimeSec = workout.durationSec;
  const suggestedDistanceM = workout.distanceM;

  if (!spec || spec.validatorKind !== "wearable_sync") {
    return {
      matches: false,
      flags: ["invalid_slug"],
      suggestedTimeSec,
      suggestedDistanceM,
    };
  }

  const expectedM = spec.expectedDistanceM ?? 0;
  if (expectedM > 0 && workout.distanceM != null) {
    if (!withinPct(workout.distanceM, expectedM, DISTANCE_TOLERANCE_PCT)) {
      flags.push(`distance_mismatch:${Math.round(workout.distanceM)}m_vs_${expectedM}m`);
    }
  } else if (expectedM > 0 && workout.distanceM == null) {
    flags.push("distance_not_in_import");
  }

  if (recordSlug === "stair_sprint_10_flights") {
    const flights = workout.flightsClimbed;
    if (flights != null && flights < 10) {
      flags.push(`flights_short:${flights}`);
    } else if (flights == null) {
      flags.push("flights_not_in_import");
    }
  }

  if (reportedTimeSec != null && reportedTimeSec > 0) {
    if (!withinPct(reportedTimeSec, workout.durationSec, TIME_TOLERANCE_PCT)) {
      flags.push("reported_time_mismatch");
    }
  }

  const activityDay = new Date(workout.startDateIso).toDateString();
  const today = new Date().toDateString();
  if (activityDay !== today) {
    flags.push("activity_not_today");
  }

  const blocking = flags.some((f) =>
    f.startsWith("distance_mismatch") || f.startsWith("flights_short") || f === "invalid_slug"
  );

  return {
    matches: !blocking,
    flags,
    suggestedTimeSec,
    suggestedDistanceM,
  };
}
