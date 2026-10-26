// lib/backend/referrals.ts
import { APP_DISPLAY_NAME } from "../theme/brand";
import { supabase } from "./supabaseClient";

const REFERRAL_REWARD_REFERRER = 500;
const REFERRAL_REWARD_REFEREE = 500;

export type ReferralStats = {
  referralCode: string;
  totalReferrals: number;
  totalEarned: number;
};

export async function getReferralCode(userId: string): Promise<string> {
  const { data } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.code) return data.code;

  const code = generateCode(userId);
  await supabase.from("referral_codes").insert({ user_id: userId, code });
  return code;
}

function generateCode(userId: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = userId.slice(0, 4).toUpperCase();
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return prefix + suffix;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const code = await getReferralCode(userId);
  const { count } = await supabase
    .from("referrals")
    .select("id", { count: "exact" })
    .eq("referrer_id", userId);
  return {
    referralCode: code,
    totalReferrals: count ?? 0,
    totalEarned: (count ?? 0) * REFERRAL_REWARD_REFERRER,
  };
}

export async function applyReferralCode(userId: string, code: string): Promise<{ success: boolean; error?: string }> {
  const upperCode = code.toUpperCase().trim();
  
  const { data: codeData } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", upperCode)
    .maybeSingle();

  if (!codeData?.user_id) return { success: false, error: "Invalid referral code" };
  if (codeData.user_id === userId) return { success: false, error: "Cannot use your own code" };

  const { data: existing } = await supabase
    .from("referrals")
    .select("id")
    .eq("referee_id", userId)
    .maybeSingle();

  if (existing) return { success: false, error: "Already used a referral code" };

  await supabase.from("referrals").insert({
    referrer_id: codeData.user_id,
    referee_id: userId,
    code: upperCode,
  });

  await Promise.all([
    supabase.from("wallet_transactions").insert({ user_id: codeData.user_id, amount: REFERRAL_REWARD_REFERRER, source_type: "referral_reward", source_ref: userId }),
    supabase.from("wallet_transactions").insert({ user_id: userId, amount: REFERRAL_REWARD_REFEREE, source_type: "referral_bonus", source_ref: codeData.user_id }),
  ]);

  return { success: true };
}

export function getReferralShareText(code: string): string {
  return `Join me on ${APP_DISPLAY_NAME}! Use code ${code} to get 500 VC free!`;
}
