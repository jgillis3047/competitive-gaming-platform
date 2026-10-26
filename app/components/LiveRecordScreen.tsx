// app/components/LiveRecordScreen.tsx — In-app camera with live counters
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useVideoOutput,
  type CameraRef,
  type Recorder,
} from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatCourtScore } from "../../lib/backend/courts";
import { uploadCourtProofMedia, uploadShootingSessionVideo } from "../../lib/backend/mediaService";
import { validateInPersonProof } from "../../lib/backend/inPersonAiValidation";
import {
  createShootingSession,
  triggerShootingAnalysis,
  updateShootingSessionVideo,
} from "../../lib/backend/shootingSession";
import { getLeaderboardCategory } from "../../lib/data/leaderboardTaxonomy";
import { recordPracticeAttempt, getPracticeProgress } from "../../lib/data/practiceProgress";
import {
  liveRecordConfigForSlug,
  primaryLiveScore,
  type LiveRecordConfig,
} from "../../lib/live/activityLiveConfig";
import { EMPTY_LIVE_COUNTERS, type LiveCounterSnapshot } from "../../lib/live/types";
import { toFileUri } from "../../lib/live/toFileUri";
import type { ShootingSessionType } from "../../lib/models/visionTypes";
import { useAuthStore } from "../../lib/data/authStore";
import { colors } from "../../lib/theme/colors";

type Flow = "shooting" | "practice";

export type LiveRecordScreenProps = {
  flow: Flow;
  recordSlug?: string | null;
  sessionType?: ShootingSessionType;
  challengeId?: string | null;
  timeLimitSec?: number | null;
};

function formatTimer(sec: number, countdown: boolean): string {
  const s = Math.max(0, Math.floor(sec));
  const tenths = Math.floor((sec % 1) * 10);
  if (countdown) {
    return `${s}.${tenths}s`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }
  return tenths > 0 ? `${s}.${tenths}s` : `${s}s`;
}

export default function LiveRecordScreen({
  flow,
  recordSlug,
  sessionType = "free_throw",
  challengeId,
  timeLimitSec: timeLimitParam,
}: LiveRecordScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);

  const liveConfig = useMemo(() => liveRecordConfigForSlug(recordSlug), [recordSlug]);
  const effectiveLimit =
    timeLimitParam ?? liveConfig.timeLimitSec ?? (flow === "shooting" ? 60 : null);

  const device = useCameraDevice("back");
  const camPerm = useCameraPermission();

  const cameraRef = useRef<CameraRef>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    enableAudio: false,
  });
  const cameraOutputs = useMemo(() => [videoOutput], [videoOutput]);

  const [phase, setPhase] = useState<"idle" | "countdown" | "recording" | "done">("idle");
  const [countdown, setCountdown] = useState(3);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [counters, setCounters] = useState<LiveCounterSnapshot>(EMPTY_LIVE_COUNTERS);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const countdownMode = effectiveLimit != null && liveConfig.mode !== "stopwatch";

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    tickRef.current = null;
    countdownRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!camPerm.hasPermission) camPerm.requestPermission();
  }, [camPerm]);

  const bump = useCallback((fn: (c: LiveCounterSnapshot) => LiveCounterSnapshot) => {
    setCounters((prev) => fn(prev));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onMake = () => {
    bump((c) => {
      const streak = c.streak + 1;
      return {
        ...c,
        attempts: c.attempts + 1,
        makes: c.makes + 1,
        streak,
        bestStreak: Math.max(c.bestStreak, streak),
      };
    });
  };

  const onMiss = () => {
    bump((c) => ({
      ...c,
      attempts: c.attempts + 1,
      misses: c.misses + 1,
      streak: 0,
    }));
  };

  const onRep = () => {
    bump((c) => ({ ...c, reps: c.reps + 1, attempts: c.attempts + 1 }));
  };

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder?.isRecording) return;
    clearTimers();
    try {
      await recorder.stopRecording();
    } catch {
      setPhase("idle");
    }
  }, [clearTimers]);

  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  const startTick = useCallback(() => {
    const started = Date.now();
    tickRef.current = setInterval(() => {
      const recorder = recorderRef.current;
      const fromRecorder = recorder?.isRecording ? recorder.recordedDuration : 0;
      const elapsed = fromRecorder > 0 ? fromRecorder : (Date.now() - started) / 1000;

      if (countdownMode && effectiveLimit != null) {
        const left = Math.max(0, effectiveLimit - elapsed);
        setElapsedSec(left);
        setCounters((c) => ({ ...c, elapsedSec: left }));
        if (left <= 0.05) {
          void stopRecordingRef.current();
        }
      } else {
        setElapsedSec(elapsed);
        setCounters((c) => ({ ...c, elapsedSec: elapsed }));
      }
    }, 100);
  }, [countdownMode, effectiveLimit]);

  const beginRecording = useCallback(async () => {
    if (!videoOutput || !cameraReady) return;
    try {
      const settings =
        effectiveLimit != null ? { maxDuration: effectiveLimit + 1 } : {};
      const recorder = await videoOutput.createRecorder(settings);
      recorderRef.current = recorder;

      await recorder.startRecording(
        (filePath, reason) => {
          clearTimers();
          setVideoPath(filePath);
          setPhase("done");
          if (reason === "max-duration-reached") {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
        (err) => {
          clearTimers();
          Alert.alert("Recording error", err.message);
          setPhase("idle");
        }
      );

      setPhase("recording");
      startTick();
    } catch (e: any) {
      Alert.alert("Could not start", e?.message ?? "Recording failed.");
      setPhase("idle");
    }
  }, [videoOutput, cameraReady, effectiveLimit, clearTimers, startTick]);

  const startSession = () => {
    if (!camPerm.hasPermission) {
      Alert.alert("Camera", "Allow camera access to use live recording.");
      return;
    }
    setCounters(EMPTY_LIVE_COUNTERS);
    setVideoPath(null);
    setCountdown(3);
    setPhase("countdown");
    let n = 3;
    countdownRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        void beginRecording();
        return;
      }
      setCountdown(n);
    }, 1000);
  };

  const submitShooting = async (uri: string, durationSec: number) => {
    if (!userId) throw new Error("Sign in required.");
    const session = await createShootingSession({
      userId,
      sessionType,
      challengeId: challengeId ?? null,
      timeLimitSec: effectiveLimit,
      videoDurationSec: durationSec,
    });
    const uploaded = await uploadShootingSessionVideo({ userId, localUri: uri });
    await updateShootingSessionVideo(session.id, uploaded.storagePath);
    await triggerShootingAnalysis({
      sessionId: session.id,
      videoPath: uploaded.storagePath,
      sessionType,
      timeLimitSec: effectiveLimit,
      recordSlug: recordSlug ?? null,
    });
    Alert.alert(
      "Analyzing",
      `Live: ${counters.makes} makes, ${counters.misses} misses. Server analysis is official.`,
      [{ text: "View", onPress: () => router.replace(`/vision/shooting-session/${session.id}` as Href) }]
    );
  };

  const submitPractice = async (uri: string, durationSec: number) => {
    if (!userId || !recordSlug) throw new Error("Sign in required.");
    const category = getLeaderboardCategory(recordSlug);
    if (!category) throw new Error("Unknown activity.");

    const elapsedForScore =
      liveConfig.mode === "stopwatch"
        ? counters.elapsedSec
        : countdownMode && effectiveLimit
          ? effectiveLimit - elapsedSec
          : counters.elapsedSec;

    const suggested = primaryLiveScore(liveConfig, {
      makes: counters.makes,
      reps: counters.reps,
      bestStreak: counters.bestStreak,
      elapsedSec: elapsedForScore,
    });

    if (suggested == null || suggested <= 0) {
      Alert.alert(
        "No live score",
        "Use the counters during recording, or enter your score manually on the practice screen."
      );
      router.back();
      return;
    }

    const up = await uploadCourtProofMedia({ userId, localUri: uri, mediaType: "video", durationMs: durationSec * 1000 });
    const reportedLabel = formatCourtScore(suggested, recordSlug);
    const validation = await validateInPersonProof({
      userId,
      recordSlug,
      reportedScore: suggested,
      reportedScoreLabel: reportedLabel,
      proofStoragePaths: [up.storagePath],
      proofMediaType: "video",
      challengeId: challengeId ?? null,
    });

    if (validation.verdict === "rejected") {
      Alert.alert("AI rejected", validation.summary);
      return;
    }

    await recordPracticeAttempt(recordSlug, suggested, {
      scoreLabel: reportedLabel,
      aiSummary: validation.summary,
      aiVerdict: validation.verdict,
    });
    await getPracticeProgress(recordSlug);

    Alert.alert(
      validation.verdict === "approved" ? "Logged ✓" : "Saved for review",
      `Live: ${reportedLabel}. AI: ${validation.summary}`,
      [{ text: "Done", onPress: () => router.back() }]
    );
  };

  const onSubmit = async () => {
    if (!videoPath) return;
    const uri = toFileUri(videoPath);
    const durationSec =
      countdownMode && effectiveLimit ? effectiveLimit - elapsedSec : elapsedSec;

    setBusy(true);
    try {
      if (flow === "shooting") {
        await submitShooting(uri, Math.max(1, durationSec));
      } else {
        await submitPractice(uri, Math.max(1, durationSec));
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const renderStats = (cfg: LiveRecordConfig) => (
    <View style={styles.statsRow}>
      {(cfg.showMakeMiss || cfg.mode === "streak") && (
        <>
          <Stat label="Makes" value={String(counters.makes)} color={colors.success} />
          <Stat label="Miss" value={String(counters.misses)} color={colors.heat} />
        </>
      )}
      {cfg.showRepButton && <Stat label="Reps" value={String(counters.reps)} color={colors.accentTab} />}
      {cfg.showStreak && <Stat label="Streak" value={String(counters.streak)} color={colors.accentTab} />}
      {cfg.showStopwatch && (
        <Stat
          label={countdownMode ? "Left" : "Time"}
          value={formatTimer(elapsedSec, countdownMode)}
          color={colors.text}
        />
      )}
      {phase === "recording" && !cfg.showStopwatch && effectiveLimit != null && (
        <Stat label="Left" value={formatTimer(elapsedSec, true)} color={colors.accentTab} />
      )}
    </View>
  );

  if (!device) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>No camera device found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Live recording requires iOS or Android dev build.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase !== "done"}
        outputs={cameraOutputs}
        onStarted={() => setCameraReady(true)}
      />

      <View style={[styles.overlay, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{liveConfig.title}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {liveConfig.hint}
            </Text>
          </View>
        </View>

        {phase === "countdown" ? (
          <View style={styles.countdownWrap}>
            <Text style={styles.countdownNum}>{countdown}</Text>
          </View>
        ) : null}

        {(phase === "recording" || phase === "done") && renderStats(liveConfig)}

        {phase === "recording" && (
          <View style={styles.controls}>
            {liveConfig.showMakeMiss && (
              <View style={styles.row}>
                <Pressable onPress={onMiss} style={[styles.actionBtn, styles.missBtn]}>
                  <Text style={styles.actionText}>MISS</Text>
                </Pressable>
                <Pressable onPress={onMake} style={[styles.actionBtn, styles.makeBtn]}>
                  <Text style={styles.actionText}>MAKE</Text>
                </Pressable>
              </View>
            )}
            {liveConfig.showRepButton && (
              <Pressable onPress={onRep} style={[styles.actionBtn, styles.repBtn]}>
                <Text style={styles.actionText}>+1 REP</Text>
              </Pressable>
            )}
            <Pressable onPress={() => void stopRecording()} style={styles.stopBtn}>
              <View style={styles.stopSquare} />
              <Text style={styles.stopText}>Stop</Text>
            </Pressable>
          </View>
        )}

        {phase === "idle" && (
          <View style={styles.bottomIdle}>
            <Pressable onPress={startSession} style={styles.recordCircle}>
              <View style={styles.recordInner} />
            </Pressable>
            <Text style={styles.idleHint}>
              {effectiveLimit ? `${effectiveLimit}s session` : "Tap to record with live counters"}
            </Text>
          </View>
        )}

        {phase === "done" && videoPath && (
          <View style={styles.doneBar}>
            <Text style={styles.doneText}>Recording ready · tap submit for AI validation</Text>
            <Pressable onPress={onSubmit} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topBar: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1 },
  title: { color: "#fff", fontWeight: "900", fontSize: 16 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 11, lineHeight: 15, marginTop: 2 },
  countdownWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  countdownNum: { color: "#fff", fontSize: 96, fontWeight: "900" },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  stat: { alignItems: "center", minWidth: 56 },
  statVal: { fontSize: 28, fontWeight: "900" },
  statLbl: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", marginTop: 2 },
  controls: { alignItems: "center", gap: 12, paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 12, width: "100%" },
  actionBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  makeBtn: { backgroundColor: colors.success },
  missBtn: { backgroundColor: colors.heat },
  repBtn: { width: "100%", backgroundColor: colors.accentCTA },
  actionText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  stopBtn: { alignItems: "center", gap: 6, marginTop: 4 },
  stopSquare: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.heat },
  stopText: { color: "#fff", fontWeight: "800" },
  bottomIdle: { alignItems: "center", gap: 10 },
  recordCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  recordInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.heat },
  idleHint: { color: "rgba(255,255,255,0.9)", fontWeight: "700" },
  doneBar: { paddingHorizontal: 16, gap: 10 },
  doneText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  submitBtn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  fallbackText: { color: colors.textMuted, textAlign: "center", marginBottom: 12 },
  link: { color: colors.accentTab, fontWeight: "800" },
});
