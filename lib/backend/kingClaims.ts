// lib/backend/kingClaims.ts — Apply to be recognized as King for an area / category (pending review)
import { supabase } from "./supabaseClient";

export type ClaimScope = "court" | "city";
export type AreaKind = "gym" | "park" | "trail" | "track" | "range" | "driving_range" | "other";
export type KingClaimStatus = "pending" | "approved" | "rejected";

export type KingClaimApplicationRow = {
  id: string;
  user_id: string;
  claim_subject?: "user" | "team";
  team_id?: string | null;
  claim_scope: ClaimScope;
  court_id: string | null;
  city_name: string | null;
  area_kind: AreaKind;
  record_type_slug: string | null;
  claim_title: string;
  claim_details: string | null;
  source_challenge_id: string | null;
  is_online_game: boolean;
  proof_media_paths: string[];
  anchor_lat: number;
  anchor_lng: number;
  claimed_score_value: number | null;
  status: KingClaimStatus;
  created_at: string;
  updated_at: string;
};

export type ChallengeWinRow = {
  id: string;
  title: string | null;
  game_type: string | null;
  completed_at: string | null;
};

export async function fetchRecentChallengeWins(userId: string, limit = 30): Promise<ChallengeWinRow[]> {
  const { data, error } = await supabase
    .from("challenges")
    .select("id, title, game_type, completed_at")
    .eq("status", "completed")
    .eq("winner_user_id", userId)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    title: r.title ?? null,
    game_type: r.game_type ?? null,
    completed_at: r.completed_at ?? null,
  }));
}

export async function submitKingClaimApplication(params: {
  userId: string;
  /** User (default) or team — team uses separate King scopes (court_team / city_team). */
  claimSubject?: "user" | "team";
  teamId?: string | null;
  claimScope: ClaimScope;
  courtId: string | null;
  cityName: string | null;
  areaKind: AreaKind;
  recordTypeSlug: string | null;
  claimTitle: string;
  claimDetails: string | null;
  sourceChallengeId: string | null;
  isOnlineGame: boolean;
  proofMediaPaths: string[];
  anchorLat: number;
  anchorLng: number;
  /** Used for leaderboard ordering when claim is approved (bench volume, yards, etc.) */
  claimedScoreValue?: number | null;
}): Promise<string> {
  const {
    userId,
    claimSubject = "user",
    teamId = null,
    claimScope,
    courtId,
    cityName,
    areaKind,
    recordTypeSlug,
    claimTitle,
    claimDetails,
    sourceChallengeId,
    isOnlineGame,
    proofMediaPaths,
    anchorLat,
    anchorLng,
    claimedScoreValue,
  } = params;

  const title = claimTitle.trim();
  if (title.length < 3) throw new Error("Enter a clear title for what you are claiming.");

  if (claimScope === "court" && !courtId) throw new Error("Select a court for this claim.");
  if (claimScope === "city" && !(cityName?.trim())) throw new Error("Enter a city for a city-wide claim.");
  if (claimSubject === "team" && !teamId) throw new Error("Select a team for a team claim.");

  if (!isOnlineGame && proofMediaPaths.length === 0) {
    throw new Error("Add photo or video proof of your result, or mark this as an online / in-app game.");
  }

  const { data, error } = await supabase
    .from("king_claim_applications")
    .insert({
      user_id: userId,
      claim_subject: claimSubject,
      team_id: claimSubject === "team" ? teamId : null,
      claim_scope: claimScope,
      court_id: claimScope === "court" ? courtId : null,
      city_name: claimScope === "city" ? cityName?.trim() ?? null : null,
      area_kind: areaKind,
      record_type_slug: recordTypeSlug,
      claim_title: title,
      claim_details: claimDetails?.trim() || null,
      source_challenge_id: sourceChallengeId,
      is_online_game: isOnlineGame,
      proof_media_paths: proofMediaPaths,
      anchor_lat: anchorLat,
      anchor_lng: anchorLng,
      claimed_score_value: claimedScoreValue ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return String((data as any).id);
}

export async function fetchMyKingClaims(userId: string): Promise<KingClaimApplicationRow[]> {
  const { data, error } = await supabase
    .from("king_claim_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    ...r,
    proof_media_paths: Array.isArray(r.proof_media_paths) ? r.proof_media_paths : [],
  })) as KingClaimApplicationRow[];
}
