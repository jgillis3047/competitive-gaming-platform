import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ChallengeActionState } from "../../lib/thread/challengeState";
import { statusColors } from "../../lib/theme/statusColors";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";

type Props = {
  gameTitle: string;
  action: ChallengeActionState;
  onPress: () => void;
  compact?: boolean;
};

export default function ActiveChallengePin({ gameTitle, action, onPress, compact }: Props) {
  const isUrgent = action.bucket === "needs_action";
  const statusStyle = isUrgent ? statusColors.live : statusColors.neutral;

  return (
    <View style={[styles.card, isUrgent && styles.cardUrgent]}>
      <View style={styles.topRow}>
        <Text style={styles.gameTitle} numberOfLines={1}>
          {gameTitle}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>{action.statusLabel}</Text>
        </View>
      </View>

      {!compact ? (
        <Text style={styles.subLabel} numberOfLines={1}>
          {action.bucket === "needs_action"
            ? "Needs your action"
            : action.bucket === "waiting"
              ? "Waiting on opponent"
              : "In progress"}
        </Text>
      ) : null}

      {action.ctaLabel ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.cta,
            action.ctaKind === "primary" ? styles.ctaPrimary : styles.ctaSecondary,
            pressSoft(pressed),
          ]}
        >
          <Text style={styles.ctaText}>{action.ctaLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.sm,
  },
  cardUrgent: {
    borderColor: statusColors.live.border,
    backgroundColor: statusColors.live.bg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  gameTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusText: {
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.4,
  },
  subLabel: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 6,
  },
  cta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  ctaPrimary: {
    backgroundColor: "rgba(99,102,241,0.35)",
    borderColor: "rgba(99,102,241,0.55)",
  },
  ctaSecondary: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctaText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
});
