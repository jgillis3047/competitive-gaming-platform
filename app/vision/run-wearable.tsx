// app/vision/run-wearable.tsx — Running activities via Apple Watch / Garmin / Fitbit
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { Href } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import VisionScreenHeader from "../components/VisionScreenHeader";
import { formatSecondsAsMmSs, parseMileTimeToSeconds } from "../../lib/backend/courts";
import { uploadCourtProofMedia } from "../../lib/backend/mediaService";
import { validateWearableRunProof } from "../../lib/backend/wearableRunValidation";
import { getInPersonGameSpec, type WearableProvider } from "../../lib/data/inPersonGameSpecs";
import {
  importAppleHealthRunWorkouts,
  isAppleHealthImportAvailable,
  parseGpxUri,
  type WearableWorkoutSample,
} from "../../lib/wearable";
import { getPracticeProgress, recordPracticeAttempt } from "../../lib/data/practiceProgress";
import { getLeaderboardCategory, validateCategoryScore } from "../../lib/data/leaderboardTaxonomy";
import { useAuthStore } from "../../lib/data/authStore";
import ScreenCanvas from "../../lib/ui/ScreenCanvas";
import { colors } from "../../lib/theme/colors";

const PROVIDERS: { key: WearableProvider; label: string; icon: string }[] = [
  { key: "apple_watch", label: "Apple Watch", icon: "watch-outline" },
  { key: "garmin", label: "Garmin", icon: "navigate-outline" },
  { key: "fitbit", label: "Fitbit", icon: "fitness-outline" },
  { key: "coros", label: "Coros", icon: "speedometer-outline" },
  { key: "polar", label: "Polar", icon: "heart-outline" },
  { key: "other", label: "Other", icon: "hardware-chip-outline" },
];

export default function RunWearableScreen() {
  const router = useRouter();
  const { recordSlug: recordSlugParam, challengeId } = useLocalSearchParams<{
    recordSlug?: string;
    challengeId?: string;
  }>();
  const recordSlug = String(recordSlugParam ?? "mile_run");
  const userId = useAuthStore((s) => s.user?.id);

  const spec = useMemo(() => getInPersonGameSpec(recordSlug), [recordSlug]);
  const category = useMemo(() => getLeaderboardCategory(recordSlug), [recordSlug]);

  const [provider, setProvider] = useState<WearableProvider>("apple_watch");
  const [timeText, setTimeText] = useState("");
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [importedWorkout, setImportedWorkout] = useState<WearableWorkoutSample | null>(null);
  const [importSource, setImportSource] = useState<"apple_health" | "garmin_gpx" | null>(null);
  const [healthImportReady, setHealthImportReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isAppleHealthImportAvailable().then(setHealthImportReady).catch(() => setHealthImportReady(false));
  }, []);

  const timePlaceholder = useMemo(() => {
    if (recordSlug === "mile_run") return "5:42";
    if (recordSlug === "five_k_run") return "22:30";
    if (category?.scoreUnit === "seconds") return "62.4 or 1:02";
    return "Enter time";
  }, [recordSlug, category]);

  const applyImportedWorkout = (workout: WearableWorkoutSample, source: "apple_health" | "garmin_gpx") => {
    setImportedWorkout(workout);
    setImportSource(source);
    setProvider(source === "apple_health" ? "apple_watch" : "garmin");
    setTimeText(formatSecondsAsMmSs(workout.durationSec));
    setScreenshotUri(null);
  };

  const importFromAppleHealth = async () => {
    setBusy(true);
    try {
      const workouts = await importAppleHealthRunWorkouts(15);
      if (!workouts.length) {
        Alert.alert("No workouts", "No recent run workouts found in Apple Health.");
        return;
      }
      const pick = workouts[0];
      applyImportedWorkout(pick, "apple_health");
      Alert.alert(
        "Imported",
        `${pick.activityLabel} — ${formatSecondsAsMmSs(pick.durationSec)}${
          pick.distanceM ? ` · ${(pick.distanceM / 1609.344).toFixed(2)} mi` : ""
        }`
      );
    } catch (e: any) {
      const msg = e?.message ?? "Could not read Apple Health.";
      Alert.alert(
        "Apple Health",
        Platform.OS !== "ios"
          ? "Apple Health import is iOS only."
          : `${msg} Use a dev build (not Expo Go) after enabling HealthKit.`
      );
    } finally {
      setBusy(false);
    }
  };

  const importGarminGpx = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/gpx+xml", "application/xml", "text/xml"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setBusy(true);
      const workout = await parseGpxUri(res.assets[0].uri);
      if (!workout) {
        Alert.alert("Invalid GPX", "Could not parse distance or duration from this file.");
        return;
      }
      applyImportedWorkout(workout, "garmin_gpx");
      Alert.alert("GPX imported", `${workout.activityLabel} — ${formatSecondsAsMmSs(workout.durationSec)}`);
    } catch (e: any) {
      Alert.alert("GPX import failed", e?.message ?? "Try exporting from Garmin Connect.");
    } finally {
      setBusy(false);
    }
  };

  const pickScreenshot = async (useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Access needed to upload wearable screenshot.");
      return;
    }
    const res = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled && res.assets?.[0]?.uri) {
      setScreenshotUri(res.assets[0].uri);
    }
  };

  const parseTime = (): number | null => {
    if (recordSlug === "mile_run") {
      const sec = parseMileTimeToSeconds(timeText);
      return sec != null && sec > 0 ? sec : null;
    }
    return validateCategoryScore(recordSlug, timeText);
  };

  const submit = async () => {
    if (!userId) {
      Alert.alert("Sign in", "Log in to save your run.");
      return;
    }
    const scoreSec = parseTime();
    if (scoreSec == null) {
      Alert.alert("Invalid time", `Enter a valid time (e.g. ${timePlaceholder}).`);
      return;
    }
    if (!screenshotUri && !importedWorkout) {
      Alert.alert(
        "Proof required",
        "Import from Apple Health / Garmin GPX, or upload a wearable screenshot."
      );
      return;
    }

    setBusy(true);
    try {
      let screenshotStoragePath: string | null = null;
      if (screenshotUri) {
        const uploaded = await uploadCourtProofMedia({
          userId,
          localUri: screenshotUri,
          mediaType: "image",
        });
        screenshotStoragePath = uploaded.storagePath;
      }

      const label =
        recordSlug === "mile_run" || category?.scoreUnit === "seconds"
          ? formatSecondsAsMmSs(scoreSec)
          : timeText.trim();

      const result = validateWearableRunProof({
        recordSlug,
        reportedScoreLabel: label,
        reportedScoreSec: scoreSec,
        provider,
        screenshotStoragePath,
        activityDateIso: importedWorkout?.startDateIso ?? new Date().toISOString(),
        importSource: importSource ?? undefined,
        importedWorkout: importedWorkout ?? undefined,
      });

      if (result.verdict === "rejected") {
        Alert.alert("Could not verify", result.summary);
        return;
      }

      await recordPracticeAttempt(recordSlug, scoreSec, {
        scoreLabel: label,
        aiVerdict: result.verdict,
        aiSummary: result.summary,
      });

      await getPracticeProgress(recordSlug);

      Alert.alert(
        result.verdict === "approved" ? "Logged ✓" : "Submitted for review",
        result.summary,
        [
          {
            text: "Done",
            onPress: () =>
              challengeId
                ? router.replace(`/challenge/${challengeId}` as Href)
                : router.back(),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!spec) {
    return (
      <ScreenCanvas>
        <VisionScreenHeader title="Run" />
        <Text style={styles.err}>Activity not found.</Text>
      </ScreenCanvas>
    );
  }

  return (
    <ScreenCanvas variant="gold">
      <VisionScreenHeader title={spec.title} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.tipCard}>
          <Ionicons name="watch-outline" size={22} color={colors.accentTab} />
          <View style={styles.tipBody}>
            <Text style={styles.tipTitle}>Wearable sync — no video AI</Text>
            <Text style={styles.tipText}>{spec.proofHint}</Text>
            {spec.recordingRequirements.map((r) => (
              <Text key={r} style={styles.bullet}>
                • {r}
              </Text>
            ))}
          </View>
        </View>

        <Text style={styles.label}>Device</Text>
        <View style={styles.providerGrid}>
          {PROVIDERS.filter((p) => !spec.wearableProviders || spec.wearableProviders.includes(p.key)).map(
            (p) => (
              <Pressable
                key={p.key}
                onPress={() => setProvider(p.key)}
                style={[styles.providerChip, provider === p.key && styles.providerChipOn]}
              >
                <Ionicons
                  name={p.icon as any}
                  size={16}
                  color={provider === p.key ? colors.accentTab : colors.textMuted}
                />
                <Text style={[styles.providerText, provider === p.key && styles.providerTextOn]}>
                  {p.label}
                </Text>
              </Pressable>
            )
          )}
        </View>

        <Text style={styles.label}>Import from device</Text>
        <View style={styles.importRow}>
          {Platform.OS === "ios" ? (
            <Pressable
              onPress={importFromAppleHealth}
              disabled={busy || !healthImportReady}
              style={[styles.importBtn, (!healthImportReady || busy) && { opacity: 0.5 }]}
            >
              <Ionicons name="heart-outline" size={18} color={colors.accentTab} />
              <Text style={styles.importBtnText}>Apple Health</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={importGarminGpx} disabled={busy} style={[styles.importBtn, busy && { opacity: 0.5 }]}>
            <Ionicons name="document-outline" size={18} color={colors.accentTab} />
            <Text style={styles.importBtnText}>Garmin GPX</Text>
          </Pressable>
        </View>
        {importedWorkout ? (
          <Text style={styles.imported}>
            Imported: {importedWorkout.activityLabel} · {formatSecondsAsMmSs(importedWorkout.durationSec)}
            {importedWorkout.distanceM
              ? ` · ${recordSlug === "five_k_run" ? `${(importedWorkout.distanceM / 1000).toFixed(2)} km` : `${Math.round(importedWorkout.distanceM)} m`}`
              : ""}
          </Text>
        ) : null}

        <Text style={styles.label}>Your time</Text>
        <TextInput
          style={styles.input}
          value={timeText}
          onChangeText={setTimeText}
          placeholder={timePlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Activity screenshot (optional if imported)</Text>
        <View style={styles.photoRow}>
          <Pressable onPress={() => pickScreenshot(true)} style={styles.photoBtn}>
            <Ionicons name="camera" size={20} color={colors.text} />
            <Text style={styles.photoBtnText}>Camera</Text>
          </Pressable>
          <Pressable onPress={() => pickScreenshot(false)} style={styles.photoBtn}>
            <Ionicons name="images-outline" size={20} color={colors.text} />
            <Text style={styles.photoBtnText}>Gallery</Text>
          </Pressable>
        </View>
        {screenshotUri ? <Text style={styles.attached}>Screenshot attached ✓</Text> : null}

        <Text style={styles.checklistTitle}>Before you submit</Text>
        {spec.submitChecklist.map((item) => (
          <Text key={item} style={styles.checkItem}>
            ☐ {item}
          </Text>
        ))}

        <Pressable onPress={submit} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.5 }]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Log run from wearable</Text>
          )}
        </Pressable>
      </ScrollView>
    </ScreenCanvas>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  err: { color: colors.textMuted, textAlign: "center", marginTop: 40 },
  tipCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.accentBorderSubtle,
  },
  tipBody: { flex: 1, gap: 4 },
  tipTitle: { color: colors.text, fontWeight: "900", fontSize: 15 },
  tipText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  bullet: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  label: { color: colors.text, fontWeight: "800", fontSize: 14, marginBottom: 8, marginTop: 8 },
  importRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  importBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentBorderSubtle,
    backgroundColor: colors.surface,
  },
  importBtnText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  imported: { color: colors.success, fontWeight: "700", marginBottom: 8, fontSize: 13 },
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  providerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  providerChipOn: { borderColor: colors.accentTab, backgroundColor: colors.accentChip },
  providerText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  providerTextOn: { color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  photoRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  photoBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoBtnText: { color: colors.text, fontWeight: "800" },
  attached: { color: colors.success, fontWeight: "700", marginBottom: 12 },
  checklistTitle: { color: colors.text, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  checkItem: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 2 },
  submitBtn: {
    backgroundColor: colors.accentCTA,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
