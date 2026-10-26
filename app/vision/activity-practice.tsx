// app/vision/activity-practice.tsx — Solo practice with AI proof validation
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import VisionScreenHeader from "../components/VisionScreenHeader";
import { validateInPersonProof } from "../../lib/backend/inPersonAiValidation";
import {
  formatCourtScore,
  formatSecondsAsMmSs,
  parseMileTimeToSeconds,
} from "../../lib/backend/courts";
import { uploadCourtProofMedia } from "../../lib/backend/mediaService";
import { validatorConfigForSlug } from "../../lib/data/inPersonAiValidation";
import { isWearableRunSlug } from "../../lib/data/inPersonGameSpecs";
import { supportsLiveRecord } from "../../lib/live/activityLiveConfig";
import { liveRecordHref } from "../../lib/live/liveRecordHref";
import { resolveInPersonVisionProfileFromSlug } from "../../lib/data/inPersonVisionConfig";
import { getPracticeProgress, recordPracticeAttempt } from "../../lib/data/practiceProgress";
import { getLeaderboardCategory, validateCategoryScore } from "../../lib/data/leaderboardTaxonomy";
import type { GameProgress } from "../../lib/data/gameProgress";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";
import { pressSoft } from "../../lib/ui/pressableStyles";

function formatPersonalBest(slug: string, progress: GameProgress): string | null {
  const cat = getLeaderboardCategory(slug);
  if (!cat) return null;

  if (
    !cat.higherIsBetter &&
    (cat.scoreUnit === "seconds" || cat.scoreUnit === "minutes") &&
    progress.bestTimeSec != null
  ) {
    const sec =
      cat.scoreUnit === "minutes" ? progress.bestTimeSec / 60 : progress.bestTimeSec;
    if (slug === "mile_run" || cat.scoreUnit === "seconds") {
      return formatSecondsAsMmSs(progress.bestTimeSec);
    }
    return String(Math.round(sec * 100) / 100);
  }

  if (progress.bestScore != null) {
    return formatCourtScore(progress.bestScore, slug);
  }

  return null;
}

export default function ActivityPracticeScreen() {
  const router = useRouter();
  const { recordSlug: recordSlugParam } = useLocalSearchParams<{ recordSlug?: string }>();
  const recordSlug = String(recordSlugParam ?? "");
  const userId = useAuthStore((s) => s.user?.id);

  const category = useMemo(() => getLeaderboardCategory(recordSlug), [recordSlug]);
  const visionProfile = useMemo(
    () => resolveInPersonVisionProfileFromSlug(recordSlug),
    [recordSlug]
  );
  const validatorConfig = useMemo(() => validatorConfigForSlug(recordSlug), [recordSlug]);

  const [scoreText, setScoreText] = useState("");
  const [localProofUri, setLocalProofUri] = useState<string | null>(null);
  const [proofKind, setProofKind] = useState<"image" | "video" | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<GameProgress | null>(null);

  const loadProgress = useCallback(async () => {
    if (!recordSlug) return;
    const p = await getPracticeProgress(recordSlug);
    setProgress(p);
  }, [recordSlug]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    if (recordSlug && isWearableRunSlug(recordSlug)) {
      router.replace(`/vision/run-wearable?recordSlug=${encodeURIComponent(recordSlug)}` as Href);
    }
  }, [recordSlug, router]);

  const personalBest = useMemo(() => {
    if (!progress || !recordSlug) return null;
    return formatPersonalBest(recordSlug, progress);
  }, [progress, recordSlug]);

  const scorePlaceholder = useMemo(() => {
    if (!category) return "Enter your result";
    if (category.slug === "mile_run") return "e.g. 5:42";
    if (category.scoreUnit === "seconds") return "e.g. 62.4 or 1:02";
    if (category.scoreUnit === "minutes") return "e.g. 22.5";
    return "e.g. 12";
  }, [category]);

  const scoreLabel = useMemo(() => {
    if (!category) return "Score";
    if (category.scoreUnit === "seconds" || category.scoreUnit === "minutes") return "Time";
    if (category.scoreUnit === "yards") return "Distance (yards)";
    return "Score";
  }, [category]);

  const pickProof = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Camera access is needed for proof.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.85,
        videoMaxDuration: 180,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const isVid = (a.type ?? "").includes("video") || /\.(mp4|mov|webm)$/i.test(a.uri);
      setProofKind(isVid ? "video" : "image");
      setLocalProofUri(a.uri);
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Photo library access is needed for proof.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: 180,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const isVid = (a.type ?? "").includes("video") || /\.(mp4|mov|webm)$/i.test(a.uri);
    setProofKind(isVid ? "video" : "image");
    setLocalProofUri(a.uri);
  };

  const parseScore = (): number | null => {
    const raw = scoreText.trim();
    if (!raw) return null;
    const validated = validateCategoryScore(recordSlug, raw);
    if (validated != null) return validated;
    if (recordSlug === "mile_run") return parseMileTimeToSeconds(raw);
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const onSubmit = async () => {
    if (!userId) {
      Alert.alert("Sign in", "Log in to run AI-validated practice.");
      return;
    }
    if (!category) return;

    const score = parseScore();
    if (score == null || score <= 0) {
      Alert.alert("Invalid score", `Enter a valid ${scoreLabel.toLowerCase()} (${scorePlaceholder}).`);
      return;
    }

    if (!localProofUri || !proofKind) {
      Alert.alert(
        "Proof required",
        validatorConfig.requiresVideo
          ? `${category.title} needs video proof so AI can validate your result.`
          : "Attach photo or video proof so AI can validate your score."
      );
      return;
    }

    if (validatorConfig.requiresVideo && proofKind !== "video") {
      Alert.alert("Video required", `${category.title} must be validated from video footage.`);
      return;
    }

    setBusy(true);
    try {
      const up = await uploadCourtProofMedia({
        userId,
        localUri: localProofUri,
        mediaType: proofKind,
      });

      const reportedLabel = formatCourtScore(score, recordSlug);
      const validation = await validateInPersonProof({
        userId,
        recordSlug,
        reportedScore: score,
        reportedScoreLabel: reportedLabel,
        proofStoragePaths: [up.storagePath],
        proofMediaType: proofKind,
      });

      if (validation.verdict === "rejected") {
        Alert.alert(
          "AI rejected proof",
          validation.summary ?? "Upload clearer proof that matches your reported score."
        );
        return;
      }

      if (!validation.score_matches && validation.detected_numeric != null) {
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "Score mismatch",
            `AI detected ${validation.detected_score ?? validation.detected_numeric}. You entered ${reportedLabel}. Save anyway?`,
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("cancelled")) },
              { text: "Save anyway", onPress: () => resolve() },
            ]
          );
        });
      }

      const prevProgress = progress;
      const next = await recordPracticeAttempt(recordSlug, score, {
        scoreLabel: reportedLabel,
        aiSummary: validation.summary,
        aiVerdict: validation.verdict,
        isPersonalBest: Boolean(
          prevProgress &&
            ((category.higherIsBetter &&
              (prevProgress.bestScore == null || score > prevProgress.bestScore)) ||
              (!category.higherIsBetter &&
                (prevProgress.bestTimeSec == null ||
                  score <
                    (category.scoreUnit === "minutes" ? prevProgress.bestTimeSec / 60 : prevProgress.bestTimeSec))))
        ),
      });
      setProgress(next);
      const pb = formatPersonalBest(recordSlug, next);

      const aiLine = validation.summary ? `\n\nAI: ${validation.summary}` : "";
      Alert.alert(
        validation.verdict === "approved" ? "Validated" : "Saved for review",
        `Practice logged.${pb ? `\nPersonal best: ${pb}` : ""}${aiLine}`,
        [{ text: "OK" }]
      );

      setScoreText("");
      setLocalProofUri(null);
      setProofKind(null);
    } catch (e: any) {
      if (e?.message === "cancelled") return;
      Alert.alert("Error", e?.message ?? "Could not validate proof.");
    } finally {
      setBusy(false);
    }
  };

  if (!recordSlug || !category) {
    return (
      <ScreenCanvas variant="gold">
        <VisionScreenHeader title="Practice" />
        <View style={styles.center}>
          <Text style={styles.err}>Unknown activity.</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </ScreenCanvas>
    );
  }

  return (
    <ScreenCanvas variant="gold">
      <VisionScreenHeader title="Practice" />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.activityTitle}>{category.title}</Text>
        <Text style={styles.activitySub}>
          No opponent, no stakes — AI validates your proof and tracks personal bests locally.
        </Text>

        {personalBest ? (
          <View style={styles.pbCard}>
            <Ionicons name="trophy-outline" size={18} color={colors.gold} />
            <Text style={styles.pbText}>Personal best: {personalBest}</Text>
            {progress?.plays ? (
              <Text style={styles.pbMeta}>{progress.plays} sessions</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tipCard}>
          <Ionicons name="sparkles" size={18} color={colors.accentTab} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.tipText}>{visionProfile.proofHint}</Text>
            {validatorConfig.recordingRequirements.length > 0 ? (
              <>
                <Text style={styles.reqTitle}>Recording requirements</Text>
                {validatorConfig.recordingRequirements.map((r) => (
                  <Text key={r} style={styles.reqBullet}>
                    • {r}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        </View>

        {validatorConfig.requiresVideo ? (
          <View style={styles.videoNote}>
            <Ionicons name="videocam-outline" size={16} color={colors.gold} />
            <Text style={styles.videoNoteText}>Video proof required for AI validation</Text>
          </View>
        ) : null}

        {supportsLiveRecord(recordSlug, validatorConfig.kind) && validatorConfig.requiresVideo ? (
          <Pressable
            onPress={() =>
              router.push(
                liveRecordHref({
                  flow: "practice",
                  recordSlug,
                  timeLimitSec: visionProfile.timeLimitSec ?? null,
                })
              )
            }
            style={({ pressed }) => [styles.liveRecordBtn, pressSoft(pressed)]}
          >
            <Ionicons name="radio-button-on" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.liveRecordTitle}>Record with live counters</Text>
              <Text style={styles.liveRecordSub}>
                Reps, streak, or stopwatch on screen while you film
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>
        ) : null}

        <Text style={styles.label}>{scoreLabel}</Text>
        <TextInput
          value={scoreText}
          onChangeText={setScoreText}
          placeholder={scorePlaceholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={
            category.slug === "mile_run" || category.scoreUnit === "seconds"
              ? "default"
              : "decimal-pad"
          }
          style={styles.input}
        />

        <Text style={styles.label}>Proof photo or video</Text>
        <View style={styles.proofRow}>
          <Pressable
            onPress={() => pickProof(true)}
            style={({ pressed }) => [styles.proofBtn, pressSoft(pressed)]}
          >
            <Ionicons name="camera-outline" size={20} color={colors.text} />
            <Text style={styles.proofBtnText}>Camera</Text>
          </Pressable>
          <Pressable
            onPress={() => pickProof(false)}
            style={({ pressed }) => [styles.proofBtn, pressSoft(pressed)]}
          >
            <Ionicons name="image-outline" size={20} color={colors.text} />
            <Text style={styles.proofBtnText}>{localProofUri ? "Change" : "Gallery"}</Text>
          </Pressable>
        </View>
        {localProofUri ? (
          <Text style={styles.proofAttached}>
            {proofKind === "video" ? "Video attached" : "Photo attached"} — ready for AI review
          </Text>
        ) : null}

        {validatorConfig.submitChecklist.length > 0 ? (
          <View style={styles.checklistBox}>
            <Text style={styles.reqTitle}>Before you submit</Text>
            {validatorConfig.submitChecklist.map((item) => (
              <Text key={item} style={styles.reqBullet}>
                ☐ {item}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={({ pressed }) => [styles.submitBtn, busy && { opacity: 0.6 }, pressSoft(pressed)]}
        >
          {busy ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.submitText}>AI validating…</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.submitText}>Validate with AI</Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() =>
            router.push(`/courts?record=${encodeURIComponent(recordSlug)}` as Href)
          }
          style={({ pressed }) => [styles.arenaLink, pressSoft(pressed)]}
        >
          <Ionicons name="location-outline" size={16} color={colors.textMuted} />
          <Text style={styles.arenaLinkText}>Post to arena leaderboard instead (check-in required)</Text>
        </Pressable>
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  activityTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 6 },
  activitySub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 16 },
  pbCard: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 12,
  },
  pbText: { color: colors.text, fontWeight: "800", fontSize: 14 },
  pbMeta: { color: colors.textMuted, fontSize: 12, marginLeft: "auto" },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  reqTitle: { color: colors.text, fontWeight: "800", fontSize: 12, marginTop: 6 },
  reqBullet: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  checklistBox: { marginBottom: 12, gap: 2 },
  videoNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  videoNoteText: { color: colors.gold, fontSize: 12, fontWeight: "700" },
  liveRecordBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  liveRecordTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  liveRecordSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  label: { color: colors.textTertiary, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  proofRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  proofBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  proofBtnText: { color: colors.text, fontWeight: "700" },
  proofAttached: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 16,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accentCTA,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  arenaLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingVertical: 10,
  },
  arenaLinkText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", textAlign: "center" },
  err: { color: colors.danger, marginBottom: 12 },
  link: { color: colors.accent, fontWeight: "700" },
});
