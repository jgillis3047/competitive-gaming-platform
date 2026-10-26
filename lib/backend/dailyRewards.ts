// lib/backend/dailyRewards.ts
// Daily login rewards system
import { supabase } from "./supabaseClient";

export type DailyRewardTier = {
  day: number;
  rewardCents: number;
  label: string;
};

export const DAILY_REWARD_TIERS: DailyRewardTier[] = [
  { day: 1, rewardCents: 50, label: "Day 1" },
  { day: 2, rewardCents: 75, label: "Day 2" },
  { day: 3, rewardCents: 100, label: "Day 3" },
  { day: 4, rewardCents: 125, label: "Day 4" },
  { day: 5, rewardCents: 150, label: "Day 5" },
  { day: 6, rewardCents: 200, label: "Day 6" },
  { day: 7, rewardCents: 500, label: "Day 7 Bonus!" },
];

export type DailyRewardStatus = {
  currentStreak: number;
  lastClaimDate: string | null;
  canClaimToday: boolean;
  todayReward: DailyRewardTier;
  nextReward: DailyRewardTier | null;
};

export async function getDailyRewardStatus(userId: string): Promise<DailyRewardStatus> {
  const { data } = await supabase
    .from("daily_rewards")
    .select("current_streak, last_claim_date")
    .eq("user_id", userId)
    .maybeSingle();

  const today = new Date().toISOString().split("T")[0];
  const lastClaim = data?.last_claim_date ?? null;
  const currentStreak = data?.current_streak ?? 0;

  // Check if already claimed today
  const claimedToday = lastClaim === today;

  // Check if streak is broken (missed yesterday)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const streakBroken = lastClaim !== null && lastClaim !== today && lastClaim !== yesterdayStr;

  const effectiveStreak = streakBroken ? 0 : currentStreak;
  const nextDay = claimedToday ? effectiveStreak + 1 : effectiveStreak;
  const rewardDay = Math.min(nextDay + 1, 7);

  const todayReward = DAILY_REWARD_TIERS[(rewardDay - 1) % 7];
  const nextReward = rewardDay < 7 ? DAILY_REWARD_TIERS[rewardDay % 7] : null;

  return {
    currentStreak: effectiveStreak,
    lastClaimDate: lastClaim,
    canClaimToday: !claimedToday,
    todayReward,
    nextReward,
  };
}

export async function claimDailyReward(userId: string): Promise<{ success: boolean; awardedCents: number; newStreak: number; error?: string }> {
  const status = await getDailyRewardStatus(userId);

  if (!status.canClaimToday) {
    return { success: false, awardedCents: 0, newStreak: status.currentStreak, error: "Already claimed today" };
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Calculate new streak
  let newStreak = 1;
  if (status.lastClaimDate === yesterdayStr) {
    newStreak = (status.currentStreak % 7) + 1;
  }

  const rewardCents = DAILY_REWARD_TIERS[(newStreak - 1) % 7].rewardCents;

  const { data: priorReward } = await supabase
    .from("daily_rewards")
    .select("total_claims")
    .eq("user_id", userId)
    .maybeSingle();
  const nextTotalClaims = (priorReward?.total_claims ?? 0) + 1;

  // Upsert daily_rewards record
  const { error: upsertError } = await supabase
    .from("daily_rewards")
    .upsert(
      {
        user_id: userId,
        current_streak: newStreak,
        last_claim_date: today,
        total_claims: nextTotalClaims,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    return { success: false, awardedCents: 0, newStreak: status.currentStreak, error: upsertError.message };
  }

  // Credit wallet in cents
  const { error: walletError } = await supabase.rpc("credit_wallet", {
    p_user_id: userId,
    p_amount: rewardCents,
    p_source_type: "daily_reward",
    p_source_ref: `daily_${today}`,
    p_note: `Day ${newStreak} login reward`,
  });

  if (walletError) {
    const { data: acct } = await supabase
      .from("wallet_accounts")
      .select("id,balance_cents")
      .eq("user_id", userId)
      .maybeSingle();
    if (acct?.id) {
      const nextBal = Number((acct as any).balance_cents ?? 0) + rewardCents;
      await supabase
        .from("wallet_accounts")
        .update({ balance_cents: nextBal })
        .eq("id", acct.id);
      await supabase.from("wallet_transactions").insert({
        wallet_id: acct.id,
        type: "bonus",
        amount_cents: rewardCents,
        source: "daily_reward",
        source_ref: `daily_${today}`,
        description: `Day ${newStreak} login reward`,
        status: "posted",
      });
    }
  }

  return { success: true, awardedCents: rewardCents, newStreak };
}
