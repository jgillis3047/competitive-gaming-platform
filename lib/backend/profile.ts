// lib/backend/profile.ts
import { supabase } from "./supabaseClient";
import { getBadgeDefinition } from "../data/badgeDefinitions";

export type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string | null;
  rating?: number | null;
};

/**
 * Ensure there is a row in `profiles` for this user.
 * - If it exists, return it.
 * - If not, create a minimal row and return it.
 */
export async function ensureProfileExists(userId: string): Promise<ProfileRow> {
  // 1) Try to load existing profile
  const {
    data: existing,
    error: lookupError,
  } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (lookupError) {
    console.warn("[profiles] ensureProfileExists lookup error:", lookupError);
    throw lookupError;
  }

  if (existing) {
    return existing as ProfileRow;
  }

  // 2) Create a new minimal profile
  const {
    data: created,
    error: insertError,
  } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (insertError) {
    console.warn("[profiles] ensureProfileExists insert error:", insertError);
    throw insertError;
  }

  return created as ProfileRow;
}

/** Search profiles by username, display_name, or email (for invites, search, etc.) */
export async function searchProfilesByUsername(query: string, limit = 20): Promise<ProfileRow[]> {
  const q = String(query ?? "").trim();
  if (!q || q.length < 2) return [];

  const { data, error } = await supabase.rpc("search_profiles", {
    p_query: q,
    p_limit: limit,
  });

  if (error) return [];
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    username: r.username ?? null,
    display_name: r.display_name ?? null,
    avatar_url: r.avatar_url ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at ?? null,
  })) as ProfileRow[];
}

/** Get a single profile by id (for public user profile). */
export async function getProfileById(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    username: (r.username as string) ?? null,
    display_name: (r.display_name as string) ?? null,
    avatar_url: (r.avatar_url as string) ?? null,
    created_at: r.created_at as string,
    updated_at: (r.updated_at as string) ?? null,
    rating: typeof r.rating === "number" ? r.rating : null,
  };
}

/** Stats for public profile: rating, completed challenges, wins, post count */
export type ProfileStats = {
  rating: number | null;
  completedChallenges: number;
  wins: number;
  postCount: number;
};

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const empty: ProfileStats = { rating: null, completedChallenges: 0, wins: 0, postCount: 0 };
  if (!userId) return empty;

  const [profileRes, completedRes, winsRes, postsRes] = await Promise.all([
    supabase.from("profiles").select("rating").eq("id", userId).maybeSingle(),
    supabase
      .from("challenge_players")
      .select("challenge_id, challenges!inner(status)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("challenges.status", "completed"),
    supabase.from("challenges").select("id", { count: "exact", head: true }).eq("winner_user_id", userId),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId).is("parent_post_id", null),
  ]);

  return {
    rating: typeof profileRes.data?.rating === "number" ? profileRes.data.rating : null,
    completedChallenges: completedRes.count ?? 0,
    wins: winsRes.count ?? 0,
    postCount: postsRes.count ?? 0,
  };
}

/** Full public profile data: profile, stats, record, badges, challenges, teams, leagues, follow/block */
export type PublicProfileData = {
  profile: ProfileRow | null;
  stats: ProfileStats;
  record: { wins: number; losses: number; ties: number; totalPlayed: number; winRate: number; streak: number };
  perGameStats: { game: string; wins: number; losses: number; ties: number }[];
  badges: { key: string; label: string; earnedAt?: string }[];
  challenges: any[];
  teams: any[];
  leagues: any[];
  friendCounts: { followers: number; following: number; friends: number };
  iRequestedThem: boolean;
  blockStatus: { iBlockedThem: boolean; theyBlockedMe: boolean };
};

export async function getPublicProfileData(
  userId: string,
  viewerId?: string | null
): Promise<PublicProfileData> {
  const emptyRecord = { wins: 0, losses: 0, ties: 0, totalPlayed: 0, winRate: 0, streak: 0 };
  const empty: PublicProfileData = {
    profile: null,
    stats: { rating: null, completedChallenges: 0, wins: 0, postCount: 0 },
    record: emptyRecord,
    perGameStats: [],
    badges: [],
    challenges: [],
    teams: [],
    leagues: [],
    friendCounts: { followers: 0, following: 0, friends: 0 },
    iRequestedThem: false,
    blockStatus: { iBlockedThem: false, theyBlockedMe: false },
  };
  if (!userId) return empty;

  const { fetchChallengesForUserWithStats } = await import("./challenges");
  const { listTeamsForUser } = await import("./teams");
  const { listLeaguesForUser } = await import("./leagues");
  const { hasSentFriendRequest, getFriendCounts } = await import("./friends");
  const { getBlockStatus } = await import("./blockedUsers");

  const badgePromise: Promise<{ badge_key: string; earned_at?: string }[]> = (async () => {
    try {
      const r = await supabase.from("user_badges").select("badge_key, earned_at").eq("user_id", userId);
      return (r.data ?? []) as { badge_key: string; earned_at?: string }[];
    } catch {
      return [];
    }
  })();

  const [profile, stats, challengeData, teams, leagues, badgeData, friendCounts, iRequestedThem, blockStatus] = await Promise.all([
    getProfileById(userId),
    getProfileStats(userId),
    fetchChallengesForUserWithStats(userId),
    listTeamsForUser(userId),
    listLeaguesForUser(userId),
    badgePromise,
    getFriendCounts(userId),
    viewerId ? hasSentFriendRequest(viewerId, userId) : Promise.resolve(false),
    viewerId ? getBlockStatus(viewerId, userId) : Promise.resolve({ iBlockedThem: false, theyBlockedMe: false }),
  ]);
  const dbBadgesByKey = new Map(badgeData.map((r: { badge_key: string; earned_at?: string }) => [r.badge_key, r]));
  const computedKeys = new Set(challengeData.computedBadges.map((b: { key: string }) => b.key));
  const badges = [
    ...challengeData.computedBadges.map((b: { key: string; label: string }) => ({
      key: b.key,
      label: b.label,
      earnedAt: dbBadgesByKey.get(b.key)?.earned_at,
    })),
    ...badgeData
      .filter((r: { badge_key: string }) => !computedKeys.has(r.badge_key))
      .map((r: { badge_key: string; earned_at?: string }) => {
        const def = getBadgeDefinition(r.badge_key);
        return {
          key: r.badge_key,
          label: def?.label ?? r.badge_key.replace(/_/g, " "),
          earnedAt: r.earned_at,
        };
      }),
  ];

  return {
    profile,
    stats,
    record: challengeData.record,
    perGameStats: challengeData.perGameStats,
    badges,
    challenges: challengeData.challenges,
    teams: teams ?? [],
    leagues: leagues ?? [],
    friendCounts: friendCounts ?? { followers: 0, following: 0, friends: 0 },
    iRequestedThem: iRequestedThem ?? false,
    blockStatus: blockStatus ?? { iBlockedThem: false, theyBlockedMe: false },
  };
}
