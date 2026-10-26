// lib/backend/notificationTypes.ts - Single source of truth for notification types

/**
 * All notification types in the app.
 * - In-app: always stored in `notifications` table and shown in the bell list.
 * - Push: when push is enabled, also sent to the device (requires dev build in SDK 53+).
 */
export const NOTIFICATION_TYPES = {
  /** Someone liked your post. In-app + push. */
  POST_LIKE: "post_like",
  /** Someone commented on your post. In-app + push. */
  POST_COMMENT: "post_comment",
  /** Someone accepted your challenge. In-app + push. */
  CHALLENGE_ACCEPTED: "challenge_accepted",
  /** You were invited to a challenge. In-app + push. */
  CHALLENGE_INVITE: "challenge_invite",
  /** You won a challenge. In-app + push. */
  CHALLENGE_WIN: "challenge_win",
  /** Someone added you as a friend. In-app + push. */
  NEW_FRIEND: "new_friend",
  /** You unlocked a new badge. In-app + push. */
  BADGE_UNLOCKED: "badge_unlocked",
  /** Daily reward is available. In-app + push. */
  DAILY_REWARD: "daily_reward",
  /** Admin approved your seller application. In-app only. */
  SELLER_APPROVED: "seller_approved",
  /** Admin did not approve your seller application. In-app only. */
  SELLER_REJECTED: "seller_rejected",
  /** King / court leaderboard: tie, badge held by another, or you hold the badge. In-app. */
  KING_LEADERBOARD_STATUS: "king_leaderboard_status",
  /** Challenge win may map to a spot record — open Leaderboards → Spots. In-app. */
  LEADERBOARD_QUALIFICATION: "leaderboard_qualification",
  /** You became #1 in a scope and received title. */
  LEADERBOARD_TITLE_GAINED: "leaderboard_title_gained",
  /** You lost #1 in a scope. */
  LEADERBOARD_TITLE_LOST: "leaderboard_title_lost",
  /** Someone challenged your top scope/category. */
  LEADERBOARD_CHALLENGED: "leaderboard_challenged",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Types that trigger a push notification (in addition to in-app). */
export const TYPES_THAT_SEND_PUSH: NotificationType[] = [
  NOTIFICATION_TYPES.POST_LIKE,
  NOTIFICATION_TYPES.POST_COMMENT,
  NOTIFICATION_TYPES.CHALLENGE_ACCEPTED,
  NOTIFICATION_TYPES.CHALLENGE_INVITE,
  NOTIFICATION_TYPES.CHALLENGE_WIN,
  NOTIFICATION_TYPES.NEW_FRIEND,
  NOTIFICATION_TYPES.BADGE_UNLOCKED,
  NOTIFICATION_TYPES.DAILY_REWARD,
];

/** Human-readable label for settings/UI. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPES.POST_LIKE]: "Post likes",
  [NOTIFICATION_TYPES.POST_COMMENT]: "Comments",
  [NOTIFICATION_TYPES.CHALLENGE_ACCEPTED]: "Challenge accepted",
  [NOTIFICATION_TYPES.CHALLENGE_INVITE]: "Challenge invites",
  [NOTIFICATION_TYPES.CHALLENGE_WIN]: "Challenge wins",
  [NOTIFICATION_TYPES.NEW_FRIEND]: "New friends",
  [NOTIFICATION_TYPES.BADGE_UNLOCKED]: "Badge unlocks",
  [NOTIFICATION_TYPES.DAILY_REWARD]: "Daily rewards",
  [NOTIFICATION_TYPES.SELLER_APPROVED]: "Seller approval",
  [NOTIFICATION_TYPES.SELLER_REJECTED]: "Seller updates",
  [NOTIFICATION_TYPES.KING_LEADERBOARD_STATUS]: "King leaderboard",
  [NOTIFICATION_TYPES.LEADERBOARD_QUALIFICATION]: "Spot leaderboard tips",
  [NOTIFICATION_TYPES.LEADERBOARD_TITLE_GAINED]: "Title gained",
  [NOTIFICATION_TYPES.LEADERBOARD_TITLE_LOST]: "Title lost",
  [NOTIFICATION_TYPES.LEADERBOARD_CHALLENGED]: "Leaderboard challenged",
};

export function sendsPush(type: NotificationType): boolean {
  return TYPES_THAT_SEND_PUSH.includes(type);
}
