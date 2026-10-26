// lib/backend/follows.ts
// Backward-compatible wrapper around friend-first APIs.
import {
  addFriend,
  removeFriend,
  hasSentFriendRequest,
  getFriendshipStatus as getFriendshipStatusNew,
  getFriendCounts,
  getFriendIds,
  listFriendProfiles,
  type FriendCounts,
  type FriendshipStatus as FriendshipStatusNew,
} from "./friends";

export type FollowCounts = FriendCounts;
export type FriendshipStatus = {
  iFollowThem: boolean;
  theyFollowMe: boolean;
  areFriends: boolean;
};

export async function followUser(followingId: string): Promise<void> {
  return addFriend(followingId);
}

export async function unfollowUser(followingId: string): Promise<void> {
  return removeFriend(followingId);
}

export async function getFollowStatus(viewerId: string | null, targetId: string): Promise<boolean> {
  return hasSentFriendRequest(viewerId, targetId);
}

export async function getFriendshipStatus(
  viewerId: string | null,
  targetId: string
): Promise<FriendshipStatus> {
  const s: FriendshipStatusNew = await getFriendshipStatusNew(viewerId, targetId);
  return { iFollowThem: s.iRequestedThem, theyFollowMe: s.theyRequestedMe, areFriends: s.areFriends };
}

export async function getFollowCounts(userId: string): Promise<FollowCounts> {
  return getFriendCounts(userId);
}

export { getFriendIds, listFriendProfiles };
