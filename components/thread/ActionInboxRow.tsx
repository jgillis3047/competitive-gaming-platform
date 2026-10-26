import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../../lib/ui/Avatar";
import type { ChallengeActionState } from "../../lib/thread/challengeState";
import { statusColors } from "../../lib/theme/statusColors";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";

type Props = {
  opponentName: string;
  avatarUrl?: string | null;
  gameTitle: string;
  action: ChallengeActionState;
  onPlay: () => void;
  onOpenThread: () => void;
};

export default function ActionInboxRow({
  opponentName,
  avatarUrl,
  gameTitle,
  action,
  onPlay,
  onOpenThread,
}: Props) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onOpenThread} style={({ pressed }) => [styles.left, pressed && { opacity: 0.85 }]}>
        <Avatar imageUrl={avatarUrl} name={opponentName} size={44} />
        <View style={styles.meta}>
          <Text style={styles.opponent} numberOfLines={1}>
            {opponentName}
          </Text>
          <Text style={styles.game} numberOfLines={1}>
            {gameTitle}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColors.live.bg, borderColor: statusColors.live.border }]}>
            <Text style={[styles.statusText, { color: statusColors.live.text }]}>{action.statusLabel}</Text>
          </View>
        </View>
      </Pressable>

      {action.ctaLabel ? (
        <Pressable
          onPress={onPlay}
          style={({ pressed }) => [styles.cta, pressSoft(pressed)]}
        >
          <Text style={styles.ctaText}>{action.ctaLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: statusColors.live.bg,
    borderWidth: 1,
    borderColor: statusColors.live.border,
    marginBottom: space.sm,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  meta: { flex: 1, minWidth: 0 },
  opponent: { color: colors.text, fontWeight: "800", fontSize: 15 },
  game: { color: colors.textSecondary, fontWeight: "700", fontSize: 13, marginTop: 2 },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusText: { fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(99,102,241,0.40)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.60)",
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
