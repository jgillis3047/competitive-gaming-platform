export type LiveCounterMode = "shots" | "reps" | "streak" | "stopwatch" | "timer_only";

export type LiveCounterSnapshot = {
  attempts: number;
  makes: number;
  misses: number;
  reps: number;
  streak: number;
  bestStreak: number;
  elapsedSec: number;
};

export const EMPTY_LIVE_COUNTERS: LiveCounterSnapshot = {
  attempts: 0,
  makes: 0,
  misses: 0,
  reps: 0,
  streak: 0,
  bestStreak: 0,
  elapsedSec: 0,
};
