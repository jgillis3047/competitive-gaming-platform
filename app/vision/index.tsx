// app/vision/index.tsx — Arena Vision hub
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
import {
  fetchUserShootingSessions,
  formatFgPercent,
  sessionTypeLabel,
} from "../../lib/backend/shootingSession";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

export default function VisionHubScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof fetchUserShootingSessions>>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const rows = await fetchUserShootingSessions(userId, 10);
      setSessions(rows);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenCanvas variant="gold">
      <VisionScreenHeader title="Arena Vision" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.hero}>Ball AI-style shot tracking for basketball.</Text>
        <Text style={styles.sub}>
          Record from a fixed angle. AI counts makes, misses, FG%, and streaks.
        </Text>

        <Pressable
          onPress={() => router.push("/vision/shooting-session" as Href)}
          style={({ pressed }) => [styles.cta, pressSoft(pressed)]}
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Start Shooting Session</Text>
            <Text style={styles.ctaSub}>Free throws, 3s, midrange — phone facing hoop</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>

        <Pressable
          onPress={() => router.push("/golf" as Href)}
          style={({ pressed }) => [styles.ctaSecondary, pressSoft(pressed)]}
        >
          <Ionicons name="golf-outline" size={22} color={colors.accentTab} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitleSec}>Golf Round Proof</Text>
            <Text style={styles.ctaSubSec}>Scorecard + GPS + AI review</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
        ) : sessions.length === 0 ? (
          <Text style={styles.empty}>No sessions yet. Record your first workout.</Text>
        ) : (
          sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/vision/shooting-session/${s.id}` as Href)}
              style={({ pressed }) => [styles.sessionRow, pressSoft(pressed)]}
            >
              <View>
                <Text style={styles.sessionTitle}>{sessionTypeLabel(s.session_type)}</Text>
                <Text style={styles.sessionMeta}>
                  {s.status === "complete"
                    ? `${s.makes ?? 0}/${s.total_shots ?? 0} (${formatFgPercent(s.makes, s.total_shots)})`
                    : s.status}
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
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  hero: { color: colors.text, fontSize: 20, fontWeight: "900", marginBottom: 6 },
  sub: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  ctaTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  ctaSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  ctaSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaTitleSec: { color: colors.text, fontWeight: "900", fontSize: 16 },
  ctaSubSec: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 10 },
  empty: { color: colors.textMuted, fontSize: 14 },
  sessionRow: {
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
  sessionTitle: { color: colors.text, fontWeight: "800", fontSize: 15 },
  sessionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
