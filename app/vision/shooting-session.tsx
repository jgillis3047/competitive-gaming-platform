// app/vision/shooting-session.tsx — Record + upload + analyze
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import VisionScreenHeader from "../components/VisionScreenHeader";
import { uploadShootingSessionVideo } from "../../lib/backend/mediaService";
import {
  createShootingSession,
  triggerShootingAnalysis,
  updateShootingSessionVideo,
} from "../../lib/backend/shootingSession";
import { getInPersonGameSpec } from "../../lib/data/inPersonGameSpecs";
import {
  defaultTimeLimitSec,
  requiresArcValidation,
} from "../../lib/data/shootingRecordingRules";
import { liveRecordHref } from "../../lib/live/liveRecordHref";
import type { ShootingSessionType } from "../../lib/models/visionTypes";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";

const SESSION_TYPES: { key: ShootingSessionType; label: string; icon: string }[] = [
  { key: "free_throw", label: "Free Throws", icon: "basketball-outline" },
  { key: "three_point", label: "3-Pointers", icon: "locate-outline" },
  { key: "midrange", label: "Midrange", icon: "radio-button-on-outline" },
  { key: "mixed", label: "Mixed", icon: "shuffle-outline" },
];

const DURATION_TOLERANCE_SEC = 2;

export default function ShootingSessionScreen() {
  const router = useRouter();
  const { challengeId, sessionType: sessionTypeParam, timeLimitSec, recordSlug } = useLocalSearchParams<{
    challengeId?: string;
    sessionType?: string;
    timeLimitSec?: string;
    recordSlug?: string;
  }>();
  const userId = useAuthStore((s) => s.user?.id);

  const initialType = (["free_throw", "three_point", "midrange", "mixed"] as const).includes(
    sessionTypeParam as ShootingSessionType
  )
    ? (sessionTypeParam as ShootingSessionType)
    : "free_throw";
  const [sessionType, setSessionType] = useState<ShootingSessionType>(initialType);
  const paramTimedSec = timeLimitSec ? Number(timeLimitSec) : null;
  const effectiveTimedSec =
    paramTimedSec ??
    defaultTimeLimitSec(sessionType, recordSlug ?? null);
  const gameSpec = useMemo(
    () => (recordSlug ? getInPersonGameSpec(recordSlug) : null),
    [recordSlug]
  );
  const recordingRequirements =
    gameSpec?.recordingRequirements ??
    [
      "Sideline or baseline angle — court markings visible",
      "Full body of shooter visible at release",
      "Stable phone position (tripod or propped)",
      "Entire hoop in frame",
    ];
  const submitChecklist = gameSpec?.submitChecklist ?? [];
  const arcValidation = requiresArcValidation(recordSlug ?? null, sessionType);

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, []);

  const validateDuration = (durationMs: number | undefined | null): boolean => {
    if (!effectiveTimedSec || durationMs == null) return true;
    const sec = durationMs / 1000;
    if (sec > effectiveTimedSec + DURATION_TOLERANCE_SEC) {
      Alert.alert(
        "Video too long",
        `This challenge allows ${effectiveTimedSec}s. Your clip is ${Math.round(sec)}s — record again with the in-app timer.`
      );
      return false;
    }
    return true;
  };

  const attachVideo = (uri: string, durationMs?: number | null) => {
    if (!validateDuration(durationMs ?? null)) return;
    setVideoUri(uri);
    setVideoDurationSec(durationMs != null ? Math.round(durationMs / 100) / 10 : null);
  };

  const launchCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Camera access needed.");
      return;
    }

    const maxDuration = effectiveTimedSec ?? 300;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: maxDuration,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      attachVideo(asset.uri, asset.duration ?? null);
    }
  };

  const startTimedRecording = () => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(3);
    let n = 3;
    countdownTimer.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        countdownTimer.current = null;
        setCountdown(null);
        void launchCamera();
        return;
      }
      setCountdown(n);
    }, 1000);
  };

  const recordVideo = async (useCamera: boolean) => {
    if (useCamera && effectiveTimedSec) {
      startTimedRecording();
      return;
    }

    if (useCamera) {
      await launchCamera();
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Media library access needed.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      attachVideo(asset.uri, asset.duration ?? null);
    }
  };

  const submit = async () => {
    if (!userId || !videoUri) {
      Alert.alert("Missing video", "Record or pick a shooting clip first.");
      return;
    }

    setBusy(true);
    try {
      const session = await createShootingSession({
        userId,
        sessionType,
        challengeId: challengeId ?? null,
        timeLimitSec: effectiveTimedSec,
        videoDurationSec: videoDurationSec,
      });

      const uploaded = await uploadShootingSessionVideo({ userId, localUri: videoUri });
      await updateShootingSessionVideo(session.id, uploaded.storagePath);

      await triggerShootingAnalysis({
        sessionId: session.id,
        videoPath: uploaded.storagePath,
        sessionType,
        timeLimitSec: effectiveTimedSec,
        recordSlug: recordSlug ?? null,
      });

      Alert.alert("Analyzing", "AI is counting your shots and checking arc rules. Results in a few minutes.", [
        { text: "View", onPress: () => router.replace(`/vision/shooting-session/${session.id}` as Href) },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenCanvas variant="gold">
      <VisionScreenHeader title="Shot Tracker" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.tipCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.accentTab} />
          <View style={styles.tipBody}>
            <Text style={styles.tipTitle}>Recording requirements</Text>
            {recordingRequirements.map((rule) => (
              <Text key={rule} style={styles.tipBullet}>
                • {rule}
              </Text>
            ))}
            {effectiveTimedSec ? (
              <Text style={styles.tipTimed}>
                Timed challenge: recording auto-stops at {effectiveTimedSec}s.
              </Text>
            ) : (
              <Text style={styles.tipTimed}>Record 2–5 min for untimed sessions.</Text>
            )}
            {arcValidation ? (
              <Text style={styles.tipArc}>
                Only makes from behind the 3-point arc count toward your score.
              </Text>
            ) : null}
            {challengeId ? (
              <Text style={styles.tipLinked}>Linked to your in-person challenge.</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>Session type</Text>
        <View style={styles.typeGrid}>
          {SESSION_TYPES.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setSessionType(t.key)}
              style={[styles.typeChip, sessionType === t.key && styles.typeChipOn]}
            >
              <Ionicons
                name={t.icon as any}
                size={18}
                color={sessionType === t.key ? colors.accentTab : colors.textMuted}
              />
              <Text style={[styles.typeChipText, sessionType === t.key && styles.typeChipTextOn]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Video</Text>
        <Pressable
          onPress={() =>
            router.push(
              liveRecordHref({
                flow: "shooting",
                recordSlug: recordSlug ?? null,
                sessionType,
                challengeId: challengeId ?? null,
                timeLimitSec: effectiveTimedSec,
              })
            )
          }
          style={[styles.liveRecordBtn]}
        >
          <Ionicons name="radio-button-on" size={22} color="#fff" />
          <View style={styles.liveRecordBody}>
            <Text style={styles.liveRecordTitle}>Record with live counters</Text>
            <Text style={styles.liveRecordSub}>
              MAKE / MISS updates on screen{effectiveTimedSec ? ` · ${effectiveTimedSec}s timer` : ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <View style={styles.videoRow}>
          <Pressable onPress={() => recordVideo(true)} style={styles.videoBtn}>
            <Ionicons name="videocam-outline" size={22} color={colors.text} />
            <Text style={styles.videoBtnText}>
              {effectiveTimedSec ? `Basic ${effectiveTimedSec}s` : "Basic camera"}
            </Text>
          </Pressable>
          <Pressable onPress={() => recordVideo(false)} style={styles.videoBtn}>
            <Ionicons name="folder-open-outline" size={22} color={colors.text} />
            <Text style={styles.videoBtnText}>Library</Text>
          </Pressable>
        </View>
        {videoUri ? (
          <Text style={styles.attached}>
            Video attached ✓
            {videoDurationSec != null ? ` (${videoDurationSec}s)` : ""}
          </Text>
        ) : null}

        {submitChecklist.length > 0 ? (
          <View style={styles.checklistBox}>
            <Text style={styles.tipTitle}>Before you submit</Text>
            {submitChecklist.map((item) => (
              <Text key={item} style={styles.tipBullet}>
                ☐ {item}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy || !videoUri}
          style={[styles.submitBtn, (busy || !videoUri) && { opacity: 0.5 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Upload & Analyze Shots</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={countdown != null} transparent animationType="fade">
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownLabel}>Get set — recording starts now</Text>
          <Text style={styles.countdownNum}>{countdown}</Text>
          <Text style={styles.countdownHint}>
            {effectiveTimedSec}s max · sideline angle · full body visible
          </Text>
        </View>
      </Modal>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  tipCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.accentBorderSubtle,
  },
  tipBody: { flex: 1, gap: 4 },
  tipTitle: { color: colors.text, fontWeight: "900", fontSize: 14, marginBottom: 4 },
  tipBullet: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  tipTimed: { color: colors.accentTab, fontSize: 12, fontWeight: "700", marginTop: 6 },
  tipArc: { color: colors.heat, fontSize: 12, fontWeight: "700", marginTop: 4 },
  tipLinked: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  label: { color: colors.text, fontWeight: "800", fontSize: 14, marginBottom: 10 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipOn: { borderColor: colors.accentTab, backgroundColor: colors.accentChip },
  typeChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
  typeChipTextOn: { color: colors.text },
  liveRecordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  liveRecordBody: { flex: 1 },
  liveRecordTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  liveRecordSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  videoRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  videoBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  videoBtnText: { color: colors.text, fontWeight: "800" },
  attached: { color: colors.success, fontWeight: "700", marginBottom: 16 },
  submitBtn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  countdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  countdownLabel: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 16 },
  countdownNum: { color: colors.accentTab, fontSize: 96, fontWeight: "900" },
  countdownHint: { color: colors.textMuted, fontSize: 13, marginTop: 20, textAlign: "center" },
  checklistBox: { marginBottom: 12, gap: 2 },
});
