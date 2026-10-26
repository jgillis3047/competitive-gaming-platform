// lib/backend/kingLeaderboard.ts — per-scope leaderboards, tie ranks (1a/1b), badge slot state
import { supabase } from "./supabaseClient";
import { formatCourtScore } from "./courts";
import { NOTIFICATION_TYPES } from "./notificationTypes";
import { notifyUser } from "./notifications";

export type KingLeaderboardRow = {
  rankLabel: string;
  /** Set for individual leaderboard rows */
  userId: string | null;
  /** Set for team leaderboard rows */
  teamId: string | null;
  scoreValue: number;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isTeam: boolean;
};

export type KingBadgeSlotRow = {
  scope_key: string;
  badge_holder_user_id: string | null;
  badge_holder_team_id?: string | null;
  tie_at_top: boolean;
  badge_title_snapshot: string | null;
  updated_at?: string;
};

export function scopeKeyForCourt(courtId: string, recordSlug: string): string {
  return `court|${courtId}|${recordSlug}`;
}

/** Team competition at a court (separate scope from individual `court|…`). */
export function scopeKeyForTeamCourt(courtId: string, recordSlug: string): string {
  return `court_team|${courtId}|${recordSlug}`;
}

export function scopeKeyForCity(cityName: string, recordSlug: string, areaKind: string): string {
  const cityPart = cityName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return `city|${cityPart}|${recordSlug}|${areaKind}`;
}

export function scopeKeyForTeamCity(cityName: string, recordSlug: string, areaKind: string): string {
  const cityPart = cityName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return `city_team|${cityPart}|${recordSlug}|${areaKind}`;
}

/** Ranks: 1, then 1a/1b for ties, then 2, … */
export function computeRankLabels(
  rows: { subjectId: string; scoreValue: number }[],
  higherIsBetter: boolean
): Map<string, string> {
  const sorted = [...rows].sort((a, b) =>
    higherIsBetter ? b.scoreValue - a.scoreValue : a.scoreValue - b.scoreValue
  );
  const map = new Map<string, string>();
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let i = 0;
  let rank = 1;
  while (i < sorted.length) {
    const v = sorted[i].scoreValue;
    const group: typeof sorted = [];
    while (i < sorted.length && sorted[i].scoreValue === v) {
      group.push(sorted[i]);
      i++;
    }
    if (group.length === 1) {
      map.set(group[0].subjectId, String(rank));
    } else {
      group.forEach((g, j) => {
        map.set(g.subjectId, `${rank}${letters[j] ?? j}`);
      });
    }
    rank += 1;
  }
  return map;
}

export async function fetchKingLeaderboardWithProfiles(
  scopeKey: string,
  recordSlug: string,
  higherIsBetter: boolean
): Promise<{ rows: KingLeaderboardRow[]; slot: KingBadgeSlotRow | null }> {
  const { data: entries, error } = await supabase
    .from("king_leaderboard_entries")
    .select("user_id, team_id, entry_type, score_value")
    .eq("scope_key", scopeKey);
  if (error) throw new Error(error.message);

  const raw = (entries ?? []).map((e: any) => {
    const isTeam = e.entry_type === "team";
    const teamId = e.team_id ? String(e.team_id) : null;
    const userId = e.user_id ? String(e.user_id) : null;
    const subjectId = isTeam && teamId ? teamId : userId ?? "";
    return {
      subjectId,
      userId,
      teamId,
      isTeam,
      scoreValue: Number(e.score_value),
    };
  });

  const rankMap = computeRankLabels(
    raw.map((r) => ({ subjectId: r.subjectId, scoreValue: r.scoreValue })),
    higherIsBetter
  );

  if (raw.length === 0) {
    const { data: slotOnly } = await supabase.from("king_badge_slots").select("*").eq("scope_key", scopeKey).maybeSingle();
    return { rows: [], slot: (slotOnly as KingBadgeSlotRow) ?? null };
  }

  const userIds = raw.filter((r) => r.userId).map((r) => r.userId!);
  const teamIds = raw.filter((r) => r.teamId).map((r) => r.teamId!);

  const pm = new Map<string, { username: string | null; display_name: string | null; avatar_url: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);
    for (const p of profiles ?? []) pm.set(p.id, p as any);
  }

  const tm = new Map<string, { name: string | null; avatar_url: string | null }>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabase.from("teams").select("id, name, avatar_url").in("id", teamIds);
    for (const t of teams ?? []) tm.set(t.id, { name: t.name ?? null, avatar_url: t.avatar_url ?? null });
  }

  const sorted = [...raw].sort((a, b) =>
    higherIsBetter ? b.scoreValue - a.scoreValue : a.scoreValue - b.scoreValue
  );

  const rows: KingLeaderboardRow[] = sorted.map((r) => {
    if (r.isTeam && r.teamId) {
      const t = tm.get(r.teamId);
      return {
        rankLabel: rankMap.get(r.subjectId) ?? "?",
        userId: null,
        teamId: r.teamId,
        scoreValue: r.scoreValue,
        username: null,
        displayName: t?.name ?? "Team",
        avatarUrl: t?.avatar_url ?? null,
        isTeam: true,
      };
    }
    const p = r.userId ? pm.get(r.userId) : null;
    return {
      rankLabel: rankMap.get(r.subjectId) ?? "?",
      userId: r.userId,
      teamId: null,
      scoreValue: r.scoreValue,
      username: p?.username ?? null,
      displayName: p?.display_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
      isTeam: false,
    };
  });

  const { data: slot } = await supabase.from("king_badge_slots").select("*").eq("scope_key", scopeKey).maybeSingle();

  return { rows, slot: (slot as KingBadgeSlotRow) ?? null };
}

export function formatKingScore(score: number, recordSlug: string): string {
  return formatCourtScore(score, recordSlug);
}

/** After a court attempt, nudge the submitter about badge vs leaderboard (tie / held by other). */
export async function nudgeAfterCourtAttempt(params: {
  scopeKey: string;
  userId: string;
  recordSlug: string;
  courtName?: string;
}): Promise<void> {
  const { scopeKey, userId, recordSlug, courtName } = params;
  const { data: slot, error: slotErr } = await supabase
    .from("king_badge_slots")
    .select("badge_holder_user_id, badge_holder_team_id, tie_at_top")
    .eq("scope_key", scopeKey)
    .maybeSingle();
  if (slotErr || !slot) return;

  const holderUser = slot.badge_holder_user_id ? String(slot.badge_holder_user_id) : null;
  const holderTeam = (slot as any).badge_holder_team_id ? String((slot as any).badge_holder_team_id) : null;
  const tie = Boolean(slot.tie_at_top);
  const place = courtName ?? "this spot";
  const parts = scopeKey.split("|");
  const courtLink = parts[0] === "court" && parts[1] ? `/courts/${parts[1]}` : "/courts";

  let title: string;
  let body: string;
  if (tie) {
    title = "Tied for #1";
    body = `You're on the leaderboard for ${place} (${recordSlug.replace(/_/g, " ")}). The King badge is unsettled until the tie is broken.`;
  } else if (holderTeam) {
    title = "On the leaderboard";
    body = `You're ranked for ${place}, but a team currently holds the King badge for this competition.`;
  } else if (holderUser && holderUser !== userId) {
    title = "On the leaderboard";
    body = `You're ranked for ${place}, but someone else holds the King badge for this competition.`;
  } else if (holderUser === userId) {
    title = "King badge";
    body = `You currently hold the King badge for this competition at ${place}.`;
  } else {
    return;
  }

  try {
    await notifyUser({
      targetUserId: userId,
      type: NOTIFICATION_TYPES.KING_LEADERBOARD_STATUS,
      title,
      body,
      link: courtLink,
    });
  } catch {
    /* ignore */
  }
}

export async function fetchUserKingBadges(userId: string): Promise<{ title: string; scope_key: string }[]> {
  const { data, error } = await supabase
    .from("user_king_badges")
    .select("title, scope_key")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { title: string; scope_key: string }[];
}

export async function fetchTeamKingBadges(teamId: string): Promise<{ title: string; scope_key: string }[]> {
  const { data, error } = await supabase
    .from("team_king_badges")
    .select("title, scope_key")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { title: string; scope_key: string }[];
}
