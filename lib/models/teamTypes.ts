export type TeamMemberRole = "owner" | "admin" | "member";

export type TeamRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  joined_at: string;
};

export type LeagueKind = "1v1" | "team" | "both";

export type LeagueRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  kind: LeagueKind;
  created_at: string;
  updated_at: string;
};

export type LeagueMemberRow = {
  id: string;
  league_id: string;
  user_id: string;
  joined_at: string;
};

export type LeagueTeamRow = {
  id: string;
  league_id: string;
  team_id: string;
  joined_at: string;
};

export type ProfileMini = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

export type TeamWithExtras = TeamRow & {
  creator?: ProfileMini | null;
  member_count?: number;
  my_role?: TeamMemberRole | null;
};

export type LeagueWithExtras = LeagueRow & {
  creator?: ProfileMini | null;
  member_count?: number;
  team_count?: number;
  my_member?: boolean;
};
