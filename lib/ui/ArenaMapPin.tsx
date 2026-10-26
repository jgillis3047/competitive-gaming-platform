// Custom map marker — crowned, live, hot, friend, contested, open
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { statusColors } from "../theme/statusColors";

export type ArenaPinKind = "crowned" | "contested" | "open" | "hot" | "live" | "friend";

const PIN_STATUS: Record<ArenaPinKind, keyof typeof statusColors> = {
  live: "live",
  friend: "friend",
  hot: "hot",
  crowned: "crowned",
  contested: "pending",
  open: "verified",
};

const PIN_ICONS: Record<ArenaPinKind, keyof typeof Ionicons.glyphMap> = {
  live: "radio-button-on",
  friend: "people",
  hot: "flame",
  crowned: "ribbon",
  contested: "flash",
  open: "add",
};

/** Pick the most attention-grabbing pin kind for an arena. */
export function resolveArenaPinKind(opts: {
  hasKing?: boolean;
  tieAtTop?: boolean;
  vacant?: boolean;
  isHot?: boolean;
  isLive?: boolean;
  isFriend?: boolean;
}): ArenaPinKind {
  if (opts.isLive) return "live";
  if (opts.isFriend && opts.hasKing) return "friend";
  if (opts.isHot) return "hot";
  if (opts.tieAtTop) return "contested";
  if (opts.hasKing) return "crowned";
  return "open";
}

type Props = {
  kind: ArenaPinKind;
  compact?: boolean;
};

export default function ArenaMapPin({ kind, compact = false }: Props) {
  const s = statusColors[PIN_STATUS[kind]];
  const size = compact ? 28 : 34;
  const iconSize = compact ? 14 : 16;
  const isPulse = kind === "live" || kind === "hot";

  return (
    <View style={styles.wrap}>
      {isPulse && !compact ? (
        <View style={[styles.pulseRing, { borderColor: s.border }]} />
      ) : null}
      <View
        style={[
          styles.pin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: s.bg,
            borderColor: s.border,
            shadowColor: s.text,
          },
        ]}
      >
        <Ionicons name={PIN_ICONS[kind]} size={iconSize} color={s.text} />
      </View>
    </View>
  );
}

export function ArenaMapLegend() {
  const items: { kind: ArenaPinKind; label: string }[] = [
    { kind: "crowned", label: "Crowned" },
    { kind: "live", label: "Live" },
    { kind: "hot", label: "Hot" },
    { kind: "friend", label: "Friend" },
    { kind: "contested", label: "Contested" },
    { kind: "open", label: "Open crown" },
  ];
  return (
    <View style={styles.legend}>
      {items.map(({ kind, label }) => (
        <View key={kind} style={styles.legendItem}>
          <ArenaMapPin kind={kind} compact />
          <Text style={styles.legendLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  pulseRing: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.55,
  },
  pin: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendLabel: {
    color: "rgba(255,255,255,0.48)",
    fontSize: 10,
    fontWeight: "700",
  },
});
