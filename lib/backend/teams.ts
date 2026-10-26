// lib/backend/teams.ts
import { supabase } from "./supabaseClient";
import type { TeamRow, TeamMemberRow, TeamMemberRole } from "../models/teamTypes";

export type TeamWithExtras = TeamRow & {
  creator?: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null;
  member_count?: number;
  my_role?: TeamMemberRole | null;
};

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team-" + Date.now();
}

export async function createTeam(params: {
  name: string;
  description?: string | null;
  userId: string;
}): Promise<TeamRow> {
  const name = (params.name ?? "").trim();
  if (!name) throw new Error("Crew name is required.");
  const slug = slugify(name);

  const { data, error } = await supabase
    .from("teams")
    .insert({ name, slug, description: (params.description ?? "").trim() || null, created_by: params.userId })
    .select("*")
    .single();

  if (error) throw error;
  const team = data as TeamRow;

  await supabase.from("team_members").insert({ team_id: team.id, user_id: params.userId, role: "owner" });
  return team;
}

/** Create a crew and optionally send invites. */
export async function createCrewWithInvites(params: {
  name: string;
  description?: string | null;
  userId: string;
  inviteUserIds: string[];
}): Promise<TeamRow> {
  const inviteUserIds = [...new Set(params.inviteUserIds.filter((id) => id && id !== params.userId))];

  const team = await createTeam({
    name: params.name,
    description: params.description,
    userId: params.userId,
  });

  for (const invitedUserId of inviteUserIds) {
    await createTeamInvite({
      teamId: team.id,
      invitedUserId,
      invitedByUserId: params.userId,
    });
  }

  return team;
}

async function teamMemberUserIds(teamId: string): Promise<string[]> {
  const members = await getTeamMembers(teamId);
  return members.map((m) => m.user_id).filter(Boolean);
}

export async function getTeamPostCount(teamId: string): Promise<number> {
  const userIds = await teamMemberUserIds(teamId);
  if (!userIds.length) return 0;

  const { count, error } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .in("user_id", userIds);

  if (error) return 0;
  return count ?? 0;
}

export async function getTeamPosts(teamId: string, limit = 20) {
  const userIds = await teamMemberUserIds(teamId);
  if (!userIds.length) return [];

  const { data, error } = await supabase
    .from("posts")
    .select(`*, author:profiles!posts_user_id_fkey(id, username, display_name, avatar_url)`)
    .in("user_id", userIds)
    .is("parent_post_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

export async function getTeamById(id: string): Promise<TeamWithExtras | null> {
  const { data: team, error } = await supabase
    .from("teams")
    .select(`*, creator:profiles!teams_created_by_fkey(id, username, display_name, avatar_url)`)
    .eq("id", id)
    .maybeSingle();

  if (error || !team) return null;

  const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", id);

  return { ...team, creator: (team as any).creator, member_count: count ?? 0 } as TeamWithExtras;
}

export async function getTeamMembers(teamId: string): Promise<(TeamMemberRow & { user?: any })[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select(`*, user:profiles!team_members_user_id_fkey(id, username, display_name, avatar_url)`)
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as (TeamMemberRow & { user?: any })[];
}

export async function getMyRole(teamId: string, userId: string): Promise<TeamMemberRole | null> {
  const { data, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data.role as TeamMemberRole;
}

export async function joinTeam(params: { teamId: string; userId: string }): Promise<void> {
  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: params.teamId, user_id: params.userId, role: "member" });

  if (error) throw error;
}

export async function leaveTeam(params: { teamId: string; userId: string }): Promise<void> {
  const { data: member } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (!member) return;
  if (member.role === "owner") throw new Error("Owner cannot leave; transfer ownership or delete crew.");

  const { error } = await supabase.from("team_members").delete().eq("team_id", params.teamId).eq("user_id", params.userId);

  if (error) throw error;
}

export async function updateTeam(params: {
  teamId: string;
  userId: string;
  name?: string;
  description?: string | null;
}): Promise<TeamRow> {
  const role = await getMyRole(params.teamId, params.userId);
  if (!role || !["owner", "admin"].includes(role)) throw new Error("Not authorized to update crew.");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) {
    updates.name = params.name.trim();
    if (updates.name) (updates as any).slug = slugify(params.name);
  }
  if (params.description !== undefined) updates.description = (params.description ?? "").trim() || null;

  const { data, error } = await supabase.from("teams").update(updates).eq("id", params.teamId).select("*").single();

  if (error) throw error;
  return data as TeamRow;
}

export async function removeMember(params: { teamId: string; userId: string; targetUserId: string }): Promise<void> {
  const myRole = await getMyRole(params.teamId, params.userId);
  if (!myRole || !["owner", "admin"].includes(myRole)) throw new Error("Not authorized to remove members.");

  const { data: target } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", params.teamId)
    .eq("user_id", params.targetUserId)
    .maybeSingle();

  if (!target) return;
  if (target.role === "owner") throw new Error("Cannot remove owner.");
  if (myRole === "admin" && target.role === "admin") throw new Error("Admin cannot remove another admin.");

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", params.teamId)
    .eq("user_id", params.targetUserId);

  if (error) throw error;
}

export async function deleteTeam(params: { teamId: string; userId: string }): Promise<void> {
  const { data: team } = await supabase.from("teams").select("created_by").eq("id", params.teamId).single();
  if (!team || team.created_by !== params.userId) throw new Error("Only owner can delete crew.");

  const { error } = await supabase.from("teams").delete().eq("id", params.teamId);
  if (error) throw error;
}

export async function listTeamsForUser(userId: string): Promise<TeamWithExtras[]> {
  const { data: memberships, error: memErr } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);

  if (memErr || !memberships?.length) return [];

  const ids = memberships.map((m) => m.team_id);
  const { data: teams, error } = await supabase
    .from("teams")
    .select(`*, creator:profiles!teams_created_by_fkey(id, username, display_name, avatar_url)`)
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const withCounts = await Promise.all(
    (teams ?? []).map(async (t: any) => {
      const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", t.id);
      const { data: myMem } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", t.id)
        .eq("user_id", userId)
        .maybeSingle();
      return { ...t, creator: t.creator, member_count: count ?? 0, my_role: (myMem as any)?.role ?? null };
    })
  );

  return withCounts as TeamWithExtras[];
}

export async function listRecentTeams(limit = 20): Promise<TeamWithExtras[]> {
  const { data: teams, error } = await supabase
    .from("teams")
    .select(`*, creator:profiles!teams_created_by_fkey(id, username, display_name, avatar_url)`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const withCounts = await Promise.all(
    (teams ?? []).map(async (t: any) => {
      const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", t.id);
      return { ...t, creator: t.creator, member_count: count ?? 0 };
    })
  );

  return withCounts as TeamWithExtras[];
}

export type TeamChallengeRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  status: string;
  creator_team_id: string | null;
  opponent_team_id: string | null;
  league_id: string | null;
  winner_team_id: string | null;
  entry_fee_cents?: number | null;
  win_reward_cents?: number | null;
  created_at: string;
  expires_at: string | null;
};

export async function getTeamsByIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("teams").select("id, name").in("id", unique);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const t of data ?? []) m.set(t.id, t.name ?? "Crew");
  return m;
}

/** Search teams by name (for discover/search). */
export async function searchTeams(query: string, limit = 15): Promise<TeamWithExtras[]> {
  const q = String(query ?? "").trim();
  if (!q || q.length < 2) return [];

  const { data, error } = await supabase
    .from("teams")
    .select(`*, creator:profiles!teams_created_by_fkey(id, username, display_name, avatar_url)`)
    .or(`name.ilike.%${q}%,slug.ilike.%${q.replace(/\s+/g, "-").toLowerCase()}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const withCounts = await Promise.all(
    (data ?? []).map(async (t: any) => {
      const { count } = await supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", t.id);
      return { ...t, creator: t.creator, member_count: count ?? 0 };
    })
  );
  return withCounts as TeamWithExtras[];
}

export async function getTeamChallenges(teamId: string, limit = 20): Promise<TeamChallengeRow[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("id, title, game_type, status, creator_team_id, opponent_team_id, league_id, winner_team_id, entry_fee_cents, win_reward_cents, created_at, expires_at")
    .or(`creator_team_id.eq.${teamId},opponent_team_id.eq.${teamId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TeamChallengeRow[];
}

/** Open team challenges created by this user (awaiting opponent). */
export type TeamInviteRow = {
  id: string;
  team_id: string;
  invited_user_id: string;
  invited_by: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export type TeamInviteWithExtras = TeamInviteRow & {
  team?: { id: string; name: string } | null;
  inviter?: { id: string; username: string | null; display_name: string | null } | null;
  invited_user?: { id: string; username: string | null; display_name: string | null } | null;
};

export async function createTeamInvite(params: {
  teamId: string;
  invitedUserId: string;
  invitedByUserId: string;
}): Promise<TeamInviteRow> {
  const role = await getMyRole(params.teamId, params.invitedByUserId);
  if (!role || !["owner", "admin"].includes(role)) throw new Error("Not authorized to invite.");

  const { data: existingMember } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("user_id", params.invitedUserId)
    .maybeSingle();
  if (existingMember) throw new Error("User is already a member.");

  const { data: existingInvite } = await supabase
    .from("team_invites")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("invited_user_id", params.invitedUserId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingInvite) throw new Error("User already has a pending invite.");

  const { data, error } = await supabase
    .from("team_invites")
    .insert({
      team_id: params.teamId,
      invited_user_id: params.invitedUserId,
      invited_by: params.invitedByUserId,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as TeamInviteRow;
}

export async function acceptTeamInvite(inviteId: string, userId: string): Promise<void> {
  const { data: invite, error: fetchErr } = await supabase
    .from("team_invites")
    .select("team_id, invited_user_id, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (fetchErr || !invite) throw new Error("Invite not found.");
  if (invite.invited_user_id !== userId) throw new Error("Not authorized to accept this invite.");
  if (invite.status !== "pending") throw new Error("Invite is no longer pending.");

  const { error: updateErr } = await supabase
    .from("team_invites")
    .update({ status: "accepted" })
    .eq("id", inviteId);
  if (updateErr) throw updateErr;

  await joinTeam({ teamId: invite.team_id, userId });
}

export async function declineTeamInvite(inviteId: string, userId: string): Promise<void> {
  const { data: invite, error: fetchErr } = await supabase
    .from("team_invites")
    .select("invited_user_id, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (fetchErr || !invite) throw new Error("Invite not found.");
  if (invite.invited_user_id !== userId) throw new Error("Not authorized to decline this invite.");
  if (invite.status !== "pending") throw new Error("Invite is no longer pending.");

  const { error } = await supabase
    .from("team_invites")
    .update({ status: "declined" })
    .eq("id", inviteId);
  if (error) throw error;
}

export async function cancelTeamInvite(inviteId: string, userId: string): Promise<void> {
  const { data: invite, error: fetchErr } = await supabase
    .from("team_invites")
    .select("team_id, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (fetchErr || !invite) throw new Error("Invite not found.");
  if (invite.status !== "pending") throw new Error("Invite is no longer pending.");

  const role = await getMyRole(invite.team_id, userId);
  if (!role || !["owner", "admin"].includes(role)) throw new Error("Not authorized to cancel invite.");

  const { error } = await supabase.from("team_invites").update({ status: "declined" }).eq("id", inviteId);
  if (error) throw error;
}

export async function listPendingInvitesForUser(userId: string): Promise<TeamInviteWithExtras[]> {
  const { data, error } = await supabase
    .from("team_invites")
    .select(`
      *,
      team:teams(id, name),
      inviter:profiles!team_invites_invited_by_fkey(id, username, display_name)
    `)
    .eq("invited_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TeamInviteWithExtras[];
}

export async function listPendingInvitesForTeam(teamId: string): Promise<TeamInviteWithExtras[]> {
  const { data, error } = await supabase
    .from("team_invites")
    .select(`
      *,
      invited_user:profiles!team_invites_invited_user_id_fkey(id, username, display_name)
    `)
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TeamInviteWithExtras[];
}

export async function getPendingInviteForUserAndTeam(userId: string, teamId: string): Promise<TeamInviteWithExtras | null> {
  const { data, error } = await supabase
    .from("team_invites")
    .select(`
      *,
      team:teams(id, name),
      inviter:profiles!team_invites_invited_by_fkey(id, username, display_name)
    `)
    .eq("invited_user_id", userId)
    .eq("team_id", teamId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) return null;
  return data as TeamInviteWithExtras;
}

export async function getOpenTeamChallengesForUser(userId: string, limit = 10): Promise<TeamChallengeRow[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("id, title, game_type, status, creator_team_id, opponent_team_id, league_id, winner_team_id, entry_fee_cents, win_reward_cents, created_at, expires_at")
    .eq("created_by", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit * 2); // fetch extra, filter below

  if (error) throw error;

  const rows = (data ?? []) as TeamChallengeRow[];
  return rows
    .filter((r) => r.creator_team_id != null || r.opponent_team_id != null)
    .slice(0, limit);
}
