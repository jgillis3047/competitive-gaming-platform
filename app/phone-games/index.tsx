import { Link, Stack } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { listPhoneGamesForHub } from "../../lib/data/dailyChallenge";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";
import DailyChallengeCard from "./components/DailyChallengeCard";

const GAMES = listPhoneGamesForHub();

export default function PhoneGamesHubScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Phone Games", headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Phone games</Text>
        <Text style={styles.sub}>
          Quick 1v1 skill games. Practice solo, then challenge someone for real stakes.
        </Text>

        <DailyChallengeCard />

        <Text style={styles.section}>All games</Text>
        <View style={styles.grid}>
          {GAMES.map((g) => (
            <Link key={g.key} href={`${g.phoneRoute}` as any} asChild>
              <Pressable style={({ pressed }) => [styles.gameCard, pressSoft(pressed)]}>
                <Text style={styles.gameTitle}>{g.title}</Text>
                <Text style={styles.gameSub} numberOfLines={2}>
                  {g.subtitle}
                </Text>
                <Text style={styles.playCta}>Play →</Text>
              </Pressable>
            </Link>
          ))}
        </View>

        <Link href="/(tabs)/create" asChild>
          <Pressable style={({ pressed }) => [styles.createBtn, pressSoft(pressed)]}>
            <Text style={styles.createBtnText}>Create 1v1 challenge</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 56, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  sub: { color: colors.textTertiary, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 16, fontWeight: "600" },
  section: { color: colors.textSecondary, fontWeight: "900", fontSize: 13, marginBottom: 10 },
  grid: { gap: 10 },
  gameCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 8,
  },
  gameTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  gameSub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17, fontWeight: "700" },
  playCta: { color: colors.accentMuted, fontWeight: "900", marginTop: 10, fontSize: 13 },
  createBtn: {
    marginTop: 8,
    backgroundColor: colors.actionBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  createBtnText: { color: colors.text, fontWeight: "900", fontSize: 15 },
});
