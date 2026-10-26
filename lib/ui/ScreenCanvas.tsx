// Atmospheric screen background — lifts empty/dark areas without changing core palette
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "../theme/colors";

type Variant = "default" | "gold" | "heat";

type Props = {
  children: React.ReactNode;
  variant?: Variant;
  style?: ViewStyle;
};

/** Subtle top glow + optional crown/heat tint. Wrap tab roots for premium depth. */
export default function ScreenCanvas({ children, variant = "default", style }: Props) {
  return (
    <View style={[styles.root, style]}>
      <View style={[styles.glowLayer, styles.glowBlue]} pointerEvents="none" />
      {variant === "gold" ? <View style={[styles.glowLayer, styles.glowGold]} pointerEvents="none" /> : null}
      {variant === "heat" ? <View style={[styles.glowLayer, styles.glowHeat]} pointerEvents="none" /> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgFeed,
  },
  content: { flex: 1 },
  glowLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  glowBlue: {
    backgroundColor: colors.canvasGlowTop,
    opacity: 1,
  },
  glowGold: {
    backgroundColor: colors.canvasGlowGold,
    height: 280,
  },
  glowHeat: {
    backgroundColor: colors.canvasGlowHeat,
    height: 260,
  },
});
