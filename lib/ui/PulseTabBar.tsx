import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";
import { pressSoft } from "./pressableStyles";

export type PulseTabKey = "feed" | "people" | "crews" | "crowns";

const TABS: { key: PulseTabKey; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "people", label: "People" },
  { key: "crews", label: "Crews" },
  { key: "crowns", label: "Crowns" },
];

export default function PulseTabBar({
  tab,
  onChange,
}: {
  tab: PulseTabKey;
  onChange: (tab: PulseTabKey) => void;
}) {
  return (
    <View style={styles.row}>
      {TABS.map((t) => {
        const selected = tab === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => [
              styles.chipWrap,
              selected && styles.chipWrapSelected,
              pressSoft(pressed),
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t.label}</Text>
            {selected ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chipWrap: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  chipWrapSelected: {
    backgroundColor: "rgba(99,102,241,0.12)",
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 13,
  },
  underline: {
    marginTop: 6,
    height: 3,
    width: "60%",
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
