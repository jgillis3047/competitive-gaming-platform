import type { ViewStyle } from "react-native";

import { colors } from "./colors";
import { statusColors } from "./statusColors";

/**
 * ChallengeCard pills — each maps to a distinct status color (not all blue).
 */
export const challengePills = {
  open: {
    backgroundColor: statusColors.friend.bg,
    borderWidth: 1,
    borderColor: statusColors.friend.border,
  },
  progress: {
    backgroundColor: colors.accentChip,
    borderWidth: 1,
    borderColor: colors.accentChipBorder,
  },
  live: {
    backgroundColor: statusColors.live.bg,
    borderWidth: 1,
    borderColor: statusColors.live.border,
  },
  done: {
    backgroundColor: statusColors.crowned.bg,
    borderWidth: 1,
    borderColor: statusColors.crowned.border,
  },
  muted: {
    backgroundColor: statusColors.neutral.bg,
    borderWidth: 1,
    borderColor: statusColors.neutral.border,
  },
  sponsored: {
    backgroundColor: statusColors.pending.bg,
    borderWidth: 1,
    borderColor: statusColors.pending.border,
  },
  money: {
    backgroundColor: colors.goldSurfaceStrong,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
} as const satisfies Record<string, ViewStyle>;
