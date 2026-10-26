// app/components/EgameReportModal.tsx
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getEgameProofRequirement, EGAME_CONFIRM_HOURS } from "../../lib/backend/egameVerification";
import { uploadEgameProofMedia } from "../../lib/backend/mediaService";
import { colors } from "../../lib/theme/colors";

type Props = {
  visible: boolean;
  challengeId: string | null;
  gameType?: string | null;
  entryFeeCents?: number | null;
  winRewardCents?: number | null;
  leagueId?: string | null;
  reporterUserId: string;
  opponentUserId: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (params: { winner: "me" | "opponent" | "tie"; proofMediaPath?: string | null }) => Promise<void>;
};

export default function EgameReportModal({
  visible,
  challengeId,
  gameType,
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
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofMediaType, setProofMediaType] = useState<"image" | "video">("image");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

    return () => {
      cancelled = true;
    };
  }, [visible, reporterUserId, opponentUserId, entryFeeCents, winRewardCents, leagueId]);

  useEffect(() => {
    if (!visible) {
      setProofUri(null);
      setSubmitting(false);
      setUploading(false);
    }
  }, [visible]);

  const pickProof = async (useCamera: boolean) => {
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
    setProofMediaType(isVideo ? "video" : "image");
    setProofUri(asset.uri);
  };

  const handleWinner = async (winner: "me" | "opponent" | "tie") => {
    if (!challengeId) return;
    if (proofRequired && !proofUri) {
      Alert.alert("Proof required", "Upload a screenshot or clip for this match.");
      return;
    }

    setSubmitting(true);
    try {
      let proofPath: string | null = null;
      if (proofUri) {
        setUploading(true);
        const uploaded = await uploadEgameProofMedia({
          userId: reporterUserId,
          localUri: proofUri,
          mediaType: proofMediaType,
        });
        proofPath = uploaded.storagePath;
        setUploading(false);
      }

      await onSubmit({ winner, proofMediaPath: proofPath });
    } catch (e: any) {
      Alert.alert("Report failed", e?.message ?? "Could not report result.");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const busy = loading || submitting || uploading;
  const proofHint = proofRequired
    ? "Proof required — screenshot or clip from the match."
    : "Proof optional — add one if you want extra protection.";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Report Winner</Text>
          <Text style={styles.sub}>
            {gameType ? `${gameType} • ` : ""}
            {challengeId ? `Challenge ${String(challengeId).slice(0, 8)}…` : ""}
          </Text>
          <Text style={styles.hint}>
            Opponent has {EGAME_CONFIRM_HOURS} hours to confirm. No dispute = final.
          </Text>

          <Text style={styles.proofLabel}>{proofHint}</Text>
          <View style={styles.proofRow}>
            <Pressable onPress={() => pickProof(true)} style={({ pressed }) => [styles.proofBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="camera-outline" size={18} color={colors.text} />
              <Text style={styles.proofBtnText}>Camera</Text>
            </Pressable>
            <Pressable onPress={() => pickProof(false)} style={({ pressed }) => [styles.proofBtn, pressed && { opacity: 0.85 }]}>
              <Ionicons name="image-outline" size={18} color={colors.text} />
              <Text style={styles.proofBtnText}>{proofUri ? "Change" : "Gallery"}</Text>
            </Pressable>
          </View>
          {proofUri ? <Text style={styles.proofAttached}>Proof attached</Text> : null}
          {proofRequired && proofReasons.length > 0 ? (
            <Text style={styles.proofWhy}>
              Required because: {proofReasons.map((r) => r.replace(/_/g, " ")).join(", ")}
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
          <Pressable onPress={onClose} disabled={busy} style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.9 }]}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </Pressable>

          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator />
              <Text style={styles.busyText}>{uploading ? "Uploading proof…" : "Submitting…"}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#0b1220",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  title: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 4 },
  sub: { color: "#9ca3af", fontSize: 13, marginBottom: 8 },
  hint: { color: "#6b7280", fontSize: 12, marginBottom: 12, lineHeight: 18 },
  proofLabel: { color: "#d1d5db", fontSize: 13, fontWeight: "700", marginBottom: 8 },
  proofRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
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
  proofAttached: { color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 4 },
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
