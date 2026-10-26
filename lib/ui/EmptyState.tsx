// lib/ui/EmptyState.tsx - Consistent empty and error state with intentional glow
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { statusColors } from "../theme/statusColors";
import { radius, space } from "../theme/spacing";

type Props = {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "empty" | "error" | "live";
};

export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  variant = "empty",
}: Props) {
  const isError = variant === "error";
  const isLive = variant === "live";
  const accent = isError ? statusColors.disputed : isLive ? statusColors.live : statusColors.crowned;

  return (
    <View style={styles.wrap}>
      <View style={[styles.panelGlow, { backgroundColor: accent.glow }]} pointerEvents="none" />
      <View style={[styles.panel, isLive && styles.panelLive]}>
        {icon ? <View style={[styles.iconRing, { borderColor: accent.border }]}>{icon}</View> : null}
        <Text style={[styles.title, isError && styles.titleError]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    minHeight: 180,
    position: "relative",
  },
  panelGlow: {
    position: "absolute",
    width: "92%",
    maxWidth: 360,
    height: "85%",
    borderRadius: 20,
    opacity: 0.5,
  },
  panel: {
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: 18,
    backgroundColor: colors.emptyPanel,
    borderWidth: 1,
    borderColor: colors.emptyPanelBorder,
  },
  panelLive: {
    borderColor: statusColors.live.border,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: space.md,
    textAlign: "center",
  },
  titleError: { color: "#fca5a5" },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: space.sm,
    textAlign: "center",
    maxWidth: 320,
  },
  btn: {
    marginTop: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accentCTA,
  },
  btnText: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
