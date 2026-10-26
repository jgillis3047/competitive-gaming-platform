import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { statusForCrownChipVariant } from "../theme/statusColors";

type Variant =
  | "king"
  | "contested"
  | "open"
  | "muted"
  | "live"
  | "hot"
  | "friend"
  | "pending"
  | "disputed"
  | "verified";

const ICONS: Record<Variant, keyof typeof Ionicons.glyphMap> = {
  king: "ribbon",
  contested: "flash",
  open: "add-circle",
  muted: "ellipse-outline",
  live: "radio-button-on",
  hot: "flame",
  friend: "people",
  pending: "time",
  disputed: "alert-circle",
  verified: "shield-checkmark",
};

type Props = {
  label: string;
  sublabel?: string;
  variant?: Variant;
  style?: ViewStyle;
  compact?: boolean;
  /** Crown / live — outer glow halo */
  glow?: boolean;
};

export default function CrownChip({
  label,
  sublabel,
  variant = "king",
  style,
  compact,
  glow = false,
}: Props) {
  const v = statusForCrownChipVariant(variant);
  const isCrown = variant === "king";
  const showGlow = glow || isCrown || variant === "live";

  return (
    <View style={[showGlow && styles.glowWrap, style]}>
      {showGlow ? (
        <View
          style={[
            styles.glowHalo,
            compact && styles.glowHaloCompact,
            { backgroundColor: v.glow, shadowColor: v.text },
          ]}
          pointerEvents="none"
        />
      ) : null}
      <View
        style={[
          styles.wrap,
          compact && styles.wrapCompact,
          isCrown && styles.wrapCrown,
          { backgroundColor: v.bg, borderColor: v.border },
        ]}
      >
        <View style={[styles.iconWell, isCrown && styles.iconWellCrown]}>
          <Ionicons name={ICONS[variant]} size={compact ? 12 : 14} color={v.icon} />
        </View>
        <View style={styles.textCol}>
          <Text
            style={[styles.label, compact && styles.labelCompact, { color: v.text }]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {sublabel ? (
            <Text style={styles.sublabel} numberOfLines={1}>
              {sublabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glowWrap: { position: "relative", alignSelf: "flex-start" },
  glowHalo: {
    position: "absolute",
    top: -3,
    left: -4,
    right: -4,
    bottom: -3,
    borderRadius: 999,
    opacity: 0.7,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  glowHaloCompact: { top: -2, left: -3, right: -3, bottom: -2 },
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  wrapCrown: {
    borderWidth: 1.5,
    paddingHorizontal: 11,
  },
  wrapCompact: { paddingHorizontal: 8, paddingVertical: 4 },
  iconWell: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellCrown: {
    backgroundColor: "rgba(250,204,21,0.18)",
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.35)",
  },
  textCol: { flexShrink: 1 },
  label: { fontSize: 12, fontWeight: "800" },
  labelCompact: { fontSize: 11 },
  sublabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.48)",
    marginTop: 1,
    fontWeight: "600",
  },
});
