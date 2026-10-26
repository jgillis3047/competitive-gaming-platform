// app/challenge/[id]/submit.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { supabase } from "../../../lib/backend/supabaseClient";
import { useAuthStore } from "../../../lib/data/authStore";
import { useWalletStore } from "../../../lib/data/walletStore";

// ✅ Use the real action (single source of truth)
import { submitChallengeResult } from "../../../lib/backend/challengeActions";
import { isManualGameType } from "../../../lib/data/gameConfig";

// -------- Types --------
type ChallengeStatus =
  | "open"
  | "accepted"
  | "in-progress"
  | "checked-in"
  | "completed"
  | "cancelled"
  | "disputed";

type ChallengeRow = {
  id: string;
  game_type: string | null;
  status: ChallengeStatus;
  title: string | null;
  kind?: "phone" | "in_person" | "admin_event" | "egame" | null;
};

export default function SubmitScoreScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id ?? "");

  const user = useAuthStore((s) => s.user);
  const refreshWallet = useWalletStore((s: any) => s.refresh ?? s.loadFromBackend);

  const [scoreText, setScoreText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeRow | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoadingChallenge(true);

        const { data, error } = await supabase
          .from("challenges")
          .select("id, game_type, status, title, kind")
          .eq("id", challengeId)
          .single();

        if (error) throw error;
        if (mounted) setChallenge(data as any);
      } catch {
        if (mounted) setChallenge(null);
      } finally {
        if (mounted) setLoadingChallenge(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [challengeId]);

  // ✅ Block submit screen for:
  // - in-person challenges (they must use check-in + confirm flow)
  // - non-manual phone games (they auto-submit when finished)
  useEffect(() => {
    if (loadingChallenge) return;
    if (!challenge) return;

    const kind = (challenge.kind ?? "phone") as any;

    if (kind === "in_person") {
      Alert.alert(
        "In-person challenge",
        "In-person results are submitted from the challenge page after both players check in.",
        [{ text: "OK", onPress: () => router.replace(`/challenge/${challengeId}`) }]
      );
      return;
    }

    if (kind === "egame") {
      Alert.alert(
        "E-game challenge",
        "E-game results are reported from the challenge page. Open the challenge and tap Report winner.",
        [{ text: "OK", onPress: () => router.replace(`/challenge/${challengeId}`) }]
      );
      return;
    }

    if (!isManualGameType(challenge.game_type)) {
      Alert.alert(
        "Not needed",
        "Phone games submit automatically when you finish playing.",
        [{ text: "OK", onPress: () => router.replace(`/challenge/${challengeId}`) }]
      );
    }
  }, [challenge, loadingChallenge, challengeId, router]);

  const score = useMemo(() => {
    const n = Number(scoreText);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }, [scoreText]);

  const handleSubmit = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Log in to submit a result.");
      return;
    }
    if (!challengeId) return;

    if (!challenge) {
      Alert.alert("Error", "Challenge not found.");
      return;
    }

    const kind = (challenge.kind ?? "phone") as any;
    if (kind === "in_person") {
      Alert.alert("In-person challenge", "Use the in-person submit flow on the challenge page.");
      return;
    }
    if (kind === "egame") {
      Alert.alert("E-game challenge", "Report the winner from the challenge page.");
      return;
    }

    if (!isManualGameType(challenge.game_type)) {
      Alert.alert("Auto-submit game", "Finish the game to submit automatically.");
      return;
    }

    if (score == null) {
      Alert.alert("Invalid score", "Enter a valid number.");
      return;
    }
    if (score < 0) {
      Alert.alert("Invalid score", "Score can't be negative.");
      return;
    }

    try {
      setSubmitting(true);

      // ✅ Single source of truth:
      // - updates challenge_players
      // - flips accepted -> in-progress on first submit
      // - completes when both submitted
      // - settles payout/refund
      await submitChallengeResult({
        challengeId,
        userId: user.id,
        score,
        // Manual score games are typically "higher wins"
        scoreSort: "desc",
      });

      await refreshWallet();
      router.replace(`/challenge/${challengeId}`);
    } catch (e: any) {
      console.error("[SubmitScore] error:", e);
      Alert.alert("Submit failed", e?.message ?? "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Submit Result</Text>
      <Text style={styles.sub}>Challenge: {challengeId}</Text>

      <Text style={styles.label}>Your score</Text>
      <TextInput
        value={scoreText}
        onChangeText={setScoreText}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor="#6b7280"
        style={styles.input}
      />

      <Pressable
        style={[styles.primary, (submitting || loadingChallenge) && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting || loadingChallenge}
      >
        <Text style={styles.primaryText}>{submitting ? "Submitting…" : "Submit"}</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={() => router.back()} disabled={submitting}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050819", padding: 20, paddingTop: 30 },
  h1: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 6 },
  sub: { color: "#9CA3AF", marginBottom: 18 },
  label: { color: "#9CA3AF", marginBottom: 6, fontWeight: "700" },
  input: {
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#1f2937",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  primary: { backgroundColor: "#2563eb", borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondary: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { color: "#e5e7eb", fontWeight: "900" },
});
