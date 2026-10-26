import { supabase } from "./supabaseClient";
import { scopeKeyForCourt, scopeKeyForTeamCourt } from "./kingLeaderboard";

export type KingPreviewPerspective = "individual" | "crew";

export type CourtKingPreview = {
  courtId: string;
  holderDisplayName: string | null;
  /** Individual crown holder user id (for friend pins, etc.) */
  holderUserId: string | null;
  badgeTitle: string | null;
  tieAtTop: boolean;
  heldDays: number | null;
  vacant: boolean;
  /** Record-board leader when different from crown holder */
  allTimeLeaderName: string | null;
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function courtIdFromScope(scopeKey: string): string | null {
  const m = String(scopeKey).match(/^court(?:_team)?\|([^|]+)\|/);
  return m?.[1] ?? null;
}

export async function fetchCourtKingPreviews(
  courtIds: string[],
  recordSlug: string,
  perspective: KingPreviewPerspective = "individual"
): Promise<Map<string, CourtKingPreview>> {
  const isCrew = perspective === "crew";
  const scopeKeyFor = isCrew ? scopeKeyForTeamCourt : scopeKeyForCourt;
  const scopePrefix = isCrew ? "court_team|" : "court|";
  const out = new Map<string, CourtKingPreview>();
  if (!courtIds.length) return out;

  for (const id of courtIds) {
    out.set(id, {
      courtId: id,
      holderDisplayName: null,
      holderUserId: null,
      badgeTitle: null,
      tieAtTop: false,
      heldDays: null,
      vacant: true,
      allTimeLeaderName: null,
    });
  }

  let slots: {
    scope_key: string;
    badge_holder_user_id: string | null;
    badge_holder_team_id: string | null;
    tie_at_top: boolean;
    badge_title_snapshot: string | null;
    updated_at: string;
  }[] = [];

  if (recordSlug && recordSlug !== "all") {
    const keys = courtIds.map((id) => scopeKeyFor(id, recordSlug));
    const { data, error } = await supabase
      .from("king_badge_slots")
      .select("scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot, updated_at")
      .in("scope_key", keys);
    if (error) throw error;
    slots = (data ?? []) as typeof slots;
  } else {
    const { data, error } = await supabase
      .from("king_badge_slots")
      .select("scope_key, badge_holder_user_id, badge_holder_team_id, tie_at_top, badge_title_snapshot, updated_at")
      .like("scope_key", `${scopePrefix}%`);
    if (error) throw error;
    const idSet = new Set(courtIds);
    slots = ((data ?? []) as typeof slots).filter((s) => {
      const cid = courtIdFromScope(s.scope_key);
      return cid && idSet.has(cid);
    });
  }

  const byCourt = new Map<string, (typeof slots)[0]>();
  for (const s of slots) {
    const cid = courtIdFromScope(s.scope_key);
    if (!cid || !out.has(cid)) continue;
    if (!byCourt.has(cid)) byCourt.set(cid, s);
  }

  const holderIds = isCrew
    ? ([...new Set([...byCourt.values()].map((s) => s.badge_holder_team_id).filter(Boolean))] as string[])
    : ([...new Set([...byCourt.values()].map((s) => s.badge_holder_user_id).filter(Boolean))] as string[]);
  const nameById = new Map<string, string>();
  if (holderIds.length) {
    if (isCrew) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", holderIds);
      for (const t of teams ?? []) {
        const label = (t as { name?: string }).name;
        if (label) nameById.set(String((t as { id: string }).id), String(label));
      }
    } else {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", holderIds);
      for (const p of profiles ?? []) {
        const label = (p as any).display_name || (p as any).username;
        if (label) nameById.set(String((p as any).id), String(label));
      }
    }
  }

  for (const [cid, slot] of byCourt) {
    const holderId = isCrew ? slot.badge_holder_team_id : slot.badge_holder_user_id;
    const vacant = !holderId && !slot.tie_at_top;
    out.set(cid, {
      courtId: cid,
      holderDisplayName: holderId ? nameById.get(holderId) ?? (isCrew ? "Crew" : "King") : slot.tie_at_top ? null : null,
      holderUserId: !isCrew && holderId ? holderId : null,
      badgeTitle: slot.badge_title_snapshot,
      tieAtTop: !!slot.tie_at_top,
      heldDays: holderId && !slot.tie_at_top ? daysSince(slot.updated_at) : null,
      vacant: vacant && !slot.tie_at_top,
      allTimeLeaderName: null,
    });
  }

  if (recordSlug && recordSlug !== "all") {
    const keys = courtIds.map((id) => scopeKeyFor(id, recordSlug));
    const { data: lbRows } = await supabase
      .from("king_leaderboard_entries")
      .select("scope_key, user_id, team_id, entry_type, score_value")
      .in("scope_key", keys);

    const topByScope = new Map<string, { subjectId: string; score: number }>();
    for (const row of lbRows ?? []) {
      const sk = String((row as { scope_key: string }).scope_key);
      const entryType = String((row as { entry_type?: string }).entry_type ?? "user");
      if (isCrew && entryType !== "team") continue;
      if (!isCrew && entryType === "team") continue;
      const subjectId = isCrew
        ? String((row as { team_id: string }).team_id ?? "")
        : String((row as { user_id: string }).user_id ?? "");
      if (!subjectId) continue;
      const score = Number((row as { score_value: number }).score_value);
      const prev = topByScope.get(sk);
      if (!prev || score > prev.score) topByScope.set(sk, { subjectId, score });
    }

    const allTimeIds = [...new Set([...topByScope.values()].map((v) => v.subjectId))];
    const allTimeNames = new Map<string, string>();
    if (allTimeIds.length) {
      if (isCrew) {
        const { data: teams } = await supabase.from("teams").select("id, name").in("id", allTimeIds);
        for (const t of teams ?? []) {
          allTimeNames.set(String((t as { id: string }).id), (t as { name?: string }).name ?? "Crew");
        }
      } else {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", allTimeIds);
        for (const p of profiles ?? []) {
          allTimeNames.set(
            String((p as { id: string }).id),
            (p as { display_name?: string; username?: string }).display_name ||
              (p as { username?: string }).username ||
              "Player"
          );
        }
      }
    }

    for (const cid of courtIds) {
      const slot = byCourt.get(cid);
      const sk = scopeKeyFor(cid, recordSlug);
      const top = topByScope.get(sk);
      if (!top) continue;
      const holderId = isCrew ? slot?.badge_holder_team_id : slot?.badge_holder_user_id;
      if (holderId && top.subjectId === holderId) continue;
      const prev = out.get(cid)!;
      out.set(cid, { ...prev, allTimeLeaderName: allTimeNames.get(top.subjectId) ?? null });
    }
  }

  for (const [cid, slot] of byCourt) {
    if (slot.tie_at_top) {
      const prev = out.get(cid)!;
      out.set(cid, {
        ...prev,
        tieAtTop: true,
        holderDisplayName: null,
        heldDays: null,
        vacant: false,
      });
    } else if (isCrew ? slot.badge_holder_team_id : slot.badge_holder_user_id) {
      const prev = out.get(cid)!;
      out.set(cid, { ...prev, vacant: false });
    }
  }

  return out;
}

/** Human copy for list rows and chips. */
export function formatKingStatus(preview: CourtKingPreview | undefined): string {
  if (!preview) return "Tap to view leaderboard";
  if (preview.tieAtTop) return "Contested — tie at the top";
  if (preview.vacant || !preview.holderDisplayName) return "Crown open — claim it";
  const held =
    preview.heldDays != null && preview.heldDays > 0
      ? ` · held ${preview.heldDays} day${preview.heldDays === 1 ? "" : "s"}`
      : preview.heldDays === 0
        ? " · crowned today"
        : "";
  return `King: ${preview.holderDisplayName}${held}`;
}
