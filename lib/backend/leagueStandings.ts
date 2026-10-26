// League standings from completed challenges (separate from King / spot leaderboards).
import { supabase } from "./supabaseClient";

export type TeamStanding = {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
};

export type PlayerStanding = {
  userId: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
};

type ChallengeRow = {
  id: string;
  winner_user_id: string | null;
  winner_team_id: string | null;
  creator_team_id: string | null;
  opponent_team_id: string | null;
};

function isTeamMatch(c: ChallengeRow): boolean {
  return !!(c.creator_team_id && c.opponent_team_id);
}

/** Aggregate W/L/T for teams and individuals from completed league challenges. */
export async function loadLeagueStandings(leagueId: string): Promise<{
  teams: TeamStanding[];
  players: PlayerStanding[];
}> {
  const { data: challenges, error } = await supabase
    .from("challenges")
    .select("id, winner_user_id, winner_team_id, creator_team_id, opponent_team_id")
    .eq("league_id", leagueId)
    .eq("status", "completed");

  if (error) throw new Error(error.message);

  const ch = (challenges ?? []) as ChallengeRow[];
  const ids = ch.map((c) => c.id);
  const { data: playerRows } =
    ids.length > 0
      ? await supabase.from("challenge_players").select("challenge_id, user_id").in("challenge_id", ids)
      : { data: [] as { challenge_id: string; user_id: string }[] };

  const byChallenge = new Map<string, string[]>();
  for (const p of playerRows ?? []) {
    const list = byChallenge.get(p.challenge_id) ?? [];
    list.push(p.user_id);
    byChallenge.set(p.challenge_id, list);
  }

  const teamStats = new Map<string, { w: number; l: number; t: number }>();
  const playerStats = new Map<string, { w: number; l: number; t: number }>();

  const bumpTeam = (id: string, outcome: "w" | "l" | "t") => {
    const cur = teamStats.get(id) ?? { w: 0, l: 0, t: 0 };
    if (outcome === "w") cur.w += 1;
    else if (outcome === "l") cur.l += 1;
    else cur.t += 1;
    teamStats.set(id, cur);
  };

  const bumpPlayer = (id: string, outcome: "w" | "l" | "t") => {
    const cur = playerStats.get(id) ?? { w: 0, l: 0, t: 0 };
    if (outcome === "w") cur.w += 1;
    else if (outcome === "l") cur.l += 1;
    else cur.t += 1;
    playerStats.set(id, cur);
  };

  for (const c of ch) {
    if (isTeamMatch(c)) {
      const a = c.creator_team_id!;
      const b = c.opponent_team_id!;
      const w = c.winner_team_id;
      if (!w) {
        bumpTeam(a, "t");
        bumpTeam(b, "t");
      } else if (w === a) {
        bumpTeam(a, "w");
        bumpTeam(b, "l");
      } else if (w === b) {
        bumpTeam(b, "w");
        bumpTeam(a, "l");
      }
      continue;
    }

    const players = byChallenge.get(c.id) ?? [];
    const uniq = [...new Set(players)];
    if (uniq.length < 2) continue;

    if (!c.winner_user_id) {
      for (const u of uniq) bumpPlayer(u, "t");
      continue;
    }

    const winner = c.winner_user_id;
    for (const u of uniq) {
      bumpPlayer(u, u === winner ? "w" : "l");
    }
  }

  const teamIds = [...teamStats.keys()];
  const userIds = [...playerStats.keys()];

  const teamNames = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
    for (const t of teams ?? []) teamNames.set(t.id, t.name ?? "Team");
  }

  const profileNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", userIds);
    for (const p of profs ?? []) {
      profileNames.set(p.id, p.display_name || p.username || `Player`);
    }
  }

  const teams: TeamStanding[] = teamIds
    .map((teamId) => {
      const s = teamStats.get(teamId)!;
      return {
        teamId,
        name: teamNames.get(teamId) ?? "Team",
        wins: s.w,
        losses: s.l,
        ties: s.t,
      };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  const players: PlayerStanding[] = userIds
    .map((userId) => {
      const s = playerStats.get(userId)!;
      return {
        userId,
        name: profileNames.get(userId) ?? "Player",
        wins: s.w,
        losses: s.l,
        ties: s.t,
      };
    })
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  return { teams, players };
}
