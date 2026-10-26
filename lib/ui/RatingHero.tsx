import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { getRankLabel, getRankTier } from "../utils/eloRating";

type Props = {
  rating: number;
  globalRank?: number | null;
  globalTotal?: number | null;
  localLabel?: string | null;
};

export default function RatingHero({
  rating,
  globalRank,
  globalTotal,
  localLabel,
}: Props) {
  const tier = getRankTier(rating);
  const rankLabel = getRankLabel(rating);

  return (
    <View style={styles.wrap}>
      <View style={[styles.banner, { backgroundColor: `${tier.color}18`, borderColor: `${tier.color}44` }]}>
        <View style={[styles.emblemRing, { borderColor: tier.color, shadowColor: tier.color }]}>
          <Text style={styles.emblem}>{tier.emblem}</Text>
        </View>
        <Text style={[styles.rankName, { color: tier.color }]}>{rankLabel}</Text>
        <Text style={styles.ratingNumber}>{rating}</Text>
        <Text style={styles.ratingCaption}>Competitive Rating</Text>
      </View>
      {(globalRank != null || localLabel) ? (
        <View style={styles.standingsRow}>
          {localLabel ? (
            <View style={styles.standingChip}>
              <Ionicons name="location-outline" size={13} color={colors.gold} />
              <Text style={styles.standingText}>{localLabel}</Text>
            </View>
          ) : null}
          {globalRank != null ? (
            <View style={styles.standingChip}>
              <Ionicons name="globe-outline" size={13} color={colors.accentMuted} />
              <Text style={styles.standingText}>
                #{globalRank.toLocaleString()}
                {globalTotal ? ` of ${globalTotal.toLocaleString()}` : ""} Worldwide
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 4,
    width: "100%",
  },
  banner: {
    alignItems: "center",
    width: "100%",
    maxWidth: 280,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 2,
  },
  emblemRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  emblem: { fontSize: 34 },
  rankName: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  ratingNumber: {
    fontSize: 44,
    fontWeight: "900",
    color: colors.text,
    lineHeight: 48,
    marginTop: 2,
  },
  ratingCaption: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  standingsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  standingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  standingText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
});
