import { supabase } from "./supabaseClient";
import { scopeKeyForCourt } from "./kingLeaderboard";
import { computeArenaTier, type ArenaTier } from "../theme/arenaCopy";

export type CourtSpotLegend = {
  attempts24h: number;
  attemptsTotal: number;
  attemptsLast7d: number;
  uniqueCompetitors: number;
  lastActivityLabel: string | null;
  discoveredByName: string | null;
  verificationStatus: string;
  confirmationCount: number;
  arenaTier: ArenaTier;
  /** Primary record used for the spotlight king row. */
  spotlightRecordSlug: string | null;
  spotlightRecordTitle: string | null;
  king: {
    holderName: string | null;
    holderUserId: string | null;
    heldDays: number | null;
    tieAtTop: boolean;
    vacant: boolean;
    badgeTitle: string | null;
    rankLabel: string | null;
    scoreLabel: string | null;
  };
  /** Best score on record board — may differ from crown holder after a dethroning. */
  allTimeLeader: {
    userId: string | null;
    name: string | null;
    scoreLabel: string | null;
  };
  crownDiffersFromAllTime: boolean;
  challengersNearTop: number;
  /** Top board names for contextual discovery — not a social browse list. */
  activeCompetitors: { userId: string; name: string; rank: number }[];
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function formatAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function fetchCourtSpotLegend(
  courtId: string,
  options?: {
    recordSlug?: string | null;
    recordTitle?: string | null;
    higherIsBetter?: boolean;
  }
): Promise<CourtSpotLegend> {
  const recordSlug = options?.recordSlug ?? null;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [attemptsRes, recentRes, courtRes, slotRes, topEntriesRes, confirmRes] = await Promise.all([
    supabase
      .from("court_attempts")
      .select("user_id, created_at")
      .eq("court_id", courtId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("court_attempts")
      .select("created_at")
      .eq("court_id", courtId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("courts").select("created_by, verification_status").eq("id", courtId).maybeSingle(),
    recordSlug
      ? supabase
          .from("king_badge_slots")
          .select("badge_holder_user_id, tie_at_top, badge_title_snapshot, updated_at")
          .eq("scope_key", scopeKeyForCourt(courtId, recordSlug))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    recordSlug
      ? supabase
          .from("king_leaderboard_entries")
          .select("user_id, score_value")
          .eq("scope_key", scopeKeyForCourt(courtId, recordSlug))
          .order("score_value", { ascending: options?.higherIsBetter === false })
          .limit(12)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("court_verification_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("court_id", courtId),
  ]);

  const allAttempts = attemptsRes.data ?? [];
  const attemptsTotal = allAttempts.length;
  const attempts24h = allAttempts.filter((a) => a.created_at && a.created_at >= since24h).length;
  const attemptsLast7d = allAttempts.filter((a) => a.created_at && a.created_at >= since7d).length;
  const uniqueCompetitors = new Set(allAttempts.map((a) => a.user_id).filter(Boolean)).size;

  const verificationStatus =
    (courtRes.data as { verification_status?: string } | null)?.verification_status ?? "approved";
  const confirmationCount = (confirmRes as { count?: number | null }).count ?? 0;
  const arenaTier = computeArenaTier({
    verificationStatus,
    totalAttempts: attemptsTotal,
    uniqueCompetitors,
    attemptsLast7d,
  });

  let discoveredByName: string | null = null;
  const creatorId = (courtRes.data as { created_by?: string | null } | null)?.created_by;
  if (creatorId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", creatorId)
      .maybeSingle();
    discoveredByName =
      (prof as { display_name?: string; username?: string } | null)?.display_name ||
      (prof as { username?: string } | null)?.username ||
      null;
  }

  const slot = slotRes.data as {
    badge_holder_user_id?: string | null;
    tie_at_top?: boolean;
    badge_title_snapshot?: string | null;
    updated_at?: string;
  } | null;

  const entries = (topEntriesRes.data ?? []) as { user_id: string; score_value: number }[];
  const higherIsBetter = options?.higherIsBetter !== false;
  const sorted = [...entries].sort((a, b) =>
    higherIsBetter ? b.score_value - a.score_value : a.score_value - b.score_value
  );

  const profileIds = [...new Set(sorted.map((e) => e.user_id).filter(Boolean))] as string[];
  const namesById = new Map<string, string>();
  if (profileIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      namesById.set(
        String((p as { id: string }).id),
        (p as { display_name?: string; username?: string }).display_name ||
          (p as { username?: string }).username ||
          "Player"
      );
    }
  }

  const crownUserId = slot?.tie_at_top ? null : slot?.badge_holder_user_id ?? null;
  const allTimeUserId = sorted[0]?.user_id ?? null;

  const holderName = crownUserId ? namesById.get(crownUserId) ?? "King" : null;
  const allTimeName = allTimeUserId ? namesById.get(allTimeUserId) ?? null : null;

  const vacant = !crownUserId && !slot?.tie_at_top && sorted.length === 0;
  const crownDiffersFromAllTime =
    !!crownUserId && !!allTimeUserId && crownUserId !== allTimeUserId;

  return {
    attempts24h,
    attemptsTotal,
    attemptsLast7d,
    uniqueCompetitors,
    lastActivityLabel: formatAgo((recentRes.data as { created_at?: string } | null)?.created_at),
    discoveredByName,
    verificationStatus,
    confirmationCount,
    arenaTier,
    spotlightRecordSlug: recordSlug,
    spotlightRecordTitle: options?.recordTitle ?? null,
    king: {
      holderName,
      holderUserId: crownUserId,
      heldDays: crownUserId && !slot?.tie_at_top ? daysSince(slot?.updated_at) : null,
      tieAtTop: !!slot?.tie_at_top,
      vacant: vacant && !slot?.tie_at_top,
      badgeTitle: slot?.badge_title_snapshot ?? options?.recordTitle ?? null,
      rankLabel: sorted[0] ? "1" : null,
      scoreLabel: sorted[0] ? String(sorted[0].score_value) : null,
    },
    allTimeLeader: {
      userId: allTimeUserId,
      name: allTimeName,
      scoreLabel: sorted[0] ? String(sorted[0].score_value) : null,
    },
    crownDiffersFromAllTime,
    challengersNearTop: Math.max(0, sorted.length - (crownUserId ? 1 : 0)),
    activeCompetitors: sorted.slice(0, 8).map((e, i) => ({
      userId: e.user_id,
      name: namesById.get(e.user_id) ?? "Player",
      rank: i + 1,
    })),
  };
}
