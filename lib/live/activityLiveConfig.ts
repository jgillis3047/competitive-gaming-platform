import { getInPersonGameSpec, type AiValidatorKind } from "../data/inPersonGameSpecs";
import type { LiveCounterMode } from "./types";

export type LiveRecordConfig = {
  mode: LiveCounterMode;
  timeLimitSec: number | null;
  title: string;
  hint: string;
  showMakeMiss: boolean;
  showRepButton: boolean;
  showStreak: boolean;
  showStopwatch: boolean;
  primaryScoreFromLive: "makes" | "reps" | "streak" | "bestStreak" | "elapsedSec" | null;
};

const NONE: LiveRecordConfig = {
  mode: "timer_only",
  timeLimitSec: null,
  title: "Record",
  hint: "Live timer while you film proof.",
  showMakeMiss: false,
  showRepButton: false,
  showStreak: false,
  showStopwatch: false,
  primaryScoreFromLive: null,
};

export function liveRecordConfigForSlug(recordSlug: string | null | undefined): LiveRecordConfig {
  if (!recordSlug) return NONE;
  const spec = getInPersonGameSpec(recordSlug);
  if (!spec) return NONE;

  if (spec.validatorKind === "wearable_sync") {
    return { ...NONE, mode: "timer_only", title: spec.title };
  }

  if (spec.validatorKind === "shot_tracker") {
    const isStreak = spec.scoreFromAi === "streak" || recordSlug.includes("streak");
    return {
      mode: isStreak ? "streak" : "shots",
      timeLimitSec: spec.timeLimitSec ?? null,
      title: spec.title,
      hint: isStreak
        ? "Tap MAKE after each shot. Live streak updates instantly. Server still validates arc/line rules."
        : "Tap MAKE or MISS after each attempt. Live stats update on screen. Server analysis is official.",
      showMakeMiss: true,
      showRepButton: false,
      showStreak: true,
      showStopwatch: false,
      primaryScoreFromLive: isStreak ? "bestStreak" : "makes",
    };
  }

  if (spec.validatorKind === "vision_streak") {
    return {
      mode: "streak",
      timeLimitSec: spec.timeLimitSec ?? null,
      title: spec.title,
      hint: "Tap MAKE or MISS. Live streak tracks consecutive makes.",
      showMakeMiss: true,
      showRepButton: false,
      showStreak: true,
      showStopwatch: false,
      primaryScoreFromLive: "bestStreak",
    };
  }

  if (spec.validatorKind === "vision_time") {
    return {
      mode: "stopwatch",
      timeLimitSec: spec.timeLimitSec ?? null,
      title: spec.title,
      hint: "Live stopwatch runs while recording. Your elapsed time is suggested as the score.",
      showMakeMiss: false,
      showRepButton: false,
      showStreak: false,
      showStopwatch: true,
      primaryScoreFromLive: "elapsedSec",
    };
  }

  if (spec.validatorKind === "vision_count") {
    return {
      mode: "reps",
      timeLimitSec: spec.timeLimitSec ?? null,
      title: spec.title,
      hint: spec.timeLimitSec
        ? `Tap +1 after each rep. ${spec.timeLimitSec}s countdown auto-stops recording.`
        : "Tap +1 after each rep or hit. Live rep counter on screen.",
      showMakeMiss: false,
      showRepButton: true,
      showStreak: false,
      showStopwatch: false,
      primaryScoreFromLive: "reps",
    };
  }

  if (
    spec.validatorKind === "vision_match" ||
    spec.validatorKind === "vision_distance" ||
    spec.validatorKind === "golf_vision"
  ) {
    return {
      mode: "timer_only",
      timeLimitSec: spec.timeLimitSec ?? null,
      title: spec.title,
      hint: "Live recording timer. State your final score on camera at the end.",
      showMakeMiss: false,
      showRepButton: false,
      showStreak: false,
      showStopwatch: true,
      primaryScoreFromLive: null,
    };
  }

  return NONE;
}

export function supportsLiveRecord(
  recordSlug: string | null | undefined,
  validatorKind?: AiValidatorKind
): boolean {
  if (!recordSlug) return true;
  const spec = getInPersonGameSpec(recordSlug);
  if (!spec) return validatorKind !== "wearable_sync";
  if (spec.validatorKind === "wearable_sync") return false;
  if (!spec.requiresVideo && spec.validatorKind === "vision_count") {
    return false;
  }
  return true;
}

export function primaryLiveScore(
  config: LiveRecordConfig,
  snap: { makes: number; reps: number; bestStreak: number; elapsedSec: number }
): number | null {
  switch (config.primaryScoreFromLive) {
    case "makes":
      return snap.makes > 0 ? snap.makes : null;
    case "reps":
      return snap.reps > 0 ? snap.reps : null;
    case "streak":
    case "bestStreak":
      return snap.bestStreak > 0 ? snap.bestStreak : null;
    case "elapsedSec":
      return snap.elapsedSec > 0 ? Math.round(snap.elapsedSec * 10) / 10 : null;
    default:
      return null;
  }
}
