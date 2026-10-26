import AsyncStorage from "@react-native-async-storage/async-storage";

import { GAME_CONFIG, getGameConfig, type GameConfig } from "./gameConfig";

/** Phone games eligible for the rotating daily challenge */
export const DAILY_PHONE_GAME_KEYS = [
  "Math Race",
  "Math 24",
  "Sudoku Race",
  "Anagrams",
  "Unscramble Word",
  "Match Cards",
  "Number Pattern",
  "2048",
  "Checkers",
  "Chess",
] as const;

export type DailyChallengeInfo = {
  dayKey: string;
  gameKey: string;
  config: GameConfig;
  route: string;
  completed: boolean;
};

const STORAGE_KEY = "arena:daily_challenge_completed";

function dayKeyFromDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function getDailyChallengeForDate(d = new Date()): DailyChallengeInfo {
  const dayKey = dayKeyFromDate(d);
  const idx = hashString(dayKey) % DAILY_PHONE_GAME_KEYS.length;
  const gameKey = DAILY_PHONE_GAME_KEYS[idx];
  const config = getGameConfig(gameKey) ?? GAME_CONFIG[gameKey];
  const route = config?.phoneRoute ?? "/phone-games";
  return { dayKey, gameKey, config, route, completed: false };
}

async function readCompletedMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function isDailyChallengeCompleted(dayKey: string): Promise<boolean> {
  const map = await readCompletedMap();
  return Boolean(map[dayKey]);
}

/** Mark today complete when the player finishes the featured daily game */
export async function markDailyChallengeCompleted(dayKey: string, gameKey: string): Promise<void> {
  const map = await readCompletedMap();
  map[dayKey] = gameKey;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export async function getTodayDailyChallenge(): Promise<DailyChallengeInfo> {
  const info = getDailyChallengeForDate(new Date());
  const completed = await isDailyChallengeCompleted(info.dayKey);
  return { ...info, completed };
}

export function listPhoneGamesForHub() {
  return Object.values(GAME_CONFIG)
    .filter((g) => g.mode === "phone" && g.phoneRoute)
    .sort((a, b) => a.title.localeCompare(b.title));
}
