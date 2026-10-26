// lib/ui/Skeleton.tsx
// Skeleton loader components for loading states
import React, { useEffect, useRef } from "react";
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "../theme/colors";

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 20, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = "60%",
}: {
  lines?: number;
  lastLineWidth?: DimensionValue;
}) {
  return (
    <View style={styles.textContainer}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? lastLineWidth : "100%"}
          style={i < lines - 1 ? styles.textLine : undefined}
        />
      ))}
    </View>
  );
}

export function SkeletonAvatar({ size = 48 }: { size?: number }) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} />;
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonAvatar size={40} />
        <View style={styles.cardHeaderText}>
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
        </View>
      </View>
      <SkeletonText lines={2} />
      <Skeleton height={180} borderRadius={12} style={{ marginTop: 12 }} />
    </View>
  );
}

export function SkeletonChallengeCard() {
  return (
    <View style={styles.challengeCard}>
      <View style={styles.challengeHeader}>
        <Skeleton width={100} height={16} />
        <Skeleton width={60} height={24} borderRadius={12} />
      </View>
      <Skeleton width="80%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.challengeFooter}>
        <Skeleton width={80} height={12} />
        <Skeleton width={60} height={12} />
      </View>
    </View>
  );
}

export function SkeletonProfileHeader() {
  return (
    <View style={styles.profileHeader}>
      <SkeletonAvatar size={72} />
      <View style={styles.profileInfo}>
        <Skeleton width={150} height={20} />
        <Skeleton width={100} height={14} style={{ marginTop: 8 }} />
      </View>
      <View style={styles.profileStats}>
        <Skeleton width={60} height={32} borderRadius={16} />
        <Skeleton width={60} height={32} borderRadius={16} />
        <Skeleton width={60} height={32} borderRadius={16} />
      </View>
    </View>
  );
}

export function SkeletonLeaderboardRow() {
  return (
    <View style={styles.leaderboardRow}>
      <Skeleton width={30} height={20} />
      <SkeletonAvatar size={36} />
      <View style={{ flex: 1 }}>
        <Skeleton width={120} height={14} />
      </View>
      <Skeleton width={50} height={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  textContainer: {
    gap: 8,
  },
  textLine: {
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  challengeCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  challengeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  challengeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  profileHeader: {
    alignItems: "center",
    gap: 12,
  },
  profileInfo: {
    alignItems: "center",
  },
  profileStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
});
