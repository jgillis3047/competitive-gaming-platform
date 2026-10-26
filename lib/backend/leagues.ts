// lib/backend/leagues.ts
import { supabase } from "./supabaseClient";
import type { LeagueRow, LeagueKind } from "../models/teamTypes";

export type LeagueWithExtras = LeagueRow & {
  creator?: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null;
  member_count?: number;
  team_count?: number;
  my_member?: boolean;
};

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "league-" + Date.now();
}

export async function createLeague(params: {
  name: string;
  description?: string | null;
  kind?: LeagueKind;
  userId: string;
}): Promise<LeagueRow> {
  const name = (params.name ?? "").trim();
  if (!name) throw new Error("League name is required.");
  const kind = params.kind ?? "1v1";

  const { data, error } = await supabase
    .from("leagues")
    .insert({
      name,
      slug: slugify(name),
      description: (params.description ?? "").trim() || null,
      kind,
      created_by: params.userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as LeagueRow;
}

export async function getLeagueById(id: string, userId?: string | null): Promise<LeagueWithExtras | null> {
  const { data: league, error } = await supabase
    .from("leagues")
    .select(
      `
      *,
      creator:profiles!leagues_created_by_fkey(id, username, display_name, avatar_url)
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !league) return null;

  const [memberCount, teamCount] = await Promise.all([
    supabase.from("league_members").select("id", { count: "exact", head: true }).eq("league_id", id),
    supabase.from("league_teams").select("id", { count: "exact", head: true }).eq("league_id", id),
  ]);

  let myMember = false;
  if (userId) {
    const { data: lm } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (lm) myMember = true;
    else {
      const { data: myTeams } = await supabase.from("team_members").select("team_id").eq("user_id", userId);
      const teamIds = (myTeams ?? []).map((t) => t.team_id);
      if (teamIds.length > 0) {
        const { data: ltList } = await supabase
          .from("league_teams")
          .select("id")
          .eq("league_id", id)
          .in("team_id", teamIds)
          .limit(1);
        myMember = (ltList ?? []).length > 0;
      }
    }
  }

  return {
    ...league,
    creator: (league as any).creator,
    member_count: memberCount.count ?? 0,
    team_count: teamCount.count ?? 0,
    my_member: myMember,
  } as LeagueWithExtras;
}

export async function joinLeague(params: { leagueId: string; userId: string }): Promise<void> {
  const { data: league } = await supabase.from("leagues").select("kind").eq("id", params.leagueId).maybeSingle();
  if (!league) throw new Error("League not found.");
  if (league.kind === "team") throw new Error("This league is for teams only; add your team instead.");

  const { data: existing } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", params.leagueId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from("league_members").insert({
    league_id: params.leagueId,
    user_id: params.userId,
  });

  if (error) throw error;
}

export async function leaveLeague(params: { leagueId: string; userId: string }): Promise<void> {
  const { error } = await supabase
    .from("league_members")
    .delete()
    .eq("league_id", params.leagueId)
    .eq("user_id", params.userId);

  if (error) throw error;
}

export async function addTeamToLeague(params: { leagueId: string; teamId: string; userId: string }): Promise<void> {
  const { data: league } = await supabase.from("leagues").select("kind").eq("id", params.leagueId).maybeSingle();
  if (!league) throw new Error("League not found.");
  if (league.kind === "1v1") throw new Error("This league is for individuals only.");

  const { data: existing } = await supabase
    .from("league_teams")
    .select("id")
    .eq("league_id", params.leagueId)
    .eq("team_id", params.teamId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from("league_teams").insert({
    league_id: params.leagueId,
    team_id: params.teamId,
  });

  if (error) throw error;
}

export async function removeTeamFromLeague(params: { leagueId: string; teamId: string; userId: string }): Promise<void> {
  const { error } = await supabase
    .from("league_teams")
    .delete()
    .eq("league_id", params.leagueId)
    .eq("team_id", params.teamId);

  if (error) throw error;
}

export async function updateLeague(params: {
  leagueId: string;
  userId: string;
  name?: string;
  description?: string | null;
}): Promise<LeagueRow> {
  const { data: league } = await supabase.from("leagues").select("created_by").eq("id", params.leagueId).maybeSingle();
  if (!league || league.created_by !== params.userId) throw new Error("Only owner can update league.");

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) {
    updates.name = params.name.trim();
    if (updates.name) updates.slug = slugify(updates.name);
  }
  if (params.description !== undefined) updates.description = (params.description ?? "").trim() || null;

  const { data, error } = await supabase
    .from("leagues")
    .update(updates)
    .eq("id", params.leagueId)
    .select("*")
    .single();

  if (error) throw error;
  return data as LeagueRow;
}

export async function deleteLeague(params: { leagueId: string; userId: string }): Promise<void> {
  const { data: league } = await supabase.from("leagues").select("created_by").eq("id", params.leagueId).maybeSingle();
  if (!league || league.created_by !== params.userId) throw new Error("Only owner can delete league.");

  const { error } = await supabase.from("leagues").delete().eq("id", params.leagueId);
  if (error) throw error;
}

export async function listLeaguesForUser(userId: string): Promise<LeagueWithExtras[]> {
  const { data: memberships } = await supabase.from("league_members").select("league_id").eq("user_id", userId);
  const ids = (memberships ?? []).map((m) => m.league_id);

  if (ids.length === 0) return [];

  const { data: leagues, error } = await supabase
    .from("leagues")
    .select(
      `
      *,
      creator:profiles!leagues_created_by_fkey(id, username, display_name, avatar_url)
    `
    )
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const withCounts = await Promise.all(
    (leagues ?? []).map(async (l: any) => {
      const [mc, tc] = await Promise.all([
        supabase.from("league_members").select("id", { count: "exact", head: true }).eq("league_id", l.id),
        supabase.from("league_teams").select("id", { count: "exact", head: true }).eq("league_id", l.id),
      ]);
      return {
        ...l,
        creator: l.creator,
        member_count: mc.count ?? 0,
        team_count: tc.count ?? 0,
        my_member: true,
      };
    })
  );

  return withCounts as LeagueWithExtras[];
}

/** Leagues where the given team is a member (league_teams). */
export async function listLeaguesForTeam(teamId: string): Promise<LeagueWithExtras[]> {
  const { data: lt } = await supabase.from("league_teams").select("league_id").eq("team_id", teamId);
  const ids = [...new Set((lt ?? []).map((r) => r.league_id))];
  if (ids.length === 0) return [];
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select(`*, creator:profiles!leagues_created_by_fkey(id, username, display_name, avatar_url)`)
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const withCounts = await Promise.all(
    (leagues ?? []).map(async (l: any) => {
      const [mc, tc] = await Promise.all([
        supabase.from("league_members").select("id", { count: "exact", head: true }).eq("league_id", l.id),
        supabase.from("league_teams").select("id", { count: "exact", head: true }).eq("league_id", l.id),
      ]);
      return { ...l, creator: l.creator, member_count: mc.count ?? 0, team_count: tc.count ?? 0 };
    })
  );
  return withCounts as LeagueWithExtras[];
}

export async function listRecentLeagues(limit = 20): Promise<LeagueWithExtras[]> {
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select(
      `
      *,
      creator:profiles!leagues_created_by_fkey(id, username, display_name, avatar_url)
    `
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const withCounts = await Promise.all(
    (leagues ?? []).map(async (l: any) => {
      const [mc, tc] = await Promise.all([
        supabase.from("league_members").select("id", { count: "exact", head: true }).eq("league_id", l.id),
        supabase.from("league_teams").select("id", { count: "exact", head: true }).eq("league_id", l.id),
      ]);
      return {
        ...l,
        creator: l.creator,
        member_count: mc.count ?? 0,
        team_count: tc.count ?? 0,
      };
    })
  );

  return withCounts as LeagueWithExtras[];
}

/** Search leagues by name (for discover/search). */
export async function searchLeagues(query: string, limit = 15): Promise<LeagueWithExtras[]> {
  const q = String(query ?? "").trim();
  if (!q || q.length < 2) return [];

  const slug = q.replace(/\s+/g, "-").toLowerCase();
  const { data, error } = await supabase
    .from("leagues")
    .select(`*, creator:profiles!leagues_created_by_fkey(id, username, display_name, avatar_url)`)
    .or(`name.ilike.%${q}%,slug.ilike.%${slug}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const withCounts = await Promise.all(
    (data ?? []).map(async (l: any) => {
      const [mc, tc] = await Promise.all([
        supabase.from("league_members").select("id", { count: "exact", head: true }).eq("league_id", l.id),
        supabase.from("league_teams").select("id", { count: "exact", head: true }).eq("league_id", l.id),
      ]);
      return { ...l, creator: l.creator, member_count: mc.count ?? 0, team_count: tc.count ?? 0 };
    })
  );
  return withCounts as LeagueWithExtras[];
}

export type LeagueChallengeRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  status: string;
  creator_team_id: string | null;
  opponent_team_id: string | null;
  winner_team_id: string | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
  created_at: string;
  expires_at: string | null;
};

export async function getLeagueChallenges(leagueId: string, limit = 20): Promise<LeagueChallengeRow[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("id, title, game_type, status, creator_team_id, opponent_team_id, winner_team_id, entry_fee_cents, win_reward_cents, created_at, expires_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as LeagueChallengeRow[];
}
