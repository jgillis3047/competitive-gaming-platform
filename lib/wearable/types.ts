import type { WearableProvider } from "../data/inPersonGameSpecs";

export type WearableImportSource = "apple_health" | "garmin_gpx" | "manual";

export type WearableWorkoutSample = {
  source: WearableImportSource;
  provider: WearableProvider;
  durationSec: number;
  distanceM: number | null;
  startDateIso: string;
  endDateIso: string;
  activityLabel: string;
  externalId?: string;
  flightsClimbed?: number | null;
};

export type WearableImportResult =
  | { ok: true; workouts: WearableWorkoutSample[] }
  | { ok: false; error: string; needsDevBuild?: boolean };

export type WearableMatchResult = {
  matches: boolean;
  flags: string[];
  suggestedTimeSec: number;
  suggestedDistanceM: number | null;
};
