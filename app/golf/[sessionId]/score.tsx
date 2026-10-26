// app/golf/[sessionId]/score.tsx — Hole-by-hole score entry
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import VisionScreenHeader from "../../components/VisionScreenHeader";
import {
  fetchGolfSession,
  fetchHoleScores,
  totalStrokes,
  upsertHoleScore,
} from "../../../lib/backend/golfSession";
import type { GolfHoleScoreRow, GolfSessionRow } from "../../../lib/models/visionTypes";
import { useAuthStore } from "../../../lib/data/authStore";
import ScreenCanvas from "../../../lib/ui/ScreenCanvas";
import { colors } from "../../../lib/theme/colors";

export default function GolfScoreScreen() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sid = String(sessionId ?? "");
  const userId = useAuthStore((s) => s.user?.id);

  const [session, setSession] = useState<GolfSessionRow | null>(null);
  const [scores, setScores] = useState<GolfHoleScoreRow[]>([]);
  const [currentHole, setCurrentHole] = useState(1);
  const [strokes, setStrokes] = useState("");
  const [putts, setPutts] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    try {
      const [s, sc] = await Promise.all([fetchGolfSession(sid), fetchHoleScores(sid)]);
      setSession(s);
      setScores(sc);
      const myHoles = sc.filter((x) => x.user_id === userId).map((x) => x.hole_number);
      const next = Array.from({ length: s?.holes ?? 18 }, (_, i) => i + 1).find((h) => !myHoles.includes(h));
      if (next) setCurrentHole(next);
    } finally {
      setLoading(false);
    }
  }, [sid, userId]);

  useEffect(() => { load(); }, [load]);

  const saveHole = async () => {
    if (!userId || !session) return;
    const s = parseInt(strokes, 10);
    if (!Number.isFinite(s) || s < 1) return;

    setSaving(true);
    try {
      await upsertHoleScore({
        sessionId: sid,
        userId,
        holeNumber: currentHole,
        strokes: s,
        putts: putts ? parseInt(putts, 10) : null,
      });
      setStrokes("");
      setPutts("");
      await load();
      if (currentHole < session.holes) {
        setCurrentHole((h) => h + 1);
      }
    } finally {
      setSaving(false);
    }
  };

  const myTotal = userId ? totalStrokes(scores, userId) : 0;
  const done = session && scores.filter((s) => s.user_id === userId).length >= session.holes;

  if (loading) {
    return (
      <ScreenCanvas>
        <VisionScreenHeader title="Scoring" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </ScreenCanvas>
    );
  }

  return (
    <ScreenCanvas>
      <VisionScreenHeader title="Hole Scores" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.course}>{session?.course_name}</Text>
        <Text style={styles.total}>Your total: {myTotal || "—"}</Text>

        {!done ? (
          <>
            <Text style={styles.holeLabel}>Hole {currentHole}</Text>
            <Text style={styles.fieldLabel}>Strokes</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={strokes}
              onChangeText={setStrokes}
              placeholder="5"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Putts (optional)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={putts}
              onChangeText={setPutts}
              placeholder="2"
              placeholderTextColor={colors.textMuted}
            />
            <Pressable onPress={saveHole} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              <Text style={styles.saveText}>{saving ? "Saving…" : "Save Hole"}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.done}>All holes entered ✓</Text>
        )}

        <Pressable
          onPress={() => router.push(`/golf/${sid}/submit` as Href)}
          style={styles.submitBtn}
        >
          <Text style={styles.submitText}>Submit Round Proof</Text>
        </Pressable>

        {scores.filter((s) => s.user_id === userId).length > 0 ? (
          <>
            <Text style={styles.section}>Your card</Text>
            {scores
              .filter((s) => s.user_id === userId)
              .map((s) => (
                <View key={s.id} style={styles.scoreRow}>
                  <Text style={styles.scoreHole}>H{s.hole_number}</Text>
                  <Text style={styles.scoreVal}>{s.strokes}</Text>
                  {s.putts != null ? <Text style={styles.putts}>{s.putts} putts</Text> : null}
                </View>
              ))}
          </>
        ) : null}
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  course: { color: colors.text, fontSize: 20, fontWeight: "900" },
  total: { color: colors.accentTab, fontWeight: "800", marginBottom: 20, marginTop: 4 },
  holeLabel: { color: colors.text, fontSize: 28, fontWeight: "900", marginBottom: 16 },
  fieldLabel: { color: colors.textMuted, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: 14,
    fontSize: 18,
    marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveText: { color: colors.text, fontWeight: "900" },
  done: { color: colors.success, fontWeight: "800", marginBottom: 16 },
  submitBtn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  submitText: { color: "#fff", fontWeight: "900" },
  section: { color: colors.text, fontWeight: "900", marginBottom: 8 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  scoreHole: { color: colors.textMuted, width: 40, fontWeight: "800" },
  scoreVal: { color: colors.text, fontWeight: "900", fontSize: 16, width: 30 },
  putts: { color: colors.textMuted, fontSize: 12 },
});
