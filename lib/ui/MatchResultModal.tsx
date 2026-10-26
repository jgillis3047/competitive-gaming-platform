import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { ChallengeOutcome } from "../backend/challengeActions";
import { outcomeHeadline } from "../backend/challengeActions";
import { sendRematchOfferFromChallenge } from "../backend/rematchActions";
import { useAuthStore } from "../data/authStore";
import { colors } from "../theme/colors";
import { formatRatingDelta } from "../utils/eloRating";
import { pressSoft } from "./pressableStyles";

function formatUSDFromCents(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export type MatchResultModalProps = {
  visible: boolean;
  gameTitle: string;
  gameKey?: string | null;
  outcome: ChallengeOutcome | null;
  scoreLabel?: string | null;
  timeLabel?: string | null;
  challengeId?: string | null;
  opponentUserId?: string | null;
  onClose: () => void;
};

export default function MatchResultModal({
  visible,
  gameTitle,
  gameKey,
  outcome,
  scoreLabel,
  timeLabel,
  challengeId,
  opponentUserId,
  onClose,
}: MatchResultModalProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [rematchLoading, setRematchLoading] = useState(false);
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  const complete = outcome?.status === "completed";
  const won = outcome?.won ?? null;
  const headline = outcome ? outcomeHeadline(outcome) : "Match update";
  const bannerStyle =
    won === true ? styles.bannerWin : won === false ? styles.bannerLoss : complete ? styles.bannerTie : styles.bannerWait;
  const emoji = complete ? (won === true ? "🏆" : won === false ? "😤" : "🤝") : "📤";

  const openRematch = async () => {
    if (!user?.id) {
      Alert.alert("Sign in required", "Log in to send a rematch offer.");
      return;
    }
    if (!opponentUserId || !challengeId) {
      Alert.alert("Rematch", "Open your match thread to send a rematch offer.");
      return;
    }

    setRematchLoading(true);
    try {
      const { threadId } = await sendRematchOfferFromChallenge({
        fromUserId: user.id,
        toUserId: opponentUserId,
        sourceChallengeId: challengeId,
      });
      onClose();
      router.push(`/matches/thread/${threadId}` as any);
    } catch (e: any) {
      Alert.alert("Rematch failed", e?.message ?? "Could not send rematch offer.");
    } finally {
      setRematchLoading(false);
    }
  };

  const viewChallenge = () => {
    onClose();
    if (challengeId) {
      router.replace({ pathname: "/challenge/[id]", params: { id: challengeId } } as any);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <View style={[styles.banner, bannerStyle]}>
            <Text style={styles.bannerText}>{headline}</Text>
            {complete && outcome?.winnerDisplayName && won !== true ? (
              <Text style={styles.bannerSub}>Winner: {outcome.winnerDisplayName}</Text>
            ) : null}
          </View>

          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={styles.sub}>{gameTitle}</Text>

          {scoreLabel ? <Text style={styles.statLine}>{scoreLabel}</Text> : null}
          {timeLabel ? <Text style={styles.statLine}>{timeLabel}</Text> : null}

          {complete && outcome?.myRatingDelta != null ? (
            <Text style={styles.ratingLine}>{formatRatingDelta(outcome.myRatingDelta)}</Text>
          ) : null}

          {complete && outcome?.rewardCents != null && outcome.rewardCents > 0 && won === true ? (
            <Text style={styles.prizeLine}>Prize {formatUSDFromCents(outcome.rewardCents)}</Text>
          ) : null}

          {complete && opponentUserId ? (
            <Pressable
              style={({ pressed }) => [styles.profileLink, pressSoft(pressed)]}
              onPress={() => {
                onClose();
                router.push(`/user/${opponentUserId}` as any);
              }}
            >
              <Text style={styles.profileLinkText}>View opponent profile</Text>
            </Pressable>
          ) : null}

          {complete ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.primary,
                  pressSoft(pressed),
                  rematchLoading && { opacity: 0.7 },
                ]}
                onPress={openRematch}
                disabled={rematchLoading}
              >
                {rematchLoading ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.primaryText}>Ask to rematch</Text>
                )}
              </Pressable>
              {challengeId ? (
                <Pressable style={({ pressed }) => [styles.secondary, pressSoft(pressed)]} onPress={viewChallenge}>
                  <Text style={styles.secondaryText}>View match</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              {challengeId ? (
                <Pressable style={({ pressed }) => [styles.primary, pressSoft(pressed)]} onPress={viewChallenge}>
                  <Text style={styles.primaryText}>View match</Text>
                </Pressable>
              ) : null}
              {opponentUserId && challengeId ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.secondary,
                    pressSoft(pressed),
                    rematchLoading && { opacity: 0.7 },
                  ]}
                  onPress={openRematch}
                  disabled={rematchLoading}
                >
                  {rematchLoading ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.secondaryText}>Ask to rematch</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}

          <Pressable style={({ pressed }) => [styles.ghost, pressSoft(pressed)]} onPress={onClose}>
            <Text style={styles.ghostText}>Close</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    overflow: "hidden",
  },
  banner: {
    width: "100%",
    marginHorizontal: -22,
    marginTop: -22,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  bannerWin: { backgroundColor: "rgba(16,185,129,0.22)" },
  bannerLoss: { backgroundColor: "rgba(239,68,68,0.18)" },
  bannerTie: { backgroundColor: colors.goldSurface },
  bannerWait: { backgroundColor: "rgba(99,102,241,0.18)" },
  bannerText: { color: colors.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
  bannerSub: { color: colors.textSecondary, fontWeight: "800", marginTop: 4, fontSize: 13 },
  emoji: { fontSize: 40, marginBottom: 4 },
  sub: { color: colors.textMuted, fontWeight: "800", marginBottom: 12 },
  statLine: { color: colors.textSecondary, fontWeight: "800", fontSize: 15, marginBottom: 4 },
  ratingLine: { color: colors.success, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  prizeLine: { color: colors.gold, fontWeight: "900", fontSize: 14, marginBottom: 14 },
  profileLink: { marginBottom: 10, paddingVertical: 4 },
  profileLinkText: { color: colors.accentMuted, fontWeight: "800", fontSize: 14 },
  primary: {
    width: "100%",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  primaryText: { color: colors.text, fontWeight: "900", fontSize: 15 },
  secondary: {
    width: "100%",
    backgroundColor: colors.actionBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryText: { color: colors.text, fontWeight: "900", fontSize: 14 },
  ghost: { paddingVertical: 10 },
  ghostText: { color: colors.textMuted, fontWeight: "800" },
});
