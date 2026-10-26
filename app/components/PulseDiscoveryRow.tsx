import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Avatar from "../../lib/ui/Avatar";
import { colors } from "../../lib/theme/colors";
import { radius } from "../../lib/theme/spacing";
import { getRankLabel } from "../../lib/utils/eloRating";
import { pressSoft } from "../../lib/ui/pressableStyles";

type Props = {
  imageUrl?: string | null;
  name: string;
  subtitle: string;
  rating?: number | null;
  onPress: () => void;
};

export function PulsePlayerRow({ imageUrl, name, subtitle, rating, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressSoft(pressed)]}>
      <Avatar imageUrl={imageUrl} name={name} size={44} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      {rating != null ? (
        <Text style={styles.rating}>{getRankLabel(rating)}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function PulseCrewRow({
  imageUrl,
  name,
  subtitle,
  onPress,
}: Omit<Props, "rating">) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressSoft(pressed)]}>
      <Avatar imageUrl={imageUrl} name={name} size={44} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  body: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
  rating: { color: colors.gold, fontSize: 11, fontWeight: "800", marginRight: 4 },
});
