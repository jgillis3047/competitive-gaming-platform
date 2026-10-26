// app/vision/shooting-session/[id].tsx — Session recap
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import VisionScreenHeader from "../../components/VisionScreenHeader";
import {
  fetchShootingSession,
  fetchTrackedShots,
  formatFgPercent,
  sessionTypeLabel,
} from "../../../lib/backend/shootingSession";
import type { ShootingSessionRow, TrackedShotRow } from "../../../lib/models/visionTypes";
import ScreenCanvas from "../../../lib/ui/ScreenCanvas";
import { colors } from "../../../lib/theme/colors";
import { supabase } from "../../../lib/backend/supabaseClient";

function arcBadge(shot: TrackedShotRow): { label: string; color: string } | null {
  if (shot.behind_arc === true) return { label: "Behind arc", color: colors.success };
  if (shot.behind_arc === false) return { label: "Inside arc", color: colors.heat };
  return null;
}

export default function ShootingSessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id ?? "");

  const [session, setSession] = useState<ShootingSessionRow | null>(null);
  const [shots, setShots] = useState<TrackedShotRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [s, t] = await Promise.all([
        fetchShootingSession(sessionId),
        fetchTrackedShots(sessionId),
      ]);
      setSession(s);
      setShots(t);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sessionId || session?.status === "complete" || session?.status === "failed") return;

    const channel = supabase
      .channel(`shooting-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shooting_sessions", filter: `id=eq.${sessionId}` },
        () => { load(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, session?.status, load]);

  if (loading && !session) {
    return (
      <ScreenCanvas>
        <VisionScreenHeader title="Session" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </ScreenCanvas>
    );
  }

  if (!session) {
    return (
      <ScreenCanvas>
        <VisionScreenHeader title="Session" />
        <Text style={styles.err}>Session not found.</Text>
      </ScreenCanvas>
    );
  }

  const processing = session.status === "processing" || session.status === "uploading";
  const ruleFlags = session.rule_flags ?? [];
  const showQualified =
    session.qualified_makes != null &&
    session.makes != null &&
    session.qualified_makes !== session.makes;

  return (
    <ScreenCanvas variant="gold">
      <VisionScreenHeader title="Shot Recap" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.type}>{sessionTypeLabel(session.session_type)}</Text>

        {processing ? (
          <View style={styles.processing}>
            <ActivityIndicator size="large" color={colors.accentTab} />
            <Text style={styles.processingText}>AI analyzing shots & arc rules…</Text>
            <Pressable onPress={load} style={styles.refreshBtn}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>
        ) : session.status === "failed" ? (
          <View style={styles.failBox}>
            <Ionicons name="warning-outline" size={24} color={colors.heat} />
            <Text style={styles.failText}>{session.error_message ?? "Analysis failed."}</Text>
            <Text style={styles.failHint}>
              Deploy the shot-tracker service and set SHOT_TRACKER_URL in Supabase secrets.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>{session.total_shots ?? 0}</Text>
                <Text style={styles.statLabel}>Shots</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.success }]}>
                  {session.qualified_makes ?? session.makes ?? 0}
                </Text>
                <Text style={styles.statLabel}>
                  {showQualified ? "Qualified makes" : "Makes"}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.heat }]}>{session.misses ?? 0}</Text>
                <Text style={styles.statLabel}>Misses</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNum}>
                  {formatFgPercent(session.qualified_makes ?? session.makes, session.total_shots)}
                </Text>
                <Text style={styles.statLabel}>FG%</Text>
              </View>
            </View>

            {showQualified ? (
              <Text style={styles.qualifiedNote}>
                Raw makes: {session.makes} — inside-arc makes excluded from score.
              </Text>
            ) : null}

            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Best streak</Text>
              <Text style={styles.streakValue}>{session.best_streak ?? 0}</Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>AI confidence</Text>
              <Text style={styles.streakValue}>
                {Math.round(Number(session.confidence ?? 0) * 100)}%
              </Text>
            </View>
            {session.video_duration_sec != null ? (
              <View style={styles.streakRow}>
                <Text style={styles.streakLabel}>Video length</Text>
                <Text style={styles.streakValue}>
                  {session.video_duration_sec}s
                  {session.time_limit_sec ? ` / ${session.time_limit_sec}s limit` : ""}
                </Text>
              </View>
            ) : null}

            {ruleFlags.length > 0 ? (
              <View style={styles.flagsBox}>
                <Text style={styles.flagsTitle}>Rule flags</Text>
                {ruleFlags.map((flag) => (
                  <Text key={flag} style={styles.flagItem}>
                    • {flag.replace(/_/g, " ")}
                  </Text>
                ))}
              </View>
            ) : null}

            {shots.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>Shot-by-shot</Text>
                {shots.map((shot) => {
                  const arc = arcBadge(shot);
                  return (
                    <View key={shot.id} style={styles.shotRow}>
                      <Text style={styles.shotNum}>#{shot.shot_number}</Text>
                      <Ionicons
                        name={shot.result === "make" ? "checkmark-circle" : "close-circle"}
                        size={20}
                        color={shot.result === "make" ? colors.success : colors.heat}
                      />
                      <Text style={styles.shotResult}>{shot.result}</Text>
                      {arc ? (
                        <Text style={[styles.arcTag, { color: arc.color }]}>{arc.label}</Text>
                      ) : null}
                      <Text style={styles.shotTime}>
                        {shot.timestamp_start != null ? `${shot.timestamp_start}s` : ""}
                      </Text>
                    </View>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  err: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
  type: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 16 },
  processing: { alignItems: "center", paddingVertical: 40, gap: 12 },
  processingText: { color: colors.textSecondary, fontWeight: "700" },
  refreshBtn: { marginTop: 8, padding: 10 },
  refreshText: { color: colors.accent, fontWeight: "800" },
  failBox: { alignItems: "center", padding: 20, gap: 8 },
  failText: { color: colors.heat, fontWeight: "800", textAlign: "center" },
  failHint: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statBox: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { color: colors.text, fontSize: 28, fontWeight: "900" },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  qualifiedNote: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
  streakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  streakLabel: { color: colors.textMuted, fontWeight: "700" },
  streakValue: { color: colors.text, fontWeight: "900" },
  flagsBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.heat,
  },
  flagsTitle: { color: colors.heat, fontWeight: "900", marginBottom: 6 },
  flagItem: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontWeight: "900", fontSize: 16, marginTop: 20, marginBottom: 10 },
  shotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  shotNum: { color: colors.textMuted, width: 36, fontWeight: "800" },
  shotResult: { color: colors.text, fontWeight: "700", textTransform: "capitalize", width: 48 },
  arcTag: { flex: 1, fontSize: 11, fontWeight: "800" },
  shotTime: { color: colors.textMuted, fontSize: 12 },
});
