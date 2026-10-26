// lib/utils/scoreCompare.ts — Compare reported vs AI-detected scores

export function scoresMatch(params: {
  reported: number;
  detected: number;
  higherIsBetter: boolean;
  tolerancePct: number;
}): boolean {
  const { reported, detected, tolerancePct } = params;
  if (!Number.isFinite(reported) || !Number.isFinite(detected)) return false;
  if (reported <= 0 || detected <= 0) return false;

  const diff = Math.abs(reported - detected);
  const base = Math.max(reported, detected, 1);
  const pctDiff = (diff / base) * 100;
  return pctDiff <= tolerancePct;
}

export function pickDetectedNumeric(fields: {
  detected_count?: number | null;
  detected_streak?: number | null;
  detected_time_sec?: number | null;
  detected_distance?: number | null;
  detected_level?: number | null;
  detected_score?: string | null;
}): number | null {
  const nums = [
    fields.detected_count,
    fields.detected_streak,
    fields.detected_time_sec,
    fields.detected_distance,
    fields.detected_level,
  ].filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  if (nums.length > 0) return nums[0];

  if (fields.detected_score) {
    const m = fields.detected_score.match(/[\d.]+/);
    if (m) {
      const n = Number(m[0]);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}
