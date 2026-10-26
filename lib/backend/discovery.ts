// lib/backend/discovery.ts — player & crew discovery for Pulse
import { supabase } from "./supabaseClient";
import { fetchNearbyCourts } from "./courts";
import { listRecentTeams } from "./teams";
import { getRankLabel } from "../utils/eloRating";

export type DiscoveryPlayer = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  subtitle: string;
};

export type DiscoveryCrew = {
  id: string;
  name: string;
  slug: string | null;
  avatar_url: string | null;
  member_count: number;
  subtitle: string;
  crown_count?: number;
};

export type DiscoveryCrown = {
  id: string;
  title: string;
  holderName: string;
  holderAvatarUrl: string | null;
  isTeam: boolean;
  subjectId: string;
};

function displayName(p: { display_name?: string | null; username?: string | null }) {
  return p.display_name || p.username || "Player";
}

function milesFromKm(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.15) return "nearby";
  return `${mi.toFixed(1)} mi away`;
}

function profileToDiscovery(
  p: Record<string, unknown>,
  subtitle: string
): DiscoveryPlayer {
  return {
    id: p.id as string,
    username: (p.username as string) ?? null,
    display_name: (p.display_name as string) ?? null,
    avatar_url: (p.avatar_url as string) ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    subtitle,
  };
}

export async function discoverNewPlayers(
  excludeUserId?: string | null,
  limit = 12
): Promise<DiscoveryPlayer[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, rating, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit + 5);

  if (error) return [];
  return (data ?? [])
    .filter((p) => p.id !== excludeUserId)
    .slice(0, limit)
    .map((p) => profileToDiscovery(p, "Joined this week"));
}

export async function discoverSimilarRating(
  viewerRating: number,
  excludeUserId?: string | null,
  limit = 12
): Promise<DiscoveryPlayer[]> {
  const lo = Math.max(100, viewerRating - 120);
  const hi = Math.min(3000, viewerRating + 120);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, rating")
    .gte("rating", lo)
    .lte("rating", hi)
    .neq("id", excludeUserId ?? "")
    .order("rating", { ascending: false })
    .limit(limit + 8);

  if (error) return [];
  return (data ?? [])
    .filter((p) => p.id !== excludeUserId)
    .slice(0, limit)
    .map((p) => {
      const r = typeof p.rating === "number" ? p.rating : 1000;
      return profileToDiscovery(p, `${getRankLabel(r)} · similar skill`);
    });
}

export async function discoverCrownHolders(
  excludeUserId?: string | null,
  limit = 12
): Promise<DiscoveryPlayer[]> {
  const { data: slots, error } = await supabase
    .from("king_badge_slots")
    .select("badge_holder_user_id, badge_title_snapshot, updated_at")
    .not("badge_holder_user_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit + 10);

  if (error || !slots?.length) return [];

  const userIds = [...new Set(slots.map((s) => s.badge_holder_user_id).filter(Boolean))] as string[];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, rating")
    .in("id", userIds);

  const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
  const titleByUser = new Map<string, string>();
  for (const s of slots) {
    const uid = s.badge_holder_user_id as string;
    if (!titleByUser.has(uid) && s.badge_title_snapshot) {
      titleByUser.set(uid, s.badge_title_snapshot as string);
    }
  }

  return userIds
    .filter((id) => id !== excludeUserId)
    .slice(0, limit)
    .map((id) => {
      const p = pm.get(id);
      if (!p) return null;
      const crown = titleByUser.get(id);
      return profileToDiscovery(p, crown ? `👑 ${crown}` : "Crown holder");
    })
    .filter(Boolean) as DiscoveryPlayer[];
}

export async function discoverNearbyCompetitors(
  lat: number,
  lng: number,
  excludeUserId?: string | null,
  limit = 12
): Promise<DiscoveryPlayer[]> {
  try {
    const courts = await fetchNearbyCourts(lat, lng, 35);
    if (!courts.length) return [];

    const courtDist = new Map(courts.map((c) => [c.id, c.distance_km]));
    const courtIds = courts.slice(0, 25).map((c) => c.id);

    const { data: attempts, error } = await supabase
      .from("court_attempts")
      .select("user_id, court_id, created_at")
      .in("court_id", courtIds)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error || !attempts?.length) return [];

    const userDist = new Map<string, number>();
    for (const a of attempts) {
      const uid = a.user_id as string;
      if (!uid || uid === excludeUserId) continue;
      const d = courtDist.get(a.court_id as string);
      if (d == null) continue;
      const prev = userDist.get(uid);
      if (prev == null || d < prev) userDist.set(uid, d);
    }

    const sortedIds = [...userDist.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (!sortedIds.length) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, rating")
      .in("id", sortedIds);

    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    return sortedIds
      .map((id) => {
        const p = pm.get(id);
        if (!p) return null;
        const km = userDist.get(id) ?? 0;
        const r = typeof p.rating === "number" ? p.rating : 1000;
        return profileToDiscovery(p, `${milesFromKm(km)} · ${getRankLabel(r)}`);
      })
      .filter(Boolean) as DiscoveryPlayer[];
  } catch {
    return [];
  }
}

export async function discoverNearbyCrews(
  lat: number,
  lng: number,
  limit = 12
): Promise<DiscoveryCrew[]> {
  try {
    const courts = await fetchNearbyCourts(lat, lng, 35);
    if (!courts.length) return [];

    const courtIds = courts.slice(0, 25).map((c) => c.id);
    const { data: attempts, error } = await supabase
      .from("court_attempts")
      .select("user_id")
      .in("court_id", courtIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !attempts?.length) return [];

    const userIds = [...new Set(attempts.map((a) => a.user_id).filter(Boolean))] as string[];
    if (!userIds.length) return [];

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, user_id")
      .in("user_id", userIds);

    const teamIds = [...new Set((memberships ?? []).map((m) => m.team_id).filter(Boolean))] as string[];
    if (!teamIds.length) return [];

    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, slug, avatar_url")
      .in("id", teamIds.slice(0, limit + 5));

    const withCounts = await Promise.all(
      (teams ?? []).slice(0, limit).map(async (t) => {
        const { count } = await supabase
          .from("team_members")
          .select("id", { count: "exact", head: true })
          .eq("team_id", t.id);
        return {
          id: t.id,
          name: t.name ?? "Crew",
          slug: t.slug ?? null,
          avatar_url: t.avatar_url ?? null,
          member_count: count ?? 0,
          subtitle: "Active near you",
        };
      })
    );
    return withCounts;
  } catch {
    return [];
  }
}

export async function discoverTrendingCrews(limit = 12): Promise<DiscoveryCrew[]> {
  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, slug, avatar_url, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !teams?.length) return [];

  const withCounts = await Promise.all(
    teams.map(async (t) => {
      const { count } = await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", t.id);
      return {
        id: t.id,
        name: t.name ?? "Crew",
        slug: t.slug ?? null,
        avatar_url: t.avatar_url ?? null,
        member_count: count ?? 0,
        subtitle: "Active recently",
      };
    })
  );
  return withCounts;
}

export async function discoverNewCrews(limit = 12): Promise<DiscoveryCrew[]> {
  const teams = await listRecentTeams(limit);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug ?? null,
    avatar_url: t.avatar_url ?? null,
    member_count: t.member_count ?? 0,
    subtitle: "New crew",
  }));
}

export async function discoverTopCrewCrowns(limit = 12): Promise<DiscoveryCrew[]> {
  const { data: badges, error } = await supabase
    .from("team_king_badges")
    .select("team_id")
    .limit(200);

  if (error || !badges?.length) return [];

  const counts = new Map<string, number>();
  for (const b of badges) {
    const tid = b.team_id as string;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const ids = sorted.map(([id]) => id);
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, slug, avatar_url")
    .in("id", ids);

  const tm = new Map((teams ?? []).map((t) => [t.id, t]));
  const countMap = new Map(sorted);

  const withMembers = await Promise.all(
    ids.map(async (id) => {
      const t = tm.get(id);
      if (!t) return null;
      const { count } = await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", id);
      const crowns = countMap.get(id) ?? 0;
      return {
        id: t.id,
        name: t.name ?? "Crew",
        slug: t.slug ?? null,
        avatar_url: t.avatar_url ?? null,
        member_count: count ?? 0,
        crown_count: crowns,
        subtitle: `${crowns} crown${crowns === 1 ? "" : "s"}`,
      };
    })
  );

  return withMembers.filter(Boolean) as DiscoveryCrew[];
}

export async function discoverPulseCrowns(limit = 20): Promise<DiscoveryCrown[]> {
  const { data: slots, error } = await supabase
    .from("king_badge_slots")
    .select("badge_holder_user_id, badge_holder_team_id, badge_title_snapshot, updated_at")
    .or("badge_holder_user_id.not.is.null,badge_holder_team_id.not.is.null")
    .order("updated_at", { ascending: false })
    .limit(limit + 10);

  if (error || !slots?.length) return [];

  const userIds = slots.map((s) => s.badge_holder_user_id).filter(Boolean) as string[];
  const teamIds = slots.map((s) => s.badge_holder_team_id).filter(Boolean) as string[];

  const [profilesRes, teamsRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? supabase.from("teams").select("id, name, avatar_url").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const pm = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const tm = new Map((teamsRes.data ?? []).map((t) => [t.id, t]));

  const out: DiscoveryCrown[] = [];
  for (const s of slots) {
    const title = (s.badge_title_snapshot as string) || "Crown";
    if (s.badge_holder_team_id) {
      const t = tm.get(s.badge_holder_team_id as string);
      out.push({
        id: `team-${s.badge_holder_team_id}-${title}`,
        title,
        holderName: t?.name ?? "Crew",
        holderAvatarUrl: t?.avatar_url ?? null,
        isTeam: true,
        subjectId: s.badge_holder_team_id as string,
      });
    } else if (s.badge_holder_user_id) {
      const p = pm.get(s.badge_holder_user_id as string);
      out.push({
        id: `user-${s.badge_holder_user_id}-${title}`,
        title,
        holderName: p ? displayName(p) : "Player",
        holderAvatarUrl: p?.avatar_url ?? null,
        isTeam: false,
        subjectId: s.badge_holder_user_id as string,
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}
