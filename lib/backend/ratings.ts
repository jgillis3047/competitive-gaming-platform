import { supabase } from "./supabaseClient";
import { getGameConfig } from "../data/gameConfig";

export type UserGameRating = {
  gameType: string;
  gameTitle: string;
  rating: number;
  gamesPlayed: number;
};

export type RatingStandings = {
  globalRank: number | null;
  globalTotal: number | null;
};

export type GameRatingStandings = {
  gameType: string;
  rank: number | null;
  total: number | null;
};

/** Global ladder position by overall ELO. */
export async function getRatingStandings(userId: string, rating: number): Promise<RatingStandings> {
  if (!userId) return { globalRank: null, globalTotal: null };
  try {
    const [{ count: above }, { count: total }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("rating", rating),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    const rank = typeof above === "number" ? above + 1 : null;
    return { globalRank: rank, globalTotal: typeof total === "number" ? total : null };
  } catch {
    return { globalRank: null, globalTotal: null };
  }
}

/** Per-game ladder position for a user's rating in one game type. */
export async function getGameRatingStandings(
  userId: string,
  gameType: string,
  rating: number
): Promise<GameRatingStandings> {
  if (!userId || !gameType) return { gameType, rank: null, total: null };
  try {
    const [{ count: above }, { count: total }] = await Promise.all([
      supabase
        .from("user_game_ratings")
        .select("user_id", { count: "exact", head: true })
        .eq("game_type", gameType)
        .gt("rating", rating),
      supabase
        .from("user_game_ratings")
        .select("user_id", { count: "exact", head: true })
        .eq("game_type", gameType),
    ]);
    return {
      gameType,
      rank: typeof above === "number" ? above + 1 : null,
      total: typeof total === "number" ? total : null,
    };
  } catch {
    return { gameType, rank: null, total: null };
  }
}
export async function getUserGameRatings(userId: string): Promise<UserGameRating[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from("user_game_ratings")
      .select("game_type, rating, games_played")
      .eq("user_id", userId)
      .order("rating", { ascending: false });
    if (error) return [];
    return (data ?? []).map((row: any) => {
      const gameType = String(row.game_type ?? "");
      const cfg = getGameConfig(gameType);
      return {
        gameType,
        gameTitle: cfg?.title ?? gameType,
        rating: Number(row.rating ?? 1000),
        gamesPlayed: Number(row.games_played ?? 0),
      };
    });
  } catch {
    return [];
  }
}
