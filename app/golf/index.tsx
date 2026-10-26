// app/golf/index.tsx
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import VisionScreenHeader from "../components/VisionScreenHeader";
import { fetchUserGolfSessions, golfFormatLabel } from "../../lib/backend/golfSession";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function GolfHubScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchUserGolfSessions>>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setSessions(await fetchUserGolfSessions(userId, 10));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <ScreenCanvas>
      <VisionScreenHeader title="Golf Proof" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hero}>AI-assisted round proof</Text>
        <Text style={styles.sub}>
          GPS check-in, hole scores, scorecard photo — AI reads and verifies.
        </Text>

        <Pressable
          onPress={() => router.push("/golf/start" as Href)}
          style={({ pressed }) => [styles.cta, pressSoft(pressed)]}
        >
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.ctaText}>Start Golf Round</Text>
        </Pressable>

        <Text style={styles.section}>Recent Rounds</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : sessions.length === 0 ? (
          <Text style={styles.empty}>No rounds yet.</Text>
        ) : (
          sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => {
                const route =
                  s.status === "active"
                    ? `/golf/${s.id}/score`
                    : `/golf/${s.id}/submit`;
                router.push(route as Href);
              }}
              style={({ pressed }) => [styles.row, pressSoft(pressed)]}
            >
              <View>
                <Text style={styles.rowTitle}>{s.course_name}</Text>
                <Text style={styles.rowMeta}>
                  {golfFormatLabel(s.format)} • {s.status}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  hero: { color: colors.text, fontSize: 20, fontWeight: "900", marginBottom: 6 },
  sub: { color: colors.textSecondary, fontSize: 14, marginBottom: 20, lineHeight: 20 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  section: { color: colors.text, fontWeight: "900", marginBottom: 10 },
  empty: { color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.text, fontWeight: "800" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
