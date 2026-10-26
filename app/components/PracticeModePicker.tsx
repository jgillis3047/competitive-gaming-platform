// app/components/PracticeModePicker.tsx
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  groupPracticeActivities,
  PRACTICE_NOT_AVAILABLE,
} from "../../lib/data/practiceMode";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function PracticeModePicker() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => groupPracticeActivities(query), [query]);
  const totalCount = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  return (
    <View style={styles.wrap}>
      <View style={styles.introCard}>
        <Text style={styles.introTitle}>No stakes. No opponent.</Text>
        <Text style={styles.introSub}>
          Play as much as you want — personal bests and streaks save locally.
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/practice/history" as Href)}
        style={({ pressed }) => [styles.historyBtn, pressSoft(pressed)]}
      >
        <Ionicons name="time-outline" size={18} color={colors.gold} />
        <Text style={styles.historyBtnText}>History</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: "auto" }} />
      </Pressable>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search practice activities…"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {totalCount === 0 ? (
        <Text style={styles.empty}>No activities match that search.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.category} style={styles.section}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            <Text style={styles.sectionHint}>{group.hint}</Text>
            <View style={styles.list}>
              {group.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(item.route as Href)}
                  style={({ pressed }) => [styles.row, pressSoft(pressed)]}
                >
                  <Text style={styles.emoji}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSub}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}

      <View style={styles.excludeCard}>
        <Text style={styles.excludeTitle}>Needs an opponent</Text>
        {PRACTICE_NOT_AVAILABLE.map((line) => (
          <Text key={line} style={styles.excludeLine}>
            · {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  introCard: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  introTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  introSub: { color: colors.textTertiary, fontSize: 12, lineHeight: 17, marginTop: 4, fontWeight: "600" },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    backgroundColor: colors.goldSurfaceMuted,
  },
  historyBtnText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  empty: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginVertical: 16 },
  section: { marginTop: 12 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  sectionHint: { color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 8, fontWeight: "600" },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
  },
  emoji: { fontSize: 20 },
  rowTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  rowSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  excludeCard: {
    marginTop: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgDeep,
  },
  excludeTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginBottom: 6 },
  excludeLine: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginTop: 2 },
});
