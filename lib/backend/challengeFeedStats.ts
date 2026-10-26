import { supabase } from "./supabaseClient";

export type GameFeedStats = {
  playsToday: number;
  lastWinnerName: string | null;
  lastWinnerPrizeCents: number | null;
  avgDurationSec: number | null;
};

/** Normalize to match SQL: lower(trim(game_type)) */
export function gameTypeKeyFromChallenge(challenge: { gameType?: string | null; game_type?: string | null }): string {
  const raw = String(challenge?.gameType ?? challenge?.game_type ?? "").trim();
  return raw.toLowerCase();
}

/**
 * Per-game aggregates for feed cards: plays today (UTC day), last winner, avg match length (30d window).
 */
export async function fetchFeedGameStats(): Promise<Map<string, GameFeedStats>> {
  const map = new Map<string, GameFeedStats>();
  const { data, error } = await supabase.rpc("get_feed_game_stats");
  if (error) {
    console.warn("[fetchFeedGameStats]", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const key = String((row as any).game_type_key ?? "").toLowerCase();
    if (!key) continue;
    map.set(key, {
      playsToday: Number((row as any).plays_today ?? 0) || 0,
      lastWinnerName:
        typeof (row as any).last_winner_username === "string" && (row as any).last_winner_username.trim().length
          ? (row as any).last_winner_username.trim()
          : null,
      lastWinnerPrizeCents:
        (row as any).last_winner_prize_cents != null ? Number((row as any).last_winner_prize_cents) : null,
      avgDurationSec:
        (row as any).avg_duration_sec != null && Number.isFinite(Number((row as any).avg_duration_sec))
          ? Number((row as any).avg_duration_sec)
          : null,
    });
  }
  return map;
}
