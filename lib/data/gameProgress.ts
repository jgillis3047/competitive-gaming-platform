import AsyncStorage from "@react-native-async-storage/async-storage";

export type GameProgress = {
  plays: number;
  bestScore: number | null;
  bestTimeSec: number | null;
  dailyStreak: number;
  lastPlayedAt: string | null;
};

export type RecordGameAttemptInput = {
  gameKey: string;
  score?: number | null;
  timeSec?: number | null;
};

const KEY_PREFIX = "arena:game_progress:";

function keyFor(gameKey: string) {
  return `${KEY_PREFIX}${String(gameKey).trim().toLowerCase()}`;
}

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function nextProgress(prev: GameProgress, score?: number | null, timeSec?: number | null): GameProgress {
  const now = new Date();
  const last = prev.lastPlayedAt ? new Date(prev.lastPlayedAt) : null;

  let dailyStreak = prev.dailyStreak || 0;
  if (!last) {
    dailyStreak = 1;
  } else {
    const diffDays = Math.floor((startOfDayMs(now) - startOfDayMs(last)) / 86_400_000);
    if (diffDays === 0) dailyStreak = prev.dailyStreak || 1;
    else if (diffDays === 1) dailyStreak = (prev.dailyStreak || 0) + 1;
    else dailyStreak = 1;
  }

  const safeScore = typeof score === "number" && Number.isFinite(score) ? score : null;
  const safeTime = typeof timeSec === "number" && Number.isFinite(timeSec) ? timeSec : null;

  return {
    plays: (prev.plays || 0) + 1,
    bestScore:
      safeScore == null
        ? prev.bestScore
        : prev.bestScore == null
          ? safeScore
          : Math.max(prev.bestScore, safeScore),
    bestTimeSec:
      safeTime == null
        ? prev.bestTimeSec
        : prev.bestTimeSec == null
          ? safeTime
          : Math.min(prev.bestTimeSec, safeTime),
    dailyStreak,
    lastPlayedAt: now.toISOString(),
  };
}

export async function getGameProgress(gameKey: string): Promise<GameProgress> {
  const raw = await AsyncStorage.getItem(keyFor(gameKey));
  if (!raw) {
    return { plays: 0, bestScore: null, bestTimeSec: null, dailyStreak: 0, lastPlayedAt: null };
  }
  try {
    const p = JSON.parse(raw) as GameProgress;
    return {
      plays: Number(p?.plays ?? 0),
      bestScore: typeof p?.bestScore === "number" ? p.bestScore : null,
      bestTimeSec: typeof p?.bestTimeSec === "number" ? p.bestTimeSec : null,
      dailyStreak: Number(p?.dailyStreak ?? 0),
      lastPlayedAt: typeof p?.lastPlayedAt === "string" ? p.lastPlayedAt : null,
    };
  } catch {
    return { plays: 0, bestScore: null, bestTimeSec: null, dailyStreak: 0, lastPlayedAt: null };
  }
}

export async function recordGameAttempt(input: RecordGameAttemptInput): Promise<GameProgress> {
  const gameKey = String(input.gameKey ?? "").trim();
  if (!gameKey) throw new Error("Missing game key.");
  const prev = await getGameProgress(gameKey);
  const next = nextProgress(prev, input.score, input.timeSec);
  await AsyncStorage.setItem(keyFor(gameKey), JSON.stringify(next));
  return next;
}
