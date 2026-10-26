/**
 * Semantic status colors — use for emotional scanning (live, crowned, hot, etc.)
 * Never use raw hex for these states in UI; import from here or colors.status.
 */
import { colors } from "./colors";

export type StatusKey =
  | "live"
  | "crowned"
  | "hot"
  | "disputed"
  | "pending"
  | "friend"
  | "verified"
  | "neutral";

export type StatusTokens = {
  text: string;
  icon: string;
  bg: string;
  border: string;
  glow: string;
};

export const statusColors: Record<StatusKey, StatusTokens> = {
  live: {
    text: colors.heatBright,
    icon: colors.heatBright,
    bg: colors.heatSurface,
    border: colors.heatBorder,
    glow: colors.heatGlow,
  },
  crowned: {
    text: colors.gold,
    icon: colors.gold,
    bg: colors.goldSurfaceStrong,
    border: colors.goldBorderStrong,
    glow: colors.goldGlow,
  },
  hot: {
    text: colors.hotPurple,
    icon: colors.hotPurple,
    bg: colors.hotSurface,
    border: colors.hotBorder,
    glow: colors.hotGlow,
  },
  disputed: {
    text: colors.danger,
    icon: colors.danger,
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.38)",
    glow: "rgba(239,68,68,0.22)",
  },
  pending: {
    text: colors.amberBright,
    icon: colors.amberBright,
    bg: colors.warningSurfaceMedium,
    border: colors.warningBorderStrong,
    glow: "rgba(245,158,11,0.2)",
  },
  friend: {
    text: colors.friendGreen,
    icon: colors.friendGreen,
    bg: colors.friendSurface,
    border: colors.friendBorder,
    glow: colors.friendGlow,
  },
  verified: {
    text: colors.verifiedCyan,
    icon: colors.verifiedCyan,
    bg: colors.verifiedSurface,
    border: colors.verifiedBorder,
    glow: colors.verifiedGlow,
  },
  neutral: {
    text: colors.textMuted,
    icon: colors.textMuted,
    bg: "rgba(255,255,255,0.05)",
    border: colors.border,
    glow: "transparent",
  },
};

export function statusForCrownChipVariant(
  variant: "king" | "contested" | "open" | "muted" | "live" | "hot" | "friend" | "pending" | "disputed" | "verified"
): StatusTokens {
  switch (variant) {
    case "king":
      return statusColors.crowned;
    case "live":
      return statusColors.live;
    case "hot":
      return statusColors.hot;
    case "friend":
      return statusColors.friend;
    case "pending":
    case "contested":
      return statusColors.pending;
    case "disputed":
      return statusColors.disputed;
    case "verified":
      return statusColors.verified;
    case "open":
      return statusColors.friend;
    default:
      return statusColors.neutral;
  }
}
