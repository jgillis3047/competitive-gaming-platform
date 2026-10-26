import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { sendRematchOfferFromChallenge } from "../../../lib/backend/rematchActions";
import type { FinishGameSessionResult } from "../../../lib/data/finishGameSession";
import { formatGameTime } from "../../../lib/data/finishGameSession";
import { useAuthStore } from "../../../lib/data/authStore";
import { colors } from "../../../lib/theme/colors";
import { pressSoft } from "../../../lib/ui/pressableStyles";

export type GameResultModalProps = {
  visible: boolean;
  gameKey: string;
  gameTitle: string;
  mode: "practice" | "challenge_submitted";
  headline: string;
  scoreLabel?: string | null;
  timeLabel?: string | null;
  session: FinishGameSessionResult | null;
  challengeId?: string | null;
  opponentUserId?: string | null;
  onPlayAgain: () => void;
  onClose: () => void;
};

export default function GameResultModal({
  visible,
  gameKey,
  gameTitle,
  mode,
  headline,
  scoreLabel,
  timeLabel,
  session,
  challengeId,
  opponentUserId,
  onPlayAgain,
  onClose,
}: GameResultModalProps) {
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

  const isBest = session?.isPersonalBest;
  const dailyDone = session?.dailyJustCompleted;

  const openCreateChallenge = () => {
    onClose();
    router.push({
      pathname: "/(tabs)/create",
      params: {
        game: gameKey,
        ...(opponentUserId ? { opponent_user_id: opponentUserId } : {}),
      },
    } as any);
  };

  const openRematch = async () => {
    if (challengeId && opponentUserId && user?.id) {
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
      return;
    }

    onClose();
    router.push({
      pathname: "/(tabs)/create",
      params: {
        game: gameKey,
        ...(opponentUserId ? { opponent_user_id: opponentUserId } : {}),
      },
    } as any);
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
          <Text style={styles.emoji}>{isBest ? "🏆" : mode === "challenge_submitted" ? "📤" : "🎉"}</Text>
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.sub}>{gameTitle}</Text>

          {scoreLabel ? <Text style={styles.statLine}>{scoreLabel}</Text> : null}
          {timeLabel ? <Text style={styles.statLine}>{timeLabel}</Text> : null}

          {session ? (
            <View style={styles.badges}>
              {session.beatBestScore ? (
                <View style={styles.badgeGood}>
                  <Text style={styles.badgeText}>New best score</Text>
                </View>
              ) : null}
              {session.beatBestTime ? (
                <View style={styles.badgeGood}>
                  <Text style={styles.badgeText}>New best time</Text>
                </View>
              ) : null}
              {dailyDone ? (
                <View style={styles.badgeDaily}>
                  <Text style={styles.badgeText}>Daily challenge complete</Text>
                </View>
              ) : null}
              <Text style={styles.meta}>
                Streak {session.progress.dailyStreak}d · Best {session.progress.bestScore ?? "--"} ·{" "}
                {formatGameTime(session.progress.bestTimeSec)}
              </Text>
            </View>
          ) : null}

          {mode === "practice" ? (
            <>
              <Pressable style={({ pressed }) => [styles.primary, pressSoft(pressed)]} onPress={onPlayAgain}>
                <Text style={styles.primaryText}>Play again</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.secondary, pressSoft(pressed)]} onPress={openCreateChallenge}>
                <Text style={styles.secondaryText}>Challenge someone 1v1</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={({ pressed }) => [styles.primary, pressSoft(pressed)]} onPress={viewChallenge}>
                <Text style={styles.primaryText}>View match</Text>
              </Pressable>
              {opponentUserId ? (
                <Pressable
                  style={({ pressed }) => [styles.secondary, pressSoft(pressed), rematchLoading && { opacity: 0.7 }]}
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
  },
  emoji: { fontSize: 40, marginBottom: 8 },
  headline: { color: colors.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
  sub: { color: colors.textMuted, fontWeight: "800", marginTop: 4, marginBottom: 12 },
  statLine: { color: colors.textSecondary, fontWeight: "800", fontSize: 15, marginBottom: 4 },
  badges: { width: "100%", gap: 8, marginBottom: 16, alignItems: "center" },
  badgeGood: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.35)",
  },
  badgeDaily: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.goldSurface,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  badgeText: { color: colors.text, fontWeight: "900", fontSize: 12 },
  meta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 4 },
  primary: {
    width: "100%",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryText: { color: colors.text, fontWeight: "900", fontSize: 15 },
  secondary: {
    width: "100%",
    backgroundColor: colors.actionBlue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryText: { color: colors.text, fontWeight: "900", fontSize: 14 },
  ghost: { paddingVertical: 10 },
  ghostText: { color: colors.textMuted, fontWeight: "800" },
});
