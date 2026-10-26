import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { statusColors, type StatusKey } from "../theme/statusColors";

type Props = {
  children: React.ReactNode;
  status?: StatusKey;
  style?: ViewStyle;
  /** Stronger outer glow (crowns, live matches) */
  intense?: boolean;
};

/** Card wrapper with status-colored glow — crowns & live events feel iconic. */
export default function GlowCard({ children, status = "neutral", style, intense = false }: Props) {
  const s = statusColors[status];
  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.glow,
          intense && styles.glowIntense,
          { backgroundColor: s.glow, shadowColor: s.text },
        ]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    opacity: 0.55,
    transform: [{ scale: 1.02 }],
  },
  glowIntense: {
    opacity: 0.75,
    transform: [{ scale: 1.04 }],
  },
});
