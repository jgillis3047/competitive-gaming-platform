// app/golf/[sessionId]/submit.tsx — Scorecard upload + AI review
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AiReviewCard from "../../components/AiReviewCard";
import VisionScreenHeader from "../../components/VisionScreenHeader";
import {
  fetchGolfSession,
  fetchHoleScores,
  fetchLatestGolfAiReview,
  insertGolfProof,
  runGolfAiReview,
  submitGolfSession,
  totalStrokes,
} from "../../../lib/backend/golfSession";
import { uploadGolfProofMedia } from "../../../lib/backend/mediaService";
import type { GolfAiReviewRow, GolfSessionRow } from "../../../lib/models/visionTypes";
import { useAuthStore } from "../../../lib/data/authStore";
import ScreenCanvas from "../../../lib/ui/ScreenCanvas";
import { colors } from "../../../lib/theme/colors";

export default function GolfSubmitScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sid = String(sessionId ?? "");
  const userId = useAuthStore((s) => s.user?.id);

  const [session, setSession] = useState<GolfSessionRow | null>(null);
  const [myTotal, setMyTotal] = useState(0);
  const [scorecardUri, setScorecardUri] = useState<string | null>(null);
  const [teeUri, setTeeUri] = useState<string | null>(null);
  const [review, setReview] = useState<GolfAiReviewRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!sid || !userId) return;
    const [s, scores, r] = await Promise.all([
      fetchGolfSession(sid),
      fetchHoleScores(sid),
      fetchLatestGolfAiReview(sid),
    ]);
    setSession(s);
    setMyTotal(totalStrokes(scores, userId));
    setReview(r);
  }, [sid, userId]);

  useEffect(() => { load(); }, [load]);

  const pickMedia = async (kind: "scorecard" | "tee") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Media access needed.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "tee" ? ["videos", "images"] : ["images"],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    if (kind === "scorecard") setScorecardUri(res.assets[0].uri);
    else setTeeUri(res.assets[0].uri);
  };

  const submit = async () => {
    if (!userId || !session) return;
    if (!scorecardUri) {
      Alert.alert("Scorecard required", "Upload a photo of your scorecard.");
      return;
    }

    setBusy(true);
    try {
      const paths: string[] = [];

      const scUp = await uploadGolfProofMedia({
        userId,
        localUri: scorecardUri,
        mediaType: "image",
      });
      paths.push(scUp.storagePath);
      await insertGolfProof({
        sessionId: sid,
        uploadedBy: userId,
        proofType: "scorecard",
        storagePath: scUp.storagePath,
      });

      if (teeUri) {
        const isVideo = teeUri.toLowerCase().includes(".mp") || teeUri.includes("video");
        const teeUp = await uploadGolfProofMedia({
          userId,
          localUri: teeUri,
          mediaType: isVideo ? "video" : "image",
        });
        paths.push(teeUp.storagePath);
        await insertGolfProof({
          sessionId: sid,
          uploadedBy: userId,
          proofType: "tee_video",
          storagePath: teeUp.storagePath,
        });
      }

      await submitGolfSession(sid);

      const playerIds = [session.created_by, session.opponent_user_id].filter(Boolean) as string[];
      const reportedScores: Record<string, number> = {};
      if (userId) reportedScores[userId] = myTotal;

      const aiReview = await runGolfAiReview({
        sessionId: sid,
        proofStoragePaths: paths,
        reportedScores,
        playerIds,
      });
      setReview(aiReview);

      Alert.alert("Submitted", "AI review complete. Share with your opponent to confirm.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Submit failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenCanvas>
      <VisionScreenHeader title="Submit Result" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.course}>{session?.course_name}</Text>
        <Text style={styles.score}>Your score: {myTotal}</Text>

        <Text style={styles.label}>Upload scorecard (required)</Text>
        <Pressable onPress={() => pickMedia("scorecard")} style={styles.uploadBtn}>
          <Ionicons name="document-text-outline" size={22} color={colors.text} />
          <Text style={styles.uploadText}>{scorecardUri ? "Scorecard attached ✓" : "Choose scorecard photo"}</Text>
        </Pressable>

        <Text style={styles.label}>Tee shot video (optional)</Text>
        <Pressable onPress={() => pickMedia("tee")} style={styles.uploadBtn}>
          <Ionicons name="videocam-outline" size={22} color={colors.text} />
          <Text style={styles.uploadText}>{teeUri ? "Tee video attached ✓" : "Add tee shot clip"}</Text>
        </Pressable>

        <Pressable onPress={submit} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Submit for AI Review</Text>
          )}
        </Pressable>

        <AiReviewCard review={review} title="Golf AI Review" />
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  course: { color: colors.text, fontSize: 20, fontWeight: "900" },
  score: { color: colors.accentTab, fontWeight: "800", fontSize: 18, marginBottom: 20, marginTop: 4 },
  label: { color: colors.text, fontWeight: "800", marginBottom: 8, marginTop: 8 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  uploadText: { color: colors.text, fontWeight: "700" },
  btn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
