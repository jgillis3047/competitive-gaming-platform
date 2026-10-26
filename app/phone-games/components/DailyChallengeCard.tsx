import { Link } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getTodayDailyChallenge, type DailyChallengeInfo } from "../../../lib/data/dailyChallenge";
import { colors } from "../../../lib/theme/colors";
import { pressSoft } from "../../../lib/ui/pressableStyles";

export default function DailyChallengeCard() {
  const [daily, setDaily] = useState<DailyChallengeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getTodayDailyChallenge()
      .then((d) => {
        if (mounted) setDaily(d);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!daily) return null;

  const href = `${daily.route}?daily=1` as const;

  return (
    <View style={[styles.card, daily.completed && styles.cardDone]}>
      <View style={styles.topRow}>
        <Text style={styles.kicker}>Daily challenge</Text>
        <View style={[styles.pill, daily.completed ? styles.pillDone : styles.pillOpen]}>
          <Text style={styles.pillText}>{daily.completed ? "Done" : "Live"}</Text>
        </View>
      </View>
      <Text style={styles.title}>{daily.config.title}</Text>
      <Text style={styles.sub}>{daily.config.subtitle ?? "One featured game every day. Beat your best."}</Text>
      <Link href={href as any} asChild>
        <Pressable style={({ pressed }) => [styles.btn, pressSoft(pressed)]}>
          <Text style={styles.btnText}>{daily.completed ? "Play again" : "Play today's challenge"}</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    gap: 8,
  },
  cardDone: {
    backgroundColor: colors.goldSurface,
    borderColor: colors.goldBorder,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: colors.accentMuted, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillOpen: { backgroundColor: "rgba(34,197,94,0.2)", borderWidth: 1, borderColor: "rgba(34,197,94,0.4)" },
  pillDone: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
  pillText: { color: colors.text, fontWeight: "900", fontSize: 11 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  sub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  btn: {
    marginTop: 6,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: colors.text, fontWeight: "900", fontSize: 14 },
});
