import { supabase } from "./supabaseClient";
import { notifyUser } from "./notifications";
import { NOTIFICATION_TYPES } from "./notificationTypes";
import type { ProfileRow } from "./profile";

export type FriendCounts = {
  followers: number;
  following: number;
  friends: number;
};

export type FriendshipStatus = {
  iRequestedThem: boolean;
  theyRequestedMe: boolean;
  areFriends: boolean;
};

/** Send friend request (stored as a one-way row in follows table). */
export async function addFriend(targetUserId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("You must be signed in to add friends.");
  if (user.id === targetUserId) throw new Error("You cannot add yourself.");

  const { error } = await supabase.from("follows").upsert(
    { follower_id: user.id, following_id: targetUserId },
    { onConflict: "follower_id,following_id" }
  );
  if (error) throw error;

  try {
    await notifyUser({
      targetUserId,
      type: NOTIFICATION_TYPES.NEW_FRIEND,
      title: "New friend request",
      body: "Someone added you as a friend!",
      link: `/user/${user.id}`,
    });
  } catch (e) {
    console.warn("[friends] notify error:", e);
  }
}

/** Remove friend/request (deletes viewer -> target row from follows table). */
export async function removeFriend(targetUserId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("You must be signed in to remove friends.");
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId);
  if (error) throw error;
}

/** Whether viewer has sent a request to target (one-way). */
export async function hasSentFriendRequest(
  viewerId: string | null,
  targetId: string
): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetId)
    .maybeSingle();
  return !!data?.id;
}

/** Full friendship/request status between two users. */
export async function getFriendshipStatus(
  viewerId: string | null,
  targetId: string
): Promise<FriendshipStatus> {
  if (!viewerId || viewerId === targetId) {
    return { iRequestedThem: false, theyRequestedMe: false, areFriends: false };
  }
  const [iReqRes, theyReqRes] = await Promise.all([
    supabase.from("follows").select("id").eq("follower_id", viewerId).eq("following_id", targetId).maybeSingle(),
    supabase.from("follows").select("id").eq("follower_id", targetId).eq("following_id", viewerId).maybeSingle(),
  ]);
  const iRequestedThem = !!iReqRes.data?.id;
  const theyRequestedMe = !!theyReqRes.data?.id;
  return {
    iRequestedThem,
    theyRequestedMe,
    areFriends: iRequestedThem && theyRequestedMe,
  };
}

/** Request counts + mutual friend count for a user. */
export async function getFriendCounts(userId: string): Promise<FriendCounts> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);

  const followerIds = new Set((followersRes.data ?? []).map((r: any) => r.follower_id));
  const followingIds = new Set((followingRes.data ?? []).map((r: any) => r.following_id));

  let friendsCount = 0;
  for (const id of followerIds) {
    if (followingIds.has(id)) friendsCount++;
  }

  return {
    followers: followerIds.size,
    following: followingIds.size,
    friends: friendsCount,
  };
}

/** Get list of friend user IDs (mutual follows). */
export async function getFriendIds(userId: string): Promise<string[]> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("follows").select("follower_id").eq("following_id", userId),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
  ]);

  const followerIds = new Set((followersRes.data ?? []).map((r: any) => r.follower_id));
  const followingIds = (followingRes.data ?? []).map((r: any) => r.following_id);

  return followingIds.filter((id: string) => followerIds.has(id));
}

/** Get friend profile rows (mutual follows) for the given user. */
export async function listFriendProfiles(userId: string): Promise<ProfileRow[]> {
  const friendIds = await getFriendIds(userId);
  if (!friendIds.length) return [];

  // Prefer RPC (SECURITY DEFINER) so this works even with strict profiles RLS.
  const { data: rpcData, error: rpcError } = await supabase.rpc("profiles_by_ids", {
    p_ids: friendIds,
  });
  if (!rpcError && Array.isArray(rpcData)) {
    return rpcData as ProfileRow[];
  }

  // Fallback for environments where RPC has not been deployed yet.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, created_at")
    .in("id", friendIds);

  if (error) {
    throw new Error(
      rpcError?.message
        ? `${rpcError.message}${error.message ? ` | ${error.message}` : ""}`
        : error.message
    );
  }
  return (data ?? []) as ProfileRow[];
}

