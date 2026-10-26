import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "../../lib/theme/colors";
import { radius } from "../../lib/theme/spacing";
import { pressSoft } from "../../lib/ui/pressableStyles";

type Chip = { key: string; label: string };

export default function PulseFilterChips({
  chips,
  active,
  onChange,
}: {
  chips: Chip[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.row}>
      {chips.map((c) => {
        const selected = active === c.key;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipOn,
              pressSoft(pressed),
            ]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextOn]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  chipTextOn: {
    color: colors.text,
  },
});
