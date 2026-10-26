import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../../lib/ui/Avatar";
import type { ChallengeActionState } from "../../lib/thread/challengeState";
import { statusColors } from "../../lib/theme/statusColors";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";

export type ChallengePill = {
  challengeId: string;
  action: ChallengeActionState;
  gameTitle: string;
};

type Props = {
  opponentName: string;
  avatarUrl?: string | null;
  updatedAgo: string;
  lastUpdate: string;
  activeCount: number;
  needsActionCount: number;
  waitingCount: number;
  pills: ChallengePill[];
  onPress: () => void;
};

export default function MatchInboxRow({
  opponentName,
  avatarUrl,
  updatedAgo,
  lastUpdate,
  activeCount,
  needsActionCount,
  waitingCount,
  pills,
  onPress,
}: Props) {
  const hasAction = needsActionCount > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        hasAction && styles.rowUrgent,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.avatarWrap}>
        <Avatar imageUrl={avatarUrl} name={opponentName} size={50} />
        {hasAction ? <View style={styles.unreadDot} /> : null}
      </View>

      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {opponentName}
          </Text>
          <Text style={[styles.time, hasAction && styles.timeUrgent]}>{updatedAgo}</Text>
        </View>

        <View style={styles.statsRow}>
          {activeCount > 0 ? (
            <>
              <Text style={styles.statText}>
                🔥 {activeCount} Active {activeCount === 1 ? "Challenge" : "Challenges"}
              </Text>
              {needsActionCount > 0 ? (
                <Text style={styles.statAction}>• {needsActionCount} need action</Text>
              ) : waitingCount > 0 ? (
                <Text style={styles.statWaiting}>• ⏳ Waiting on opponent</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.statText}>💬 Message thread</Text>
          )}
        </View>

        <Text style={styles.preview} numberOfLines={1}>
          Last update: {lastUpdate}
        </Text>

        {pills.length > 0 ? (
          <View style={styles.pillRow}>
            {pills.slice(0, 4).map((p) => (
              <View
                key={p.challengeId}
                style={[
                  styles.pill,
                  p.action.bucket === "needs_action" ? styles.pillAction : styles.pillWaiting,
                ]}
              >
                <Text style={styles.pillText} numberOfLines={1}>
                  {p.action.pillLabel}
                </Text>
              </View>
            ))}
            {pills.length > 4 ? (
              <View style={[styles.pill, styles.pillMore]}>
                <Text style={styles.pillText}>+{pills.length - 4}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.md,
  },
  rowUrgent: {
    borderColor: statusColors.live.border,
    backgroundColor: statusColors.live.bg,
  },
  rowPressed: { opacity: 0.95 },

  avatarWrap: { position: "relative" },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    borderWidth: 2,
    borderColor: colors.surface,
  },

  content: { flex: 1, minWidth: 0 },

  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  name: { color: colors.text, fontWeight: "800", fontSize: 16, flex: 1 },
  time: { color: colors.textMuted, fontWeight: "800", fontSize: 12 },
  timeUrgent: { color: "#fca5a5" },

  statsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  statText: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  statAction: { color: statusColors.live.text, fontWeight: "800", fontSize: 13 },
  statWaiting: { color: colors.textTertiary, fontWeight: "700", fontSize: 13 },

  preview: { color: colors.textMuted, fontWeight: "600", marginTop: 4, fontSize: 13 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: "48%",
  },
  pillAction: {
    backgroundColor: statusColors.live.bg,
    borderColor: statusColors.live.border,
  },
  pillWaiting: {
    backgroundColor: colors.accentChip,
    borderColor: colors.accentChipBorder,
  },
  pillMore: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
  },
  pillText: { color: colors.text, fontWeight: "800", fontSize: 11 },
});
