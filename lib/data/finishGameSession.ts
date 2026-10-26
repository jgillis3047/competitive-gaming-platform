import { getTodayDailyChallenge, markDailyChallengeCompleted } from "./dailyChallenge";
import { GAME_CONFIG } from "./gameConfig";
import { getGameProgress, recordGameAttempt, type GameProgress } from "./gameProgress";
import {
  appendPracticeHistoryEntry,
  formatPhoneHistoryScore,
} from "./practiceHistory";

export type FinishGameSessionInput = {
  gameKey: string;
  score?: number | null;
  timeSec?: number | null;
  /** When true, append to practice history (solo practice runs only). */
  logPracticeHistory?: boolean;
};

export type FinishGameSessionResult = {
  progress: GameProgress;
  previous: GameProgress;
  beatBestScore: boolean;
  beatBestTime: boolean;
  isPersonalBest: boolean;
  isDailyGame: boolean;
  dailyJustCompleted: boolean;
};

export async function finishGameSession(input: FinishGameSessionInput): Promise<FinishGameSessionResult> {
  const gameKey = String(input.gameKey ?? "").trim();
  const previous = await getGameProgress(gameKey);
  const progress = await recordGameAttempt({
    gameKey,
    score: input.score,
    timeSec: input.timeSec,
  });

  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : null;
  const timeSec = typeof input.timeSec === "number" && Number.isFinite(input.timeSec) ? input.timeSec : null;

  const beatBestScore =
    score != null && (previous.bestScore == null || score > previous.bestScore);
  const beatBestTime =
    timeSec != null && (previous.bestTimeSec == null || timeSec < previous.bestTimeSec);
  const isPersonalBest = beatBestScore || beatBestTime;

  const daily = await getTodayDailyChallenge();
  const isDailyGame = daily.gameKey === gameKey || daily.config.key === gameKey;
  let dailyJustCompleted = false;

  if (isDailyGame && !daily.completed) {
    await markDailyChallengeCompleted(daily.dayKey, gameKey);
    dailyJustCompleted = true;
  }

  if (input.logPracticeHistory) {
    const title = GAME_CONFIG[gameKey]?.title ?? gameKey;
    const scoreLabel = formatPhoneHistoryScore(gameKey, score, timeSec);
    const parts: string[] = [];
    if (scoreLabel) parts.push(scoreLabel);
    if (isPersonalBest) parts.push("New best");
    await appendPracticeHistoryEntry({
      kind: "phone",
      title,
      scoreLabel,
      subtitle: parts.length ? parts.join(" · ") : "Practice run",
      isPersonalBest,
      route: GAME_CONFIG[gameKey]?.phoneRoute ?? null,
    }).catch(() => {});
  }

  return {
    progress,
    previous,
    beatBestScore,
    beatBestTime,
    isPersonalBest,
    isDailyGame,
    dailyJustCompleted,
  };
}

export function formatGameTime(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec)) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
