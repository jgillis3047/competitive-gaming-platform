// app/components/AiReviewCard.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { aiReviewBadge } from "../../lib/backend/matchProof";
import type { AiMatchReviewRow, GolfAiReviewRow } from "../../lib/models/visionTypes";
import { colors } from "../../lib/theme/colors";

type Props = {
  review: AiMatchReviewRow | GolfAiReviewRow | null;
  title?: string;
};

function badgeColor(color: "green" | "yellow" | "red" | "gray"): string {
  switch (color) {
    case "green":
      return colors.success;
    case "red":
      return colors.danger ?? "#ef4444";
    case "yellow":
      return colors.accentTab;
    default:
      return colors.textMuted;
  }
}

export default function AiReviewCard({ review, title = "AI Proof Review" }: Props) {
  if (!review) return null;

  const isGolf = "detected_scores" in review && review.detected_scores != null;
  const badge = aiReviewBadge(review as AiMatchReviewRow);
  const pct = Math.round(Number(review.confidence ?? 0) * 100);
  const flags = review.flags ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={colors.accentTab} />
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.badge, { borderColor: badgeColor(badge.color) }]}>
          <Text style={[styles.badgeText, { color: badgeColor(badge.color) }]}>{badge.label}</Text>
        </View>
      </View>

      {review.summary ? <Text style={styles.summary}>{review.summary}</Text> : null}

      <View style={styles.statsRow}>
        <Text style={styles.statLabel}>Confidence</Text>
        <Text style={styles.statValue}>{pct}%</Text>
      </View>

      {"detected_score" in review && review.detected_score ? (
        <View style={styles.statsRow}>
          <Text style={styles.statLabel}>Detected score</Text>
          <Text style={styles.statValue}>{review.detected_score}</Text>
        </View>
      ) : null}

      {isGolf && (review as GolfAiReviewRow).detected_scores ? (
        <View style={styles.scoreBlock}>
          <Text style={styles.statLabel}>Detected totals</Text>
          {Object.entries((review as GolfAiReviewRow).detected_scores ?? {}).map(([uid, score]) => (
            <Text key={uid} style={styles.statValue}>
              Player {uid.slice(0, 8)}…: {score}
            </Text>
          ))}
        </View>
      ) : null}

      {flags.length > 0 ? (
        <View style={styles.flags}>
          <Text style={styles.flagsTitle}>Flags</Text>
          {flags.map((f) => (
            <Text key={f} style={styles.flagItem}>
              • {f.replace(/_/g, " ")}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.clean}>No major issues detected</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accentBorderSubtle,
    marginVertical: 8,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  title: { flex: 1, color: colors.text, fontWeight: "900", fontSize: 15 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  summary: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  statLabel: { color: colors.textMuted, fontSize: 13 },
  statValue: { color: colors.text, fontWeight: "800", fontSize: 13 },
  scoreBlock: { marginTop: 4, marginBottom: 8 },
  flags: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  flagsTitle: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  flagItem: { color: colors.heat, fontSize: 12, marginBottom: 2 },
  clean: { color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 6 },
});
