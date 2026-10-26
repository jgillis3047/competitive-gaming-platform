// lib/backend/blockedUsers.ts
import { supabase } from "./supabaseClient";

export type BlockedUserRow = {
  id: string;
  blocked_id: string;
  created_at: string;
  blocked_profile?: { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
};

/** Block a user (current user blocks target). Idempotent. */
export async function blockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("You must be signed in to block.");
  if (user.id === blockedId) throw new Error("You cannot block yourself.");
  const { error } = await supabase.from("blocked_users").upsert(
    { blocker_id: user.id, blocked_id: blockedId },
    { onConflict: "blocker_id,blocked_id" }
  );
  if (error) throw error;
}

/** Unblock a user. */
export async function unblockUser(blockedId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("You must be signed in to unblock.");
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

/** Whether viewer has blocked target or target has blocked viewer. */
export async function getBlockStatus(
  viewerId: string | null,
  targetId: string
): Promise<{ iBlockedThem: boolean; theyBlockedMe: boolean }> {
  if (!viewerId || viewerId === targetId) {
    return { iBlockedThem: false, theyBlockedMe: false };
  }
  const [iBlocked, theyBlocked] = await Promise.all([
    supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", viewerId)
      .eq("blocked_id", targetId)
      .maybeSingle(),
    supabase
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", targetId)
      .eq("blocked_id", viewerId)
      .maybeSingle(),
  ]);
  return {
    iBlockedThem: !!iBlocked.data?.id,
    theyBlockedMe: !!theyBlocked.data?.id,
  };
}

/** List users the current user has blocked (with profile for display). */
export async function listBlockedUsers(): Promise<BlockedUserRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return [];
  const { data, error } = await supabase
    .from("blocked_users")
    .select(`
      id,
      blocked_id,
      created_at,
      blocked_profile:profiles!blocked_id(id, username, display_name, avatar_url)
    `)
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as BlockedUserRow[];
}

/** Set of user IDs the current user has blocked (for filtering feed/search). */
export async function getBlockedUserIds(myId: string | null): Promise<Set<string>> {
  if (!myId) return new Set();
  const { data } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", myId);
  const ids = new Set<string>();
  for (const r of data ?? []) {
    if (r.blocked_id) ids.add(String(r.blocked_id));
  }
  return ids;
}

/** Set of user IDs who have blocked the current user. */
export async function getBlockedByUserIds(myId: string | null): Promise<Set<string>> {
  if (!myId) return new Set();
  const { data } = await supabase
    .from("blocked_users")
    .select("blocker_id")
    .eq("blocked_id", myId);
  const ids = new Set<string>();
  for (const r of data ?? []) {
    if (r.blocker_id) ids.add(String(r.blocker_id));
  }
  return ids;
}
