// app/daily-rewards.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { getDailyRewardStatus, claimDailyReward, DAILY_REWARD_TIERS, type DailyRewardStatus } from "../lib/backend/dailyRewards";
import { useAuthStore } from "../lib/data/authStore";
import { colors } from "../lib/theme/colors";
import { radius, space } from "../lib/theme/spacing";
import { pressSoft } from "../lib/ui/pressableStyles";
import { success } from "../lib/utils/haptics";

function formatUSDFromCents(cents: number) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

export default function DailyRewardsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width <= 360;
  const userId = useAuthStore((s) => s.user?.id);
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const s = await getDailyRewardStatus(userId);
    setStatus(s);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleClaim = async () => {
    if (!userId || !status?.canClaimToday || claiming) return;
    setClaiming(true);
    const result = await claimDailyReward(userId);
    setClaiming(false);
    if (result.success) {
      success();
      Alert.alert("Reward Claimed!", `You got ${formatUSDFromCents(result.awardedCents)}! Streak: ${result.newStreak} days`);
      load();
    } else {
      Alert.alert("Error", result.error || "Could not claim");
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, compact && { paddingTop: 44, paddingBottom: space.sm }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressSoft(pressed)]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, compact && { fontSize: 22 }]}>Daily Rewards</Text>
      </View>

      <View style={[styles.content, compact && { padding: space.md, gap: space.md }]}>
        <View style={styles.streakCard}>
          <Ionicons name="flame" size={compact ? 42 : 48} color={colors.danger} />
          <Text style={[styles.streakValue, compact && { fontSize: 40 }]}>{status?.currentStreak ?? 0}</Text>
          <Text style={styles.streakLabel}>Day Streak</Text>
        </View>

        <View style={styles.tiersGrid}>
          {DAILY_REWARD_TIERS.map((tier, i) => {
            const isCurrent = status && (status.currentStreak % 7) === i && status.canClaimToday;
            const isPast = status && ((status.currentStreak % 7) > i || !status.canClaimToday);
            const giftColor = isCurrent ? colors.accent : isPast ? colors.success : colors.textMuted;
            return (
              <View key={tier.day} style={[styles.tierCard, isCurrent && styles.tierCurrent, isPast && styles.tierPast]}>
                <Text style={[styles.tierDay, compact && { fontSize: 10 }]}>{tier.label}</Text>
                <Ionicons name="gift" size={24} color={giftColor} />
                <Text style={[styles.tierVc, compact && { fontSize: 12 }, isCurrent && styles.tierVcCurrent]}>
                  {formatUSDFromCents(tier.rewardCents)}
                </Text>
                {isPast ? <Ionicons name="checkmark-circle" size={18} color={colors.success} style={styles.tierCheck} /> : null}
              </View>
            );
          })}
        </View>

        {status?.canClaimToday ? (
          <Pressable onPress={handleClaim} disabled={claiming} style={({ pressed }) => [styles.claimBtn, claiming && { opacity: 0.7 }, pressSoft(pressed)]}>
            <Ionicons name="gift" size={24} color={colors.text} />
            <Text style={[styles.claimBtnText, compact && { fontSize: 16 }]}>
              {claiming ? "..." : `Claim ${formatUSDFromCents(status.todayReward.rewardCents)}`}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.claimedBox}>
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            <Text style={[styles.claimedText, compact && { fontSize: 14 }]}>Come back tomorrow!</Text>
          </View>
        )}

        <Text style={[styles.hint, compact && { fontSize: 12 }]}>Login daily to keep your streak!</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgFeed },
  topBar: {
    paddingTop: 50,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: { marginRight: space.md },
  title: { fontSize: 26, fontWeight: "900", color: colors.text },
  content: { padding: space.lg, gap: space.lg + space.xs },
  streakCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  streakValue: { color: colors.text, fontSize: 48, fontWeight: "900", marginTop: space.sm },
  streakLabel: { color: colors.textTertiary, fontSize: 14, fontWeight: "700" },
  tiersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tierCard: {
    width: "31%",
    minWidth: 94,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  tierCurrent: { borderColor: colors.accentBorder, backgroundColor: colors.accentSurface },
  tierPast: { opacity: 0.6 },
  tierDay: { color: colors.textTertiary, fontSize: 11, fontWeight: "700", marginBottom: space.xs },
  tierVc: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: space.xs },
  tierVcCurrent: { color: colors.accent },
  tierCheck: { position: "absolute", top: space.xs, right: space.xs },
  claimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: 18,
  },
  claimBtnText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  claimedBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: colors.success,
  },
  claimedText: { color: colors.success, fontSize: 16, fontWeight: "800" },
  hint: { color: colors.textTertiary, fontSize: 13, textAlign: "center" },
});
