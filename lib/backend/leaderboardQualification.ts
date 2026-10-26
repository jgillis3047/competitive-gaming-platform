// Notify winners when their challenge may map to a spot / King leaderboard record type.
import { getGameConfig, type GameConfig } from "../data/gameConfig";
import { NOTIFICATION_TYPES } from "./notificationTypes";
import { notifyUser } from "./notifications";

const KEYWORD_MAP: { test: (gt: string) => boolean; slug: string; label: string }[] = [
  {
    test: (gt) =>
      gt.includes("basketball") || gt.includes("3pt") || gt.includes("three point") || gt.includes("3-point"),
    slug: "three_pointers_60s",
    label: "3-pointers (60s)",
  },
  {
    test: (gt) => gt.includes("free throw streak"),
    slug: "free_throw_streak",
    label: "free throw streak",
  },
  {
    test: (gt) => gt.includes("3pt streak") || gt.includes("3-point streak"),
    slug: "three_point_streak",
    label: "3-point streak",
  },
  {
    test: (gt) => gt.includes("mile") || gt.includes("track") || gt.includes("run") || gt.includes("5k"),
    slug: "mile_run",
    label: "fastest mile",
  },
  {
    test: (gt) =>
      gt.includes("golf") ||
      gt.includes("carry") ||
      gt.includes("driving range") ||
      gt.includes("drive"),
    slug: "carry_distance_yards",
    label: "longest carry",
  },
];

export type LeaderboardQualificationHint = { slug: string; label: string };

export function resolveLeaderboardHintsForGameType(gameType: string | null | undefined): LeaderboardQualificationHint[] {
  const gt = String(gameType ?? "").toLowerCase();
  const cfg = getGameConfig(gameType) as (GameConfig & { leaderboardRecordSlugs?: string[] }) | null;
  const slugToLabel: Record<string, string> = {
    mile_run: "fastest mile",
    three_pointers_60s: "3-pointers (60s)",
    carry_distance_yards: "longest carry",
  };

  const seen = new Set<string>();
  const out: LeaderboardQualificationHint[] = [];

  if (cfg?.leaderboardRecordSlugs?.length) {
    for (const slug of cfg.leaderboardRecordSlugs) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, label: slugToLabel[slug] ?? slug });
    }
  }

  for (const m of KEYWORD_MAP) {
    if (m.test(gt) && !seen.has(m.slug)) {
      seen.add(m.slug);
      out.push({ slug: m.slug, label: m.label });
    }
  }

  return out;
}

export async function notifyWinnerIfLeaderboardQualifies(params: {
  winnerUserId: string | null | undefined;
  gameType: string | null | undefined;
  winnerScore?: number | null;
  challengeId: string;
}): Promise<void> {
  const winnerId = params.winnerUserId ? String(params.winnerUserId) : null;
  if (!winnerId) return;

  const hints = resolveLeaderboardHintsForGameType(params.gameType);
  if (hints.length === 0) return;

  const labels = hints.map((h) => h.label).join(", ");
  const scoreBit =
    params.winnerScore != null && Number.isFinite(params.winnerScore)
      ? ` Your winning score (${params.winnerScore}) can back up an attempt or application.`
      : "";

  try {
    await notifyUser({
      targetUserId: winnerId,
      type: NOTIFICATION_TYPES.LEADERBOARD_QUALIFICATION,
      title: "Your win can hit the map leaderboards",
      body: `“${String(params.gameType ?? "Match")}” lines up with spot records (${labels}). Open Leaderboards → Spots to find a gym, park, or city and log or apply.${scoreBit}`,
      link: "/(tabs)/leaderboards",
    });
  } catch {
    /* non-fatal */
  }
}
