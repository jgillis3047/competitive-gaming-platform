// app/courts/[id]/submit.tsx — Check-in + score + optional proof
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
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

import { validateInPersonProof } from "../../../lib/backend/inPersonAiValidation";
import {
  fetchCourtById,
  fetchRecordTypes,
  formatCourtScore,
  getSpotRecordTypesForCourt,
  isWithinCourtCheckIn,
  parseMileTimeToSeconds,
  submitCourtAttempt,
  type CourtRecordTypeRow,
  type CourtRow,
} from "../../../lib/backend/courts";
import { validatorConfigForSlug } from "../../../lib/data/inPersonAiValidation";
import { resolveInPersonVisionProfileFromSlug } from "../../../lib/data/inPersonVisionConfig";
import { nudgeAfterCourtAttempt, scopeKeyForCourt } from "../../../lib/backend/kingLeaderboard";
import { uploadCourtProofMedia } from "../../../lib/backend/mediaService";
import { getLeaderboardCategory, validateCategoryScore } from "../../../lib/data/leaderboardTaxonomy";
import {
  isValidSocialProofUrl,
  MATCH_VERIFICATION_LABELS,
  normalizeSocialProofUrl,
  ARENA_PENDING_LABEL,
} from "../../../lib/theme/arenaCopy";
import { useAuthStore } from "../../../lib/data/authStore";
import { colors } from "../../../lib/theme/colors";
import { radius, space } from "../../../lib/theme/spacing";
import { pressSoft } from "../../../lib/ui/pressableStyles";
import { resolveForegroundLatLng } from "../../../lib/utils/resolveForegroundLatLng";

export default function CourtSubmitScreen() {
  const router = useRouter();
  const { id, record } = useLocalSearchParams<{ id: string; record: string }>();
  const courtId = String(id ?? "");
  const recordSlug = String(record ?? "");

  const userId = useAuthStore((s) => s.user?.id);

  const [court, setCourt] = useState<CourtRow | null>(null);
  const [types, setTypes] = useState<CourtRecordTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scoreText, setScoreText] = useState("");
  const [localProofUri, setLocalProofUri] = useState<string | null>(null);
  const [proofKind, setProofKind] = useState<"image" | "video" | null>(null);
  const [socialProofUrl, setSocialProofUrl] = useState("");
  const [checkOk, setCheckOk] = useState<boolean | null>(null);

  const activeType = useMemo(
    () => types.find((t) => t.slug === recordSlug) ?? null,
    [types, recordSlug]
  );
  const categoryMeta = useMemo(() => getLeaderboardCategory(recordSlug), [recordSlug]);
  const visionProfile = useMemo(
    () => resolveInPersonVisionProfileFromSlug(recordSlug),
    [recordSlug]
  );
  const validatorConfig = useMemo(
    () => validatorConfigForSlug(recordSlug),
    [recordSlug]
  );

  const load = useCallback(async () => {
    if (!courtId) return;
    setLoading(true);
    try {
      const [c, t] = await Promise.all([fetchCourtById(courtId), fetchRecordTypes()]);
      if (!c) {
        setCourt(null);
        setTypes([]);
        return;
      }
      const allowed = new Set(getSpotRecordTypesForCourt(c).map((x) => x.slug));
      const filteredTypes = t.filter((x) => allowed.has(x.slug));
      setCourt(c);
      setTypes(filteredTypes);
    } finally {
      setLoading(false);
    }
  }, [courtId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!court) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setCheckOk(false);
        return;
      }
      try {
        const { lat, lng } = await resolveForegroundLatLng();
        if (cancelled) return;
        setCheckOk(isWithinCourtCheckIn(lat, lng, court));
      } catch {
        if (!cancelled) setCheckOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [court]);

  const pickProof = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission", "Camera access is needed for live proof.");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.85,
        videoMaxDuration: 120,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const uri = a.uri;
      const isVid = (a.type ?? "").includes("video") || /\.(mp4|mov|webm)$/i.test(uri);
      setProofKind(isVid ? "video" : "image");
      setLocalProofUri(uri);
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
      videoMaxDuration: 120,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const uri = a.uri;
    const isVid = (a.type ?? "").includes("video") || /\.(mp4|mov|webm)$/i.test(uri);
    setProofKind(isVid ? "video" : "image");
    setLocalProofUri(uri);
  };

  const parseScore = (): number | null => {
    if (!activeType) return null;
    const raw = scoreText.trim();
    if (!raw) return null;
    const validated = validateCategoryScore(activeType.slug, raw);
    if (validated != null) return validated;
    if (activeType.slug === "mile_run") return parseMileTimeToSeconds(raw);
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const onSubmit = async () => {
    if (!userId) {
      Alert.alert("Sign in", "Log in to submit an attempt.");
      return;
    }
    if (!court || !activeType) return;
    if (court.verification_status === "pending") {
      Alert.alert(
        ARENA_PENDING_LABEL,
        "This arena is still being verified. Rankings unlock after community confirmation."
      );
      return;
    }
    if (checkOk === false) {
      Alert.alert(
        "Check-in required",
        "Move within the court radius (shown on the court page) and try again."
      );
      return;
    }
    const score = parseScore();
    if (score == null || score <= 0) {
      Alert.alert(
        "Invalid score",
        activeType.slug === "mile_run"
          ? "Enter time like 5:12 or total seconds."
          : "Enter a positive number."
      );
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location", "Location is required to verify check-in.");
      return;
    }
    let lat: number;
    let lng: number;
    try {
      const p = await resolveForegroundLatLng();
      lat = p.lat;
      lng = p.lng;
    } catch (e: any) {
      Alert.alert("Location", e?.message ?? "Could not read your position.");
      return;
    }
    if (!isWithinCourtCheckIn(lat, lng, court)) {
      Alert.alert("Check-in failed", "You must be on-site within the check-in radius.");
      return;
    }

    const trimmedSocial = socialProofUrl.trim();
    if (trimmedSocial && !isValidSocialProofUrl(trimmedSocial)) {
      Alert.alert(
        "Invalid link",
        "Paste a TikTok, YouTube, or Instagram Reel link — or leave blank and attach media instead."
      );
      return;
    }

    if (!localProofUri && !trimmedSocial) {
      Alert.alert(
        "Proof required",
        validatorConfig.requiresVideo
          ? `${activeType.title} needs video proof for AI validation. Record your attempt.`
          : "Attach photo or video proof so AI can validate your score."
      );
      return;
    }

    if (validatorConfig.requiresVideo && proofKind !== "video" && !trimmedSocial) {
      Alert.alert("Video required", `${activeType.title} must be validated from video footage.`);
      return;
    }

    setSubmitting(true);
    try {
      let proofPath: string | null = null;
      if (localProofUri && proofKind) {
        const up = await uploadCourtProofMedia({
          userId,
          localUri: localProofUri,
          mediaType: proofKind,
        });
        proofPath = up.storagePath;
      }

      const reportedLabel = formatCourtScore(score, activeType.slug);
      let validation = null;
      if (proofPath) {
        validation = await validateInPersonProof({
          userId,
          recordSlug: activeType.slug,
          reportedScore: score,
          reportedScoreLabel: reportedLabel,
          proofStoragePaths: [proofPath],
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
              `AI detected ${validation!.detected_score ?? validation!.detected_numeric}. You entered ${reportedLabel}. Submit anyway?`,
              [
                { text: "Cancel", style: "cancel", onPress: () => reject(new Error("cancelled")) },
                { text: "Submit anyway", onPress: () => resolve() },
              ]
            );
          });
        }
      }

      const aiReview = validation
        ? {
            ai_verdict: validation.verdict,
            ai_confidence: validation.confidence,
            ai_summary: validation.summary,
            ai_detected_score: validation.detected_score,
            ai_flags: validation.flags,
          }
        : null;

      await submitCourtAttempt({
        userId,
        courtId: court.id,
        recordTypeSlug: activeType.slug,
        scoreValue: score,
        checkinLat: lat,
        checkinLng: lng,
        proofMediaPath: proofPath,
        proofSocialUrl: trimmedSocial ? normalizeSocialProofUrl(trimmedSocial) : null,
        aiReview,
      });
      const sk = scopeKeyForCourt(court.id, activeType.slug);
      await nudgeAfterCourtAttempt({
        scopeKey: sk,
        userId,
        recordSlug: activeType.slug,
        courtName: court.name,
      });
      const aiNote = validation?.summary ? `\n\nAI: ${validation.summary}` : "";
      Alert.alert("Logged", `Your result is on the arena rankings.${aiNote}`, [
        { text: "OK", onPress: () => router.replace(`/courts/${courtId}` as Href) },
      ]);
    } catch (e: any) {
      if (e?.message === "cancelled") return;
      Alert.alert("Error", e?.message ?? "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !court) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!activeType) {
    return (
      <View style={styles.container}>
        <Text style={styles.err}>Unknown record type.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Log result</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.courtName}>{court.name}</Text>
      <Text style={styles.recTitle}>{activeType.title}</Text>
      <Text style={styles.recDesc}>{activeType.description}</Text>
      <View style={styles.ruleBox}>
        <Ionicons name="sparkles" size={16} color={colors.accentTab} />
        <Text style={styles.ruleText}>{visionProfile.proofHint}</Text>
      </View>
      {categoryMeta?.proofRules ? (
        <View style={styles.ruleBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
          <Text style={styles.ruleText}>{categoryMeta.proofRules}</Text>
        </View>
      ) : null}

      <View style={styles.checkBanner}>
        <Ionicons
          name={checkOk ? "checkmark-circle" : checkOk === false ? "close-circle" : "help-circle"}
          size={22}
          color={checkOk ? colors.success : checkOk === false ? colors.danger : colors.textMuted}
        />
        <Text style={styles.checkText}>
          {checkOk === null
            ? "Checking your location…"
            : checkOk
              ? "You are within check-in range."
              : "You are outside check-in range — move closer."}
        </Text>
      </View>

      <Text style={styles.label}>
        {activeType.slug === "mile_run" ? "Time (mm:ss or seconds)" : "Score"}
      </Text>
      <TextInput
        value={scoreText}
        onChangeText={setScoreText}
        placeholder={activeType.slug === "mile_run" ? "e.g. 5:42" : "e.g. 12"}
        placeholderTextColor={colors.textMuted}
        keyboardType={activeType.slug === "mile_run" ? "default" : "decimal-pad"}
        style={styles.input}
      />

      <Text style={styles.label}>Proof clip link (TikTok, YouTube, or Reel)</Text>
      <TextInput
        value={socialProofUrl}
        onChangeText={setSocialProofUrl}
        placeholder="https://tiktok.com/… or youtube.com/…"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      {socialProofUrl.trim() ? (
        <Text style={styles.verifiedHint}>
          {isValidSocialProofUrl(socialProofUrl)
            ? `→ ${MATCH_VERIFICATION_LABELS.verified}`
            : "Link must be TikTok, YouTube, or an Instagram Reel"}
        </Text>
      ) : null}

      <Text style={styles.label}>Or attach photo / video</Text>
      <View style={styles.proofRow}>
        <Pressable onPress={() => pickProof(true)} style={({ pressed }) => [styles.proofBtn, pressSoft(pressed)]}>
          <Ionicons name="camera-outline" size={20} color={colors.text} />
          <Text style={styles.proofBtnText}>Camera</Text>
        </Pressable>
        <Pressable onPress={() => pickProof(false)} style={({ pressed }) => [styles.proofBtn, pressSoft(pressed)]}>
          <Ionicons name="image-outline" size={20} color={colors.text} />
          <Text style={styles.proofBtnText}>{localProofUri ? "Change" : "Gallery"}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={submitting}
        style={({ pressed }) => [styles.submitBtn, submitting && { opacity: 0.6 }, pressSoft(pressed)]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit result</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgFeed,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },
  courtName: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  recTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginBottom: 8 },
  recDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  ruleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.goldSurfaceMuted,
    borderWidth: 1,
    borderColor: colors.goldBorderSoft,
    marginBottom: 12,
  },
  ruleText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 16 },
  checkBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  checkText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
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
  proofRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  proofBtnText: { color: colors.text, fontWeight: "700" },
  verifiedHint: { color: colors.success, fontSize: 12, marginTop: -10, marginBottom: 16, fontWeight: "600" },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  err: { color: colors.danger, marginTop: 24 },
  link: { color: colors.accent, fontWeight: "700" },
});
