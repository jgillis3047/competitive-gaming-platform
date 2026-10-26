// lib/backend/leaderboards.ts
import { supabase } from "./supabaseClient";
import { EGAME_CATEGORIES } from "../data/leaderboardTaxonomy";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  value: number;
};

export type LeaderboardType = "wins" | "rating" | "streak" | "winRate";
export type ArenaScope = "global" | "friends";

export type GameLeaderboardEntry = {
  rank: number;
  subjectId: string;
  subjectLabel: string;
  avatarUrl: string | null;
  value: number;
  isTeam: boolean;
};

export async function getGlobalLeaderboard(type: LeaderboardType, limit = 50): Promise<LeaderboardEntry[]> {
  if (type === "wins") return getWinsLeaderboard(limit);
  if (type === "rating") return getRatingLeaderboard(limit);
  if (type === "streak") return getStreakLeaderboard(limit);
  if (type === "winRate") return getWinRateLeaderboard(limit);
  return [];
}

export async function getFriendsLeaderboard(userId: string, type: LeaderboardType, limit = 50): Promise<LeaderboardEntry[]> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);
  const followerIds = new Set((followersRes.data ?? []).map((r: any) => r.follower_id));
  const followingIds = (followingRes.data ?? []).map((r: any) => r.following_id);
  const friendIds = followingIds.filter((id: string) => followerIds.has(id));
  const userIds = [userId, ...friendIds];
  if (userIds.length === 0) return [];
  const global = await getGlobalLeaderboard(type, 1000);
  return global.filter((e) => userIds.includes(e.userId)).slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));
}

async function getWinsLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const { data } = await supabase.from("challenges").select("winner_user_id").not("winner_user_id", "is", null);
  if (!data) return [];
  const winCounts: Record<string, number> = {};
  for (const row of data) winCounts[row.winner_user_id] = (winCounts[row.winner_user_id] ?? 0) + 1;
  const sorted = Object.entries(winCounts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const userIds = sorted.map(([id]) => id);
  const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds);
  const pm = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return sorted.map(([id, wins], i) => ({ rank: i + 1, userId: id, username: pm.get(id)?.username ?? null, displayName: pm.get(id)?.display_name ?? null, avatarUrl: pm.get(id)?.avatar_url ?? null, value: wins }));
}

async function getRatingLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url, rating").not("rating", "is", null).order("rating", { ascending: false }).limit(limit);
  return (data ?? []).map((p: any, i) => ({ rank: i + 1, userId: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, value: p.rating ?? 1000 }));
}

async function getStreakLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const { data: players } = await supabase.from("challenge_players").select("user_id, challenges!inner(status, winner_user_id)").eq("challenges.status", "completed");
  if (!players?.length) return [];
  const userGames: Record<string, string[]> = {};
  for (const p of players as any[]) { if (!userGames[p.user_id]) userGames[p.user_id] = []; userGames[p.user_id].push(p.challenges?.winner_user_id); }
  const streaks: Record<string, number> = {};
  for (const [uid, games] of Object.entries(userGames)) { let s = 0; for (const w of games) { if (w === uid) s++; else break; } streaks[uid] = s; }
  const sorted = Object.entries(streaks).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", sorted.map(([id]) => id));
  const pm = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return sorted.map(([id, streak], i) => ({ rank: i + 1, userId: id, username: pm.get(id)?.username ?? null, displayName: pm.get(id)?.display_name ?? null, avatarUrl: pm.get(id)?.avatar_url ?? null, value: streak }));
}

async function getWinRateLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const { data: players } = await supabase.from("challenge_players").select("user_id, challenges!inner(status, winner_user_id)").eq("challenges.status", "completed");
  if (!players?.length) return [];
  const stats: Record<string, { wins: number; total: number }> = {};
  for (const p of players as any[]) { if (!stats[p.user_id]) stats[p.user_id] = { wins: 0, total: 0 }; stats[p.user_id].total++; if (p.challenges?.winner_user_id === p.user_id) stats[p.user_id].wins++; }
  const withRates = Object.entries(stats).filter(([, s]) => s.total >= 5).map(([id, s]) => ({ id, rate: Math.round((s.wins / s.total) * 100) })).sort((a, b) => b.rate - a.rate).slice(0, limit);
  const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", withRates.map((r) => r.id));
  const pm = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  return withRates.map((r, i) => ({ rank: i + 1, userId: r.id, username: pm.get(r.id)?.username ?? null, displayName: pm.get(r.id)?.display_name ?? null, avatarUrl: pm.get(r.id)?.avatar_url ?? null, value: r.rate }));
}

export async function getArenaGameLeaderboard(
  gameType: string,
  scope: ArenaScope,
  userId?: string | null,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const gt = String(gameType ?? "").trim();
  if (!gt) return [];

  let allowedUserIds: string[] | null = null;
  if (scope === "friends" && userId) {
    const [followersRes, followingRes] = await Promise.all([
      supabase.from("follows").select("follower_id").eq("following_id", userId),
      supabase.from("follows").select("following_id").eq("follower_id", userId),
    ]);
    const followerIds = new Set((followersRes.data ?? []).map((r: any) => String(r.follower_id)));
    const friendIds = (followingRes.data ?? [])
      .map((r: any) => String(r.following_id))
      .filter((id: string) => followerIds.has(id));
    allowedUserIds = [String(userId), ...friendIds];
  }

  const { data: rows, error } = await supabase
    .from("challenges")
    .select("winner_user_id")
    .eq("status", "completed")
    .eq("game_type", gt)
    .not("winner_user_id", "is", null);
  if (error || !rows) return [];

  const counts: Record<string, number> = {};
  for (const r of rows as any[]) {
    const winner = String(r.winner_user_id);
    if (allowedUserIds && !allowedUserIds.includes(winner)) continue;
    counts[winner] = (counts[winner] ?? 0) + 1;
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (!sorted.length) return [];
  const ids = sorted.map(([id]) => id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  const pm = new Map((profiles ?? []).map((p: any) => [String(p.id), p]));
  return sorted.map(([id, wins], i) => ({
    rank: i + 1,
    userId: id,
    username: pm.get(id)?.username ?? null,
    displayName: pm.get(id)?.display_name ?? null,
    avatarUrl: pm.get(id)?.avatar_url ?? null,
    value: wins,
  }));
}

export async function getEgameCategoryLeaderboard(
  categorySlug: string,
  teamMode: boolean,
  limit = 50
): Promise<GameLeaderboardEntry[]> {
  const cat = EGAME_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!cat) return [];

  const { data, error } = await supabase
    .from("king_leaderboard_entries")
    .select("entry_type,user_id,team_id,score_value")
    .eq("scope_key", `egame|${categorySlug}`)
    .eq("entry_type", teamMode ? "team" : "user")
    .order("score_value", { ascending: !cat.higherIsBetter })
    .limit(limit);
  if (error || !data?.length) return [];

  if (teamMode) {
    const teamIds = data.map((r: any) => String(r.team_id)).filter(Boolean);
    const { data: teams } = await supabase.from("teams").select("id,name,avatar_url").in("id", teamIds);
    const tm = new Map((teams ?? []).map((t: any) => [String(t.id), t]));
    return data.map((r: any, i) => {
      const id = String(r.team_id);
      const team = tm.get(id);
      return {
        rank: i + 1,
        subjectId: id,
        subjectLabel: team?.name ?? "Team",
        avatarUrl: team?.avatar_url ?? null,
        value: Number(r.score_value ?? 0),
        isTeam: true,
      };
    });
  }

  const userIds = data.map((r: any) => String(r.user_id)).filter(Boolean);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .in("id", userIds);
  const pm = new Map((profiles ?? []).map((p: any) => [String(p.id), p]));
  return data.map((r: any, i) => {
    const id = String(r.user_id);
    const p = pm.get(id);
    return {
      rank: i + 1,
      subjectId: id,
      subjectLabel: p?.display_name || p?.username || "Player",
      avatarUrl: p?.avatar_url ?? null,
      value: Number(r.score_value ?? 0),
      isTeam: false,
    };
  });
}
