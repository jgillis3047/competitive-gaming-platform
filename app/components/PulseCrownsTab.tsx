import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { discoverPulseCrowns, type DiscoveryCrown } from "../../lib/backend/discovery";
import { PULSE_SECTION_CROWN_CHANGES } from "../../lib/theme/arenaCopy";
import { colors } from "../../lib/theme/colors";
import { radius, space } from "../../lib/theme/spacing";
import Avatar from "../../lib/ui/Avatar";
import EmptyState from "../../lib/ui/EmptyState";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function PulseCrownsTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [crowns, setCrowns] = useState<DiscoveryCrown[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCrowns(await discoverPulseCrowns(24));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.tabTitle}>Crowns</Text>
      <Text style={styles.sectionTitle}>{PULSE_SECTION_CROWN_CHANGES}</Text>
      {crowns.length > 0 ? (
        crowns.map((c) => (
          <Pressable
            key={c.id}
            onPress={() =>
              router.push(c.isTeam ? (`/team/${c.subjectId}` as any) : (`/user/${c.subjectId}` as any))
            }
            style={({ pressed }) => [styles.row, pressSoft(pressed)]}
          >
            <Text style={styles.crownEmoji}>👑</Text>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>{c.title}</Text>
              <View style={styles.holderRow}>
                <Avatar imageUrl={c.holderAvatarUrl} name={c.holderName} size={22} />
                <Text style={styles.holder} numberOfLines={1}>
                  {c.isTeam ? `Crew · ${c.holderName}` : c.holderName}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ))
      ) : (
        <EmptyState
          icon={<Ionicons name="ribbon-outline" size={32} color={colors.gold} />}
          title="No crowns yet"
          subtitle="Claim a spot on Explore or compete at an arena to earn a crown."
          actionLabel="Explore arenas"
          onAction={() => router.push("/(tabs)/leaderboards" as any)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  center: { padding: 40, alignItems: "center" },
  tabTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
  },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceFaint,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
  },
  crownEmoji: { fontSize: 22 },
  body: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: "800", lineHeight: 20 },
  holderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  holder: { color: colors.textMuted, fontSize: 12, fontWeight: "700", flex: 1 },
});
