// lib/data/practiceProgress.ts — Local personal bests for in-person practice

import { getLeaderboardCategory } from "./leaderboardTaxonomy";
import { getGameProgress, recordGameAttempt, type GameProgress } from "./gameProgress";
import {
  appendPracticeHistoryEntry,
  formatActivityHistoryScore,
} from "./practiceHistory";
import { practiceRouteForRecordSlug } from "./practiceMode";

export function practiceGameKey(recordSlug: string): string {
  return `practice:${String(recordSlug).trim()}`;
}

export async function getPracticeProgress(recordSlug: string): Promise<GameProgress> {
  return getGameProgress(practiceGameKey(recordSlug));
}

export type RecordPracticeAttemptMeta = {
  scoreLabel?: string;
  aiSummary?: string | null;
  aiVerdict?: string | null;
  isPersonalBest?: boolean;
};

export async function recordPracticeAttempt(
  recordSlug: string,
  scoreValue: number,
  meta?: RecordPracticeAttemptMeta
): Promise<GameProgress> {
  const cat = getLeaderboardCategory(recordSlug);
  const gameKey = practiceGameKey(recordSlug);
  const prev = await getGameProgress(gameKey);

  let progress: GameProgress;
  if (
    cat &&
    !cat.higherIsBetter &&
    (cat.scoreUnit === "seconds" || cat.scoreUnit === "minutes")
  ) {
    const timeSec = cat.scoreUnit === "minutes" ? scoreValue * 60 : scoreValue;
    progress = await recordGameAttempt({ gameKey, timeSec });
  } else {
    progress = await recordGameAttempt({ gameKey, score: scoreValue });
  }

  const scoreLabel = meta?.scoreLabel ?? formatActivityHistoryScore(recordSlug, scoreValue);
  const isPersonalBest =
    meta?.isPersonalBest ??
    (cat && !cat.higherIsBetter
      ? prev.bestTimeSec == null ||
        (cat.scoreUnit === "minutes" ? scoreValue * 60 : scoreValue) < (prev.bestTimeSec ?? Infinity)
      : prev.bestScore == null || scoreValue > (prev.bestScore ?? -Infinity));

  await appendPracticeHistoryEntry({
    kind: "activity",
    title: cat?.title ?? recordSlug.replace(/_/g, " "),
    scoreLabel,
    subtitle: meta?.aiSummary ? undefined : "Practice session",
    aiSummary: meta?.aiSummary ?? null,
    aiVerdict: meta?.aiVerdict ?? null,
    isPersonalBest,
    route: practiceRouteForRecordSlug(recordSlug),
  }).catch(() => {});

  return progress;
}
