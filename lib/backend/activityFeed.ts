// lib/backend/activityFeed.ts
// Social activity feed - friend wins, badges, etc.
import { supabase } from "./supabaseClient";

export type ActivityType = "challenge_win" | "badge_earned" | "new_friend" | "challenge_created";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  data: Record<string, any>;
  createdAt: string;
};

export async function getFriendsActivityFeed(userId: string, limit = 30): Promise<ActivityItem[]> {
  // Get friend IDs
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);
  const followerIds = new Set((followersRes.data ?? []).map((r: any) => r.follower_id));
  const followingIds = (followingRes.data ?? []).map((r: any) => r.following_id);
  const friendIds = followingIds.filter((id: string) => followerIds.has(id));

  if (friendIds.length === 0) return [];

  // Get recent activities from activity_feed table
  const { data: activities } = await supabase
    .from("activity_feed")
    .select("*, profiles!inner(username, display_name, avatar_url)")
    .in("user_id", friendIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!activities?.length) return [];

  return activities.map((a: any) => ({
    id: a.id,
    type: a.type as ActivityType,
    userId: a.user_id,
    username: a.profiles?.username ?? null,
    displayName: a.profiles?.display_name ?? null,
    avatarUrl: a.profiles?.avatar_url ?? null,
    data: a.data ?? {},
    createdAt: a.created_at,
  }));
}

export async function logActivity(userId: string, type: ActivityType, data: Record<string, any>): Promise<void> {
  await supabase.from("activity_feed").insert({
    user_id: userId,
    type,
    data,
  });
}

export function getActivityMessage(item: ActivityItem): string {
  const name = item.displayName || item.username || "Someone";
  switch (item.type) {
    case "challenge_win":
      return `${name} won a challenge!`;
    case "badge_earned":
      return `${name} earned the "${item.data.badge_label || "new"}" badge!`;
    case "new_friend":
      return `${name} made a new friend`;
    case "challenge_created":
      return `${name} created a new challenge`;
    default:
      return `${name} did something`;
  }
}
