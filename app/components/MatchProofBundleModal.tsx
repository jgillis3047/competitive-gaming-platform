// app/components/MatchProofBundleModal.tsx — Multi-file proof upload + score + AI review
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getEgameProofRequirement, EGAME_CONFIRM_HOURS } from "../../lib/backend/matchVerification";
import { resolveInPersonVisionProfile } from "../../lib/data/inPersonVisionConfig";
import { uploadMatchProofMedia } from "../../lib/backend/mediaService";
import { inferSportKey, type ProofType } from "../../lib/models/visionTypes";
import { colors } from "../../lib/theme/colors";

export type ProofBundleItem = {
  storagePath: string;
  proofType: ProofType;
};

type LocalProof = {
  uri: string;
  mediaType: "image" | "video";
  proofType: ProofType;
};

type Props = {
  visible: boolean;
  challengeId: string | null;
  gameType?: string | null;
  challengeKind?: string | null;
  entryFeeCents?: number | null;
  winRewardCents?: number | null;
  leagueId?: string | null;
  reporterUserId: string;
  opponentUserId: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (params: {
    winner: "me" | "opponent" | "tie";
    reportedScore?: string | null;
    proofBundle: ProofBundleItem[];
  }) => Promise<void>;
};

const SPORT_HINTS: Record<string, string> = {
  basketball: "Upload 10–30s clip showing both players + final score.",
  golf: "Upload scorecard photo. Optional tee/putt clip.",
  other: "Upload clip or photo from the match.",
};

export default function MatchProofBundleModal({
  visible,
  challengeId,
  gameType,
  challengeKind,
  entryFeeCents,
  winRewardCents,
  leagueId,
  reporterUserId,
  opponentUserId,
  loading = false,
  onClose,
  onSubmit,
}: Props) {
  const [proofRequired, setProofRequired] = useState(false);
  const [proofReasons, setProofReasons] = useState<string[]>([]);
  const [proofs, setProofs] = useState<LocalProof[]>([]);
  const [reportedScore, setReportedScore] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isInPerson = String(challengeKind ?? "").toLowerCase() === "in_person";
  const visionProfile = isInPerson ? resolveInPersonVisionProfile(gameType) : null;
  const sportKey = visionProfile?.sportKey ?? inferSportKey(gameType);
  const sportHint = visionProfile?.proofHint ?? SPORT_HINTS[sportKey] ?? SPORT_HINTS.other;

  useEffect(() => {
    if (!visible || !reporterUserId || !opponentUserId) return;
    let cancelled = false;
    void getEgameProofRequirement({
      entryFeeCents,
      winRewardCents,
      leagueId,
      reporterUserId,
      opponentUserId,
    }).then((req) => {
      if (!cancelled) {
        setProofRequired(req.required);
        setProofReasons(req.reasons);
      }
    });
    return () => { cancelled = true; };
  }, [visible, reporterUserId, opponentUserId, entryFeeCents, winRewardCents, leagueId]);

  useEffect(() => {
    if (!visible) {
      setProofs([]);
      setReportedScore("");
      setSubmitting(false);
      setUploading(false);
    }
  }, [visible]);

  const pickProof = async (useCamera: boolean, proofType: ProofType) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "Media access is needed for proof.");
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.85 });

    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    const isVideo = (asset.type ?? "").toLowerCase() === "video";
    if (proofs.length >= 3) {
      Alert.alert("Limit", "Max 3 proof files per submission.");
      return;
    }
    setProofs((prev) => [
      ...prev,
      { uri: asset.uri, mediaType: isVideo ? "video" : "image", proofType },
    ]);
  };

  const handleWinner = async (winner: "me" | "opponent" | "tie") => {
    if (!challengeId) return;
    if (proofRequired && proofs.length === 0) {
      Alert.alert("Proof required", "Upload at least one clip or photo.");
      return;
    }

    setSubmitting(true);
    try {
      const bundle: ProofBundleItem[] = [];
      if (proofs.length > 0) {
        setUploading(true);
        for (const p of proofs) {
          const uploaded = await uploadMatchProofMedia({
            userId: reporterUserId,
            localUri: p.uri,
            mediaType: p.mediaType,
          });
          bundle.push({ storagePath: uploaded.storagePath, proofType: p.proofType });
        }
        setUploading(false);
      }

      await onSubmit({
        winner,
        reportedScore: reportedScore.trim() || null,
        proofBundle: bundle,
      });
    } catch (e: any) {
      Alert.alert("Report failed", e?.message ?? "Could not report result.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const busy = loading || submitting || uploading;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.title}>AI Proof Review</Text>
            <Text style={styles.sub}>
              {gameType ? `${gameType} • ` : ""}
              Upload once — AI summarizes, opponent confirms.
            </Text>
            <Text style={styles.hint}>{sportHint}</Text>
            <Text style={styles.hint}>
              Opponent has {EGAME_CONFIRM_HOURS}h to confirm. No dispute = final.
            </Text>

            <Text style={styles.label}>Final score (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder={sportKey === "golf" ? "e.g. 84-89" : "e.g. 11-7"}
              placeholderTextColor="#6b7280"
              value={reportedScore}
              onChangeText={setReportedScore}
            />

            <Text style={styles.label}>
              Proof {proofRequired ? "(required)" : "(optional)"} — {proofs.length}/3
            </Text>
            <View style={styles.proofRow}>
              <Pressable
                onPress={() => pickProof(true, sportKey === "golf" ? "scorecard" : "video")}
                style={({ pressed }) => [styles.proofBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="camera-outline" size={18} color={colors.text} />
                <Text style={styles.proofBtnText}>Camera</Text>
              </Pressable>
              <Pressable
                onPress={() => pickProof(false, "photo")}
                style={({ pressed }) => [styles.proofBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="image-outline" size={18} color={colors.text} />
                <Text style={styles.proofBtnText}>Gallery</Text>
              </Pressable>
            </View>

            {proofs.map((p, i) => (
              <View key={i} style={styles.proofItem}>
                <Text style={styles.proofItemText}>
                  {p.proofType} • {p.mediaType}
                </Text>
                <Pressable onPress={() => setProofs((prev) => prev.filter((_, j) => j !== i))}>
                  <Ionicons name="close-circle" size={20} color="#9ca3af" />
                </Pressable>
              </View>
            ))}

            {proofRequired && proofReasons.length > 0 ? (
              <Text style={styles.proofWhy}>
                Required: {proofReasons.map((r) => r.replace(/_/g, " ")).join(", ")}
              </Text>
            ) : null}

            <View style={{ height: 12 }} />

            <Pressable
              onPress={() => handleWinner("me")}
              disabled={busy}
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnText}>I Won</Text>
            </Pressable>
            <Pressable
              onPress={() => handleWinner("opponent")}
              disabled={busy}
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnText}>Opponent Won</Text>
            </Pressable>
            <Pressable
              onPress={() => handleWinner("tie")}
              disabled={busy}
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.9 }, busy && { opacity: 0.6 }]}
            >
              <Text style={styles.btnText}>Tie</Text>
            </Pressable>
            <Pressable onPress={onClose} disabled={busy} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>

            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator />
                <Text style={styles.busyText}>
                  {uploading ? "Uploading proof…" : "Submitting + AI review…"}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center" },
  scroll: { padding: 20, flexGrow: 1, justifyContent: "center" },
  card: {
    backgroundColor: "#0b1220",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 4 },
  sub: { color: "#9ca3af", fontSize: 13, marginBottom: 6 },
  hint: { color: "#6b7280", fontSize: 12, marginBottom: 6, lineHeight: 18 },
  label: { color: "#d1d5db", fontSize: 13, fontWeight: "700", marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  proofRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  proofBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  proofBtnText: { color: "#e5e7eb", fontWeight: "800", fontSize: 13 },
  proofItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  proofItemText: { color: colors.success, fontSize: 12, fontWeight: "700" },
  proofWhy: { color: "#9ca3af", fontSize: 11, marginTop: 6, fontStyle: "italic" },
  btnPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  btnSecondary: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  btnText: { color: "#fff", fontWeight: "900" },
  btnGhost: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  btnGhostText: { color: "#9ca3af", fontWeight: "800" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  busyText: { color: "rgba(255,255,255,0.7)", fontWeight: "800" },
});
