// lib/data/badgeDefinitions.ts
// Comprehensive badge system with meaningful achievements

import { colors } from "../theme/colors";

export type BadgeCategory = "wins" | "streak" | "activity" | "special";

export type BadgeDefinition = {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  category: BadgeCategory;
  requirement: string;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // WIN BADGES
  { key: "first_win", label: "First Win", description: "You won your first challenge!", icon: "star", color: colors.amberBright, category: "wins", requirement: "Win 1 challenge" },
  { key: "ten_wins", label: "10 Wins", description: "Double digits! You've won 10 challenges.", icon: "trophy", color: "#f59e0b", category: "wins", requirement: "Win 10 challenges" },
  { key: "twenty_five_wins", label: "25 Wins", description: "A quarter century of victories.", icon: "trophy", color: colors.podiumBronze, category: "wins", requirement: "Win 25 challenges" },
  { key: "fifty_wins", label: "50 Wins", description: "Half a hundred wins!", icon: "medal", color: "#b45309", category: "wins", requirement: "Win 50 challenges" },
  { key: "hundred_wins", label: "100 Wins", description: "Century club! 100 victories.", icon: "medal", color: "#92400e", category: "wins", requirement: "Win 100 challenges" },

  // STREAK BADGES
  { key: "streak_3", label: "Hot Start", description: "3 wins in a row!", icon: "flame", color: "#ef4444", category: "streak", requirement: "Win 3 challenges in a row" },
  { key: "streak_5", label: "On Fire", description: "5 consecutive victories!", icon: "flame", color: "#dc2626", category: "streak", requirement: "Win 5 challenges in a row" },
  { key: "streak_10", label: "Unstoppable", description: "10 wins in a row!", icon: "bonfire", color: "#b91c1c", category: "streak", requirement: "Win 10 challenges in a row" },
  { key: "streak_25", label: "Legendary Run", description: "25 consecutive wins. Legend.", icon: "bonfire", color: "#991b1b", category: "streak", requirement: "Win 25 challenges in a row" },
  { key: "streak_50", label: "Undefeated", description: "50 wins in a row! Dominant.", icon: "rocket", color: "#7f1d1d", category: "streak", requirement: "Win 50 challenges in a row" },

  // ACTIVITY BADGES
  { key: "veteran", label: "Veteran", description: "Played at least 10 challenges.", icon: "shield-checkmark", color: "#6366f1", category: "activity", requirement: "Complete 10 challenges" },
  { key: "grinder", label: "Grinder", description: "25 challenges completed.", icon: "barbell", color: "#4f46e5", category: "activity", requirement: "Complete 25 challenges" },
  { key: "dedicated", label: "Dedicated", description: "50 challenges under your belt.", icon: "fitness", color: "#4338ca", category: "activity", requirement: "Complete 50 challenges" },
  { key: "centurion", label: "Centurion", description: "100 challenges completed.", icon: "ribbon", color: "#3730a3", category: "activity", requirement: "Complete 100 challenges" },

  // SPECIAL BADGES
  { key: "dominant", label: "Dominant", description: "70%+ win rate (min 5 games).", icon: "podium", color: "#10b981", category: "special", requirement: "70%+ win rate (min 5 games)" },
  { key: "perfectionist", label: "Perfectionist", description: "90%+ win rate (min 10 games).", icon: "diamond", color: "#059669", category: "special", requirement: "90%+ win rate (min 10 games)" },
  { key: "og", label: "OG", description: "One of the first to join.", icon: "heart", color: "#ec4899", category: "special", requirement: "Early adopter" },
  { key: "verified", label: "Verified", description: "Account verified.", icon: "checkmark-circle", color: "#3b82f6", category: "special", requirement: "Account verification" },
  { key: "supporter", label: "Supporter", description: "Purchased VC.", icon: "wallet", color: "#8b5cf6", category: "special", requirement: "Purchase any VC pack" },
  { key: "high_roller", label: "High Roller", description: "Spent big on VC!", icon: "cash", color: "#7c3aed", category: "special", requirement: "Purchase 5000+ VC total" },
];

export function getBadgeDefinition(key: string): BadgeDefinition | null {
  return BADGE_DEFINITIONS.find((b) => b.key === key) ?? null;
}

export function computeEarnedBadges(stats: {
  wins: number;
  totalPlayed: number;
  winRate: number;
  streak: number;
  maxStreak?: number;
  vcPurchased?: number;
  accountCreatedAt?: string;
}): BadgeDefinition[] {
  const earned: BadgeDefinition[] = [];
  const { wins, totalPlayed, winRate, streak, maxStreak = streak, vcPurchased = 0, accountCreatedAt } = stats;
  const bestStreak = Math.max(streak, maxStreak);

  if (wins >= 1) { const b = getBadgeDefinition("first_win"); if (b) earned.push(b); }
  if (wins >= 10) { const b = getBadgeDefinition("ten_wins"); if (b) earned.push(b); }
  if (wins >= 25) { const b = getBadgeDefinition("twenty_five_wins"); if (b) earned.push(b); }
  if (wins >= 50) { const b = getBadgeDefinition("fifty_wins"); if (b) earned.push(b); }
  if (wins >= 100) { const b = getBadgeDefinition("hundred_wins"); if (b) earned.push(b); }

  if (bestStreak >= 3) { const b = getBadgeDefinition("streak_3"); if (b) earned.push(b); }
  if (bestStreak >= 5) { const b = getBadgeDefinition("streak_5"); if (b) earned.push(b); }
  if (bestStreak >= 10) { const b = getBadgeDefinition("streak_10"); if (b) earned.push(b); }
  if (bestStreak >= 25) { const b = getBadgeDefinition("streak_25"); if (b) earned.push(b); }
  if (bestStreak >= 50) { const b = getBadgeDefinition("streak_50"); if (b) earned.push(b); }

  if (totalPlayed >= 10) { const b = getBadgeDefinition("veteran"); if (b) earned.push(b); }
  if (totalPlayed >= 25) { const b = getBadgeDefinition("grinder"); if (b) earned.push(b); }
  if (totalPlayed >= 50) { const b = getBadgeDefinition("dedicated"); if (b) earned.push(b); }
  if (totalPlayed >= 100) { const b = getBadgeDefinition("centurion"); if (b) earned.push(b); }

  if (winRate >= 70 && totalPlayed >= 5) { const b = getBadgeDefinition("dominant"); if (b) earned.push(b); }
  if (winRate >= 90 && totalPlayed >= 10) { const b = getBadgeDefinition("perfectionist"); if (b) earned.push(b); }

  if (accountCreatedAt) {
    const created = new Date(accountCreatedAt);
    if (created < new Date("2026-04-01")) { const b = getBadgeDefinition("og"); if (b) earned.push(b); }
  }

  if (vcPurchased > 0) { const b = getBadgeDefinition("supporter"); if (b) earned.push(b); }
  if (vcPurchased >= 5000) { const b = getBadgeDefinition("high_roller"); if (b) earned.push(b); }

  return earned;
}
