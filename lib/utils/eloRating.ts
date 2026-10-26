/** ELO math + competitive rank tiers (matches DB trigger K=32). */

export const ELO_K = 32;
export const ELO_DEFAULT = 1000;
export const ELO_MIN = 100;
export const ELO_MAX = 3000;

export type RankTier = {
  key: string;
  name: string;
  min: number;
  max: number;
  color: string;
  emblem: string;
};

export const RANK_TIERS: RankTier[] = [
  { key: "bronze", name: "Bronze", min: 0, max: 799, color: "#CD7F32", emblem: "🥉" },
  { key: "silver", name: "Silver", min: 800, max: 999, color: "#C0C0C0", emblem: "🥈" },
  { key: "gold", name: "Gold", min: 1000, max: 1199, color: "#F59E0B", emblem: "🥇" },
  { key: "platinum", name: "Platinum", min: 1200, max: 1399, color: "#38BDF8", emblem: "💎" },
  { key: "diamond", name: "Diamond", min: 1400, max: 1599, color: "#818CF8", emblem: "💠" },
  { key: "legend", name: "Legend", min: 1600, max: ELO_MAX, color: "#F472B6", emblem: "👑" },
];

const DIVISIONS = ["IV", "III", "II", "I"] as const;

export function clampRating(rating: number): number {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(rating)));
}

export function expectedScore(selfRating: number, oppRating: number): number {
  return 1 / (1 + Math.pow(10, (oppRating - selfRating) / 400));
}

/** Delta for the winner (positive) given pre-match ratings. */
export function computeWinnerRatingDelta(winnerRating: number, loserRating: number): number {
  const e = expectedScore(winnerRating, loserRating);
  return Math.round(ELO_K * (1 - e));
}

/** Delta for the loser (negative). */
export function computeLoserRatingDelta(winnerRating: number, loserRating: number): number {
  return -computeWinnerRatingDelta(winnerRating, loserRating);
}

export function computeMatchRatingDeltas(
  winnerRating: number,
  loserRating: number,
  isTie = false
): { winnerDelta: number; loserDelta: number } {
  if (isTie) {
    const e1 = expectedScore(winnerRating, loserRating);
    const d1 = Math.round(ELO_K * (0.5 - e1));
    return { winnerDelta: d1, loserDelta: -d1 };
  }
  const win = computeWinnerRatingDelta(winnerRating, loserRating);
  return { winnerDelta: win, loserDelta: -win };
}

export function getRankTier(rating: number): RankTier {
  const r = clampRating(rating);
  for (let i = RANK_TIERS.length - 1; i >= 0; i -= 1) {
    if (r >= RANK_TIERS[i].min) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
}

/** e.g. "Gold II" — four divisions within each tier band. */
export function getRankLabel(rating: number): string {
  const tier = getRankTier(rating);
  const span = tier.max - tier.min + 1;
  const pos = clampRating(rating) - tier.min;
  const idx = Math.min(DIVISIONS.length - 1, Math.floor((pos / span) * DIVISIONS.length));
  return `${tier.name} ${DIVISIONS[idx]}`;
}

export function formatRatingDelta(delta: number | null | undefined): string | null {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return null;
  return delta > 0 ? `+${delta} Rating` : `${delta} Rating`;
}
