// lib/backend/courts.ts — King of the Court: GPS courts + async record leaderboards
import { supabase } from "./supabaseClient";
import {
  listSpotCategoriesForCourt,
  listSpotCategoriesForPlace,
  SPOTS_CATEGORIES,
  type PlaceKind as TaxonomyPlaceKind,
} from "../data/leaderboardTaxonomy";

export type CourtRecordTypeRow = {
  slug: string;
  title: string;
  description: string | null;
  higher_is_better: boolean;
  unit_label: string;
  team_allowed?: boolean;
  verification_type?: "gps_upload" | "upload_only" | "match_result" | "wearable_sync";
  proof_rules?: string | null;
};

export type CourtVerificationStatus = "pending" | "approved" | "rejected";

export type CourtRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  checkin_radius_m: number;
  city: string | null;
  /** Optional region for browse filters (e.g. NV, CA). */
  state: string | null;
  place_kind: string;
  created_by: string | null;
  created_at: string;
  verification_status?: CourtVerificationStatus;
  photo_paths?: string[];
  game_category_slug?: string | null;
  /** Sports actually available here; null = infer from place_kind / description. */
  sport_keys?: string[] | null;
};

export type NearbyCourtRow = CourtRow & { distance_km: number };

export type ClaimLocationMatch = {
  id: string;
  name: string;
  slug: string;
  distance_m: number;
  verification_status: CourtVerificationStatus | null;
};

/** Raised when insert hits the duplicate-court trigger (court_already_exists:id:name). */
export class CourtAlreadyExistsError extends Error {
  courtId: string;
  courtName: string;

  constructor(courtId: string, courtName: string) {
    super(`An arena already exists here: ${courtName}`);
    this.name = "CourtAlreadyExistsError";
    this.courtId = courtId;
    this.courtName = courtName;
  }
}

export function parseCourtAlreadyExistsError(message: string): CourtAlreadyExistsError | null {
  const m = /court_already_exists:([^:]+):(.+)/i.exec(message);
  if (!m) return null;
  return new CourtAlreadyExistsError(m[1], m[2]);
}

export type CourtLeaderboardRow = {
  rank: number;
  user_id: string;
  best_score: number;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(r1) * Math.cos(r2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function isWithinCourtCheckIn(
  userLat: number,
  userLng: number,
  court: Pick<CourtRow, "lat" | "lng" | "checkin_radius_m">
): boolean {
  const d = haversineDistanceMeters(userLat, userLng, court.lat, court.lng);
  return d <= court.checkin_radius_m;
}

export async function fetchRecordTypes(): Promise<CourtRecordTypeRow[]> {
  const { data, error } = await supabase
    .from("court_record_types")
    .select("slug,title,description,higher_is_better,unit_label")
    .order("slug");
  if (error) throw new Error(error.message);

  // Merge DB record types with curated taxonomy metadata so clients can
  // consistently render challenge rules and team-eligible categories.
  const dbRows = (data ?? []) as CourtRecordTypeRow[];
  if (dbRows.length === 0) {
    return SPOTS_CATEGORIES.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.proofRules,
      higher_is_better: c.higherIsBetter,
      unit_label: c.scoreUnit,
      team_allowed: c.teamAllowed,
      verification_type: c.verificationType,
      proof_rules: c.proofRules,
    }));
  }

  return dbRows.map((row) => {
    const c = SPOTS_CATEGORIES.find((x) => x.slug === row.slug);
    return {
      ...row,
      team_allowed: c?.teamAllowed ?? false,
      verification_type: c?.verificationType ?? "gps_upload",
      proof_rules: c?.proofRules ?? row.description,
    };
  });
}

export function getSpotRecordTypesForPlaceKind(placeKind: string): CourtRecordTypeRow[] {
  return listSpotCategoriesForPlace(placeKind as TaxonomyPlaceKind).map((c) => ({
    slug: c.slug,
    title: c.title,
    description: c.proofRules,
    higher_is_better: c.higherIsBetter,
    unit_label: c.scoreUnit,
    team_allowed: c.teamAllowed,
    verification_type: c.verificationType,
    proof_rules: c.proofRules,
  }));
}

export function getSpotRecordTypesForCourt(
  court: Pick<CourtRow, "place_kind" | "sport_keys" | "game_category_slug" | "description">
): CourtRecordTypeRow[] {
  return listSpotCategoriesForCourt(court).map((c) => ({
    slug: c.slug,
    title: c.title,
    description: c.proofRules,
    higher_is_better: c.higherIsBetter,
    unit_label: c.scoreUnit,
    team_allowed: c.teamAllowed,
    verification_type: c.verificationType,
    proof_rules: c.proofRules,
  }));
}

export async function fetchNearbyCourts(
  lat: number,
  lng: number,
  radiusKm = 40
): Promise<NearbyCourtRow[]> {
  const { data, error } = await supabase.rpc("nearby_courts", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    ...row,
    distance_km: Number(row.distance_km),
  })) as NearbyCourtRow[];
}

/** Closest arena whose check-in bubble contains this GPS point (for claim dedup). */
export async function findCourtAtClaimLocation(
  lat: number,
  lng: number,
  minRadiusM = 150
): Promise<ClaimLocationMatch | null> {
  const { data, error } = await supabase.rpc("find_court_at_claim_location", {
    p_lat: lat,
    p_lng: lng,
    p_min_radius_m: minRadiusM,
  });
  if (error) throw new Error(error.message);
  const row = (data as any[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    distance_m: Number(row.distance_m),
    verification_status: (row.verification_status as CourtVerificationStatus) ?? null,
  };
}

export async function fetchCourtById(id: string): Promise<CourtRow | null> {
  const { data, error } = await supabase.from("courts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CourtRow) ?? null;
}

export type CourtProofClipRow = {
  id: string;
  user_id: string;
  record_type_slug: string;
  proof_social_url: string | null;
  proof_media_path: string | null;
  verification_level: string;
  created_at: string;
};

export async function fetchCourtProofClips(courtId: string, limit = 20): Promise<CourtProofClipRow[]> {
  const { data, error } = await supabase
    .from("court_attempts")
    .select("id, user_id, record_type_slug, proof_social_url, proof_media_path, verification_level, created_at")
    .eq("court_id", courtId)
    .or("proof_social_url.not.is.null,proof_media_path.not.is.null")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtProofClipRow[];
}

/** Browse courts for Leaderboards tab (city / state / place / name filters). */
export async function fetchCourtsForBrowse(params: {
  cityContains?: string;
  stateContains?: string;
  nameContains?: string;
  placeKind?: string | "all";
  limit?: number;
}): Promise<CourtRow[]> {
  const lim = Math.min(Math.max(params.limit ?? 60, 1), 100);
  let q = supabase
    .from("courts")
    .select("*")
    .or(`verification_status.eq.approved,verification_status.is.null`)
    .order("name", { ascending: true })
    .limit(lim);
  const city = params.cityContains?.trim();
  if (city) q = q.ilike("city", `%${city}%`);
  const st = params.stateContains?.trim();
  if (st) q = q.ilike("state", `%${st}%`);
  const name = params.nameContains?.trim();
  if (name) q = q.ilike("name", `%${name}%`);
  const pk = params.placeKind;
  if (pk && pk !== "all") q = q.eq("place_kind", pk);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtRow[];
}

/** Global search — arenas by name or city. */
export async function searchCourts(query: string, limit = 12): Promise<CourtRow[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const lim = Math.min(Math.max(limit, 1), 25);
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("courts")
    .select("*")
    .or(`verification_status.eq.approved,verification_status.is.null`)
    .or(`name.ilike.${pattern},city.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(lim);
  if (error) throw new Error(error.message);
  return (data ?? []) as CourtRow[];
}

export async function fetchCourtLeaderboard(
  courtId: string,
  recordSlug: string,
  limit = 10
): Promise<CourtLeaderboardRow[]> {
  const { data, error } = await supabase.rpc("court_leaderboard", {
    p_court_id: courtId,
    p_record_slug: recordSlug,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    rank: Number(row.rank),
    user_id: row.user_id,
    best_score: Number(row.best_score),
    username: row.username ?? null,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
  }));
}

export async function createCourt(params: {
  userId: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  city?: string | null;
  placeKind?: "park" | "gym" | "campus" | "range" | "other";
  description?: string | null;
  checkinRadiusM?: number;
  photoPaths?: string[];
  gameCategorySlug?: string | null;
  sportKeys?: string[] | null;
}): Promise<CourtRow> {
  const {
    userId,
    name,
    slug,
    lat,
    lng,
    city,
    placeKind = "other",
    description,
    checkinRadiusM = 150,
    photoPaths = [],
    gameCategorySlug = null,
    sportKeys = null,
  } = params;
  const { data, error } = await supabase
    .from("courts")
    .insert({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      lat,
      lng,
      city: city?.trim() || null,
      place_kind: placeKind,
      description: description?.trim() || null,
      checkin_radius_m: checkinRadiusM,
      created_by: userId,
      verification_status: "pending",
      photo_paths: photoPaths,
      game_category_slug: gameCategorySlug,
      sport_keys: sportKeys?.length ? sportKeys : null,
    })
    .select("*")
    .single();
  if (error) {
    const dup = parseCourtAlreadyExistsError(error.message);
    if (dup) throw dup;
    throw new Error(error.message);
  }
  return data as CourtRow;
}

export async function fetchCourtConfirmationCount(courtId: string): Promise<number> {
  const { count, error } = await supabase
    .from("court_verification_confirmations")
    .select("*", { count: "exact", head: true })
    .eq("court_id", courtId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function confirmCourtLegitimacy(
  courtId: string
): Promise<{ confirmationCount: number; verificationStatus: CourtVerificationStatus }> {
  const { data, error } = await supabase.rpc("confirm_court_legitimacy", {
    p_court_id: courtId,
  });
  if (error) throw new Error(error.message);
  const row = (data as { confirmation_count?: number; verification_status?: string }[] | null)?.[0];
  return {
    confirmationCount: Number(row?.confirmation_count ?? 0),
    verificationStatus: (row?.verification_status as CourtVerificationStatus) ?? "pending",
  };
}

export type CourtAttemptAiFields = {
  ai_verdict?: string | null;
  ai_confidence?: number | null;
  ai_summary?: string | null;
  ai_detected_score?: string | null;
  ai_flags?: string[];
};

export async function submitCourtAttempt(params: {
  userId: string;
  courtId: string;
  recordTypeSlug: string;
  scoreValue: number;
  checkinLat: number;
  checkinLng: number;
  proofMediaPath?: string | null;
  proofSocialUrl?: string | null;
  verificationLevel?: "basic" | "verified" | "featured" | "legendary";
  aiReview?: CourtAttemptAiFields | null;
}): Promise<void> {
  const hasSocial = !!(params.proofSocialUrl?.trim());
  const hasMedia = !!params.proofMediaPath;
  const level =
    params.verificationLevel ??
    (hasSocial || hasMedia ? "verified" : "basic");
  const { error } = await supabase.from("court_attempts").insert({
    court_id: params.courtId,
    user_id: params.userId,
    record_type_slug: params.recordTypeSlug,
    score_value: params.scoreValue,
    checkin_lat: params.checkinLat,
    checkin_lng: params.checkinLng,
    proof_media_path: params.proofMediaPath ?? null,
    proof_social_url: params.proofSocialUrl?.trim() || null,
    verification_level: level,
    ai_verdict: params.aiReview?.ai_verdict ?? null,
    ai_confidence: params.aiReview?.ai_confidence ?? null,
    ai_summary: params.aiReview?.ai_summary ?? null,
    ai_detected_score: params.aiReview?.ai_detected_score ?? null,
    ai_flags: params.aiReview?.ai_flags ?? [],
  });
  if (error) throw new Error(error.message);
}

/** Format stored score for UI (mile = seconds as float). */
export function formatCourtScore(score: number, slug: string): string {
  if (slug === "mile_run") return formatSecondsAsMmSs(score);
  if (slug === "three_pointers_60s") return `${Math.round(score)}`;
  if (slug === "carry_distance_yards") return `${Math.round(score)} yds`;
  return String(Math.round(score * 100) / 100);
}

export function formatSecondsAsMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.floor(seconds + 0.5);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Parse "MM:SS" or "M:SS" or total seconds string into seconds. */
export function parseMileTimeToSeconds(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const secOnly = /^(\d+(\.\d+)?)$/.exec(t);
  if (secOnly) return Number(secOnly[1]);
  const mmss = /^(\d+):(\d{1,2}(\.\d+)?)$/.exec(t);
  if (mmss) {
    const mins = Number(mmss[1]);
    const secs = Number(mmss[2]);
    return mins * 60 + secs;
  }
  return null;
}

export function slugifyCourtName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "court";
}
