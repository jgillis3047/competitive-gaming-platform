// lib/backend/challenges.ts
import type { Challenge, ChallengeStatus } from "../data/challengeStore";
import { computeEarnedBadges } from "../data/badgeDefinitions";
import { supabase } from "./supabaseClient";

function isTransientChallengesFetchError(error: any) {
  const msg = String(
    error?.message ?? error?.error_description ?? error?.details ?? ""
  ).toLowerCase();
  return (
    msg.includes("error code: 521") ||
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch failed") ||
    msg.includes("enotfound")
  );
}

/**
 * Maps DB rows -> your app Challenge type.
 * IMPORTANT:
 * - Do NOT use status "active" (it breaks your DB constraint).
 * - Use "accepted" and/or "in-progress" for playable states.
 */
function mapRowToChallenge(row: any, playerCount: number): Challenge {
  const maxPlayers = 2;

  const entryFeeCents: number = Number(row.entry_fee_cents ?? 0);
  const winRewardCents: number = Number(row.win_reward_cents ?? 0);
  const entryFeeText = entryFeeCents > 0 ? `$${(entryFeeCents / 100).toFixed(2)}` : "Free";

  const createdByText =
    typeof row.created_by_username === "string" && row.created_by_username.length > 0
      ? row.created_by_username
      : row.created_by
        ? String(row.created_by)
        : "@you";

  // Ensure we never pass an illegal status through
  const rawStatus = String(row.status ?? "open");
  const safeStatus: ChallengeStatus =
    ([
      "open",
      "accepted",
      "in-progress",
      "checked-in",
      "completed",
      "disputed",
      "cancelled",
    ] as const).includes(rawStatus as any)
      ? (rawStatus as ChallengeStatus)
      : "open";

    const message =
    typeof row.message === "string" && row.message.trim().length
      ? row.message.trim()
      : undefined;


return {
  id: String(row.id),
  title: row.title ?? "Challenge",
  gameType: row.game_type ?? "Math Race",
  status: safeStatus,

  // UI convenience
  createdBy: createdByText,
  players: `${playerCount} / ${maxPlayers} players`,
  entryFee: entryFeeText,

  // ✅ DB-ish fields (so the rest of your app can rely on them)
  kind: row.kind ?? null,
  created_by: row.created_by ?? null,
  ...(typeof row.created_by_username === "string" && row.created_by_username.length
    ? ({ created_by_username: row.created_by_username } as any)
    : null),
  ...(typeof row.created_by_handle === "string" && row.created_by_handle.length
    ? ({ created_by_handle: row.created_by_handle } as any)
    : null),
  entry_fee_cents: entryFeeCents,
  win_reward_cents: winRewardCents,
  winner_user_id: row.winner_user_id ?? null,
  completed_at: row.completed_at ?? null,

  // ✅ invite-only
  invite_only: Boolean(row.invite_only),
  invited_user_id: row.invited_user_id ?? null,
    // ✅ locked opponent (used by join logic & UI guards)
  opponent_user_id: row.opponent_user_id ?? null,
  show_competitor_names_public:
    typeof row.show_competitor_names_public === "boolean"
      ? row.show_competitor_names_public
      : true,


  // ✅ message (keep your existing behavior)
  ...(message ? ({ message } as any) : null),

  // For feed merge (chronological order)
  created_at: row.created_at ?? null,
} as any;

}

/**
 * Create a challenge row + add creator into challenge_players.
 * NOTE: Wallet charging should happen outside this function (builder/service).
 */
export async function createChallengeWithOptions(params: {
  userId: string;
  title: string;
  gameType: string;
  entryFeeCents: number;
  winRewardCents: number;
}): Promise<Challenge> {
  const { userId, title, gameType, entryFeeCents, winRewardCents } = params;

  const { data: challengeRow, error: insertErr } = await supabase
    .from("challenges")
    .insert([
      {
        title,
        game_type: gameType,
        status: "open", // ✅ allowed
        entry_fee_cents: entryFeeCents,
        win_reward_cents: winRewardCents,
        created_by: userId,
      },
    ])
    .select("*")
    .single();

  if (insertErr || !challengeRow) {
    console.error("[createChallengeWithOptions] insertErr:", insertErr);
    throw new Error(insertErr?.message ?? "Failed to create challenge.");
  }

  const challengeId = String(challengeRow.id);

  // Insert creator as a player
  const { error: playerErr } = await supabase.from("challenge_players").insert([
    {
      challenge_id: challengeId,
      user_id: userId,
      role: "creator",
    },
  ]);

  if (playerErr) {
    console.error("[createChallengeWithOptions] playerErr:", playerErr);
    throw new Error(playerErr.message);
  }

  return mapRowToChallenge(challengeRow, 1);
}

/**
 * Accept challenge:
 * - adds opponent to challenge_players
 * - flips challenge status to "accepted" (NOT "active")
 */
export async function acceptChallengeOnServer(params: {
  challengeId: string;
  userId: string;
}): Promise<Challenge> {
  const { challengeId, userId } = params;

  // Add opponent row
  const { error: playerErr } = await supabase.from("challenge_players").insert([
    {
      challenge_id: challengeId,
      user_id: userId,
      role: "opponent",
    },
  ]);

  if (playerErr) {
    console.error("[acceptChallengeOnServer] playerErr:", playerErr);
    throw new Error(playerErr.message);
  }

  // Flip to accepted (✅ do NOT use "active")
  const { data: updatedRow, error: updateErr } = await supabase
    .from("challenges")
    .update({ status: "accepted" })
    .eq("id", challengeId)
    .select("*")
    .single();

  if (updateErr || !updatedRow) {
    console.error("[acceptChallengeOnServer] updateErr:", updateErr);
    throw new Error(updateErr?.message ?? "Failed to accept challenge.");
  }

  // Count players for UI
  const { data: players, error: playersErr } = await supabase
    .from("challenge_players")
    .select("challenge_id")
    .eq("challenge_id", challengeId);

  if (playersErr) {
    console.error("[acceptChallengeOnServer] playersErr:", playersErr);
    throw new Error(playersErr.message);
  }

  const playerCount = players?.length ?? 1;
  return mapRowToChallenge(updatedRow, playerCount);
}

/**
 * Feed list
 */
export async function fetchRecentChallenges(): Promise<Challenge[]> {
  const [createdRes, completedRes] = await Promise.all([
    supabase.from("challenges").select("*").order("created_at", { ascending: false }).limit(50),
    supabase
      .from("challenges")
      .select("*")
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(30),
  ]);

  const error = createdRes.error ?? completedRes.error;
  if (error) {
    console.error("[fetchRecentChallenges] error:", error);
    if (isTransientChallengesFetchError(error)) {
      console.warn("[fetchRecentChallenges] transient upstream/network issue, returning empty list.");
      return [];
    }
    throw new Error(error.message);
  }

  const mergedById = new Map<string, any>();
  for (const row of [...(createdRes.data ?? []), ...(completedRes.data ?? [])]) {
    mergedById.set(String(row.id), row);
  }
  const challengeRows = [...mergedById.values()];
  if (!challengeRows.length) return [];

  const creatorIds = [
    ...new Set(
      (challengeRows as any[]).map((r) => r.created_by).filter((id: any) => id != null && String(id).length > 0)
    ),
  ] as string[];

  let profileById: Record<string, { username: string | null; display_name: string | null; rating?: number }> = {};
  if (creatorIds.length) {
    const { data: profRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, rating")
      .in("id", creatorIds);
    for (const p of profRows ?? []) {
      const id = String((p as any).id);
      profileById[id] = {
        username: (p as any).username ?? null,
        display_name: (p as any).display_name ?? null,
        rating: typeof (p as any).rating === "number" ? (p as any).rating : 1000,
      };
    }
  }

  const ids = challengeRows.map((r: any) => r.id);

  const { data: playersRows, error: playersErr } = await supabase
    .from("challenge_players")
    .select("challenge_id, user_id, role, score")
    .in("challenge_id", ids);

  if (playersErr) {
    console.error("[fetchRecentChallenges] playersErr:", playersErr);
    throw new Error(playersErr.message);
  }

  const counts: Record<string, number> = {};
  const playersByChallenge: Record<
    string,
    { user_id: string; role: string; score: number | null }[]
  > = {};
  for (const r of playersRows ?? []) {
    const cid = String(r.challenge_id);
    counts[cid] = (counts[cid] ?? 0) + 1;
    if (!playersByChallenge[cid]) playersByChallenge[cid] = [];
    playersByChallenge[cid].push({
      user_id: String(r.user_id),
      role: String(r.role ?? ""),
      score: r.score != null ? Number(r.score) : null,
    });
  }

  const profileIds = new Set<string>(creatorIds);
  for (const row of challengeRows as any[]) {
    if (row.winner_user_id) profileIds.add(String(row.winner_user_id));
    if (row.opponent_user_id) profileIds.add(String(row.opponent_user_id));
    for (const p of playersByChallenge[String(row.id)] ?? []) {
      profileIds.add(p.user_id);
    }
  }

  if (profileIds.size > creatorIds.length) {
    const { data: extraProfRows } = await supabase
      .from("profiles")
      .select("id, username, display_name, rating")
      .in("id", [...profileIds]);
    for (const p of extraProfRows ?? []) {
      const id = String((p as any).id);
      profileById[id] = {
        username: (p as any).username ?? null,
        display_name: (p as any).display_name ?? null,
        rating: typeof (p as any).rating === "number" ? (p as any).rating : 1000,
      };
    }
  } else if (creatorIds.length) {
    const { data: profRowsWithRating } = await supabase
      .from("profiles")
      .select("id, username, display_name, rating")
      .in("id", creatorIds);
    for (const p of profRowsWithRating ?? []) {
      const id = String((p as any).id);
      profileById[id] = {
        ...profileById[id],
        rating: typeof (p as any).rating === "number" ? (p as any).rating : 1000,
      };
    }
  }

  function displayForUserId(userId: string | null | undefined): string | null {
    if (!userId) return null;
    const prof = profileById[String(userId)];
    return prof?.display_name?.trim() || prof?.username?.trim() || null;
  }

  return challengeRows.map((row: any) => {
    const cid = row.created_by ? String(row.created_by) : "";
    const prof = cid ? profileById[cid] : null;
    const display =
      prof?.display_name?.trim() ||
      prof?.username?.trim() ||
      null;
    const rowWithCreator = display
      ? { ...row, created_by_username: display, created_by_handle: prof?.username?.trim() ?? null }
      : row;
    const challenge = mapRowToChallenge(rowWithCreator, counts[String(row.id)] ?? 0) as any;
    const players = playersByChallenge[String(row.id)] ?? [];
    const winnerId = row.winner_user_id ? String(row.winner_user_id) : null;
    const loserPlayer = winnerId
      ? players.find((p) => p.user_id !== winnerId)
      : players.length >= 2
        ? players[1]
        : null;
    const winnerPlayer = winnerId ? players.find((p) => p.user_id === winnerId) : null;
    const creatorPlayer = players.find((p) => p.role === "creator");
    const opponentPlayer = players.find((p) => p.role === "opponent");

    challenge._feedPlayers = players.map((p) => ({
      userId: p.user_id,
      role: p.role,
      score: p.score,
      displayName: displayForUserId(p.user_id) ?? "Player",
    }));
    challenge.winner_display_name = displayForUserId(winnerId);
    challenge.loser_user_id = loserPlayer?.user_id ?? null;
    challenge.loser_display_name = displayForUserId(loserPlayer?.user_id);
    challenge.creator_display_name =
      displayForUserId(creatorPlayer?.user_id ?? row.created_by) ?? display;
    challenge.opponent_display_name = displayForUserId(
      opponentPlayer?.user_id ?? row.opponent_user_id
    );
    if (creatorPlayer?.score != null) challenge.creator_score = creatorPlayer.score;
    if (opponentPlayer?.score != null) challenge.opponent_score = opponentPlayer.score;
    if (winnerPlayer?.score != null) challenge.winner_score = winnerPlayer.score;
    challenge.winner_rating_delta = row.winner_rating_delta ?? null;
    challenge.loser_rating_delta = row.loser_rating_delta ?? null;
    if (winnerId) {
      challenge.winner_rating = profileById[winnerId]?.rating ?? 1000;
    }
    if (loserPlayer?.user_id) {
      challenge.loser_rating = profileById[loserPlayer.user_id]?.rating ?? 1000;
    }

    return challenge;
  });
}



export async function syncChallengeResultToSupabase(challenge: Challenge) {
  const { id, status, winner_user_id, completed_at } = challenge;
  if (!id) return;

  const { error } = await supabase
    .from("challenges")
    .update({
      status,
      winner_user_id: winner_user_id ?? null,
      completed_at: status === "completed" ? (completed_at ?? new Date().toISOString()) : null,
    })
    .eq("id", id);

  if (error) {
    console.error("[syncChallengeResultToSupabase] error:", error);
    throw error;
  }
}

/**
 * Search challenges by query (title, game_type, etc.). Returns Challenge[].
 */
export async function searchChallenges(query: string, limit = 10): Promise<Challenge[]> {
  const q = (query ?? "").trim();
  if (!q) return [];
  const { data: rows, error } = await supabase
    .from("challenges")
    .select("*")
    .or(`title.ilike.%${q}%,game_type.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  if (!rows?.length) return [];
  const ids = rows.map((r: any) => r.id);
  const { data: playersRows } = await supabase.from("challenge_players").select("challenge_id").in("challenge_id", ids);
  const counts: Record<string, number> = {};
  for (const r of playersRows ?? []) {
    const cid = String(r.challenge_id);
    counts[cid] = (counts[cid] ?? 0) + 1;
  }
  return rows.map((row: any) => mapRowToChallenge(row, counts[String(row.id)] ?? 0));
}

export type ChallengesForUserStats = {
  challenges: Challenge[];
  record: { wins: number; losses: number; ties: number; totalPlayed: number; winRate: number; streak: number };
  perGameStats: { game: string; wins: number; losses: number; ties: number }[];
  computedBadges: { key: string; label: string }[];
};

/**
 * Fetch challenges for a user (where they are a player) and compute record, per-game stats, badges.
 */
export async function fetchChallengesForUserWithStats(userId: string): Promise<ChallengesForUserStats> {
  const { data: playerRows, error: playerErr } = await supabase
    .from("challenge_players")
    .select("challenge_id")
    .eq("user_id", userId);
  if (playerErr || !playerRows?.length) {
    return {
      challenges: [],
      record: { wins: 0, losses: 0, ties: 0, totalPlayed: 0, winRate: 0, streak: 0 },
      perGameStats: [],
      computedBadges: [],
    };
  }
  const challengeIds = playerRows.map((r: any) => r.challenge_id);
  const { data: challengeRows, error } = await supabase
    .from("challenges")
    .select("*")
    .in("id", challengeIds)
    .order("created_at", { ascending: false });
  if (error || !challengeRows?.length) {
    return {
      challenges: [],
      record: { wins: 0, losses: 0, ties: 0, totalPlayed: 0, winRate: 0, streak: 0 },
      perGameStats: [],
      computedBadges: [],
    };
  }
  const { data: playersCountRows } = await supabase
    .from("challenge_players")
    .select("challenge_id")
    .in("challenge_id", challengeIds);
  const counts: Record<string, number> = {};
  for (const r of playersCountRows ?? []) {
    const cid = String((r as any).challenge_id);
    counts[cid] = (counts[cid] ?? 0) + 1;
  }
  const challenges = challengeRows.map((row: any) => mapRowToChallenge(row, counts[String(row.id)] ?? 0));
  const completed = challenges.filter((c) => c.status === "completed");
  let wins = 0, losses = 0, ties = 0;
  const perGame: Record<string, { wins: number; losses: number; ties: number }> = {};
  for (const c of completed) {
    const wid = c.winner_user_id ?? null;
    if (!wid) ties += 1;
    else if (wid === userId) wins += 1;
    else losses += 1;
    const gt = c.gameType ?? "Other";
    if (!perGame[gt]) perGame[gt] = { wins: 0, losses: 0, ties: 0 };
    if (!wid) perGame[gt].ties += 1;
    else if (wid === userId) perGame[gt].wins += 1;
    else perGame[gt].losses += 1;
  }
  const totalPlayed = completed.length;
  const winRate = totalPlayed > 0 ? Math.round((wins / totalPlayed) * 100) : 0;
  let streak = 0;
  for (const c of completed) {
    if (c.winner_user_id === userId) streak += 1;
    else break;
  }
  const computedBadges = computeEarnedBadges({
    wins,
    totalPlayed,
    winRate,
    streak,
    maxStreak: streak,
  }).map((b) => ({ key: b.key, label: b.label }));
  return {
    challenges,
    record: { wins, losses, ties, totalPlayed, winRate, streak },
    perGameStats: Object.entries(perGame).map(([game, s]) => ({
      game,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
    })),
    computedBadges,
  };
}

