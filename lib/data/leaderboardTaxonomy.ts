import { listActiveInPersonGameSpecs } from "./inPersonGameSpecs";

export type LeaderboardCategoryFamily = "spots" | "egames";

export type ScoreUnit = "count" | "seconds" | "yards" | "points" | "minutes" | "ratio";
export type VerificationType = "gps_upload" | "upload_only" | "match_result" | "wearable_sync";
export type PlaceKind = "park" | "gym" | "campus" | "range" | "other";

/** Real-world sport grouping for Explore discovery filters. */
export type SpotSportKey =
  | "basketball"
  | "running"
  | "fitness"
  | "golf"
  | "pickleball"
  | "tennis"
  | "soccer"
  | "volleyball"
  | "frisbee";

export type LeaderboardCategory = {
  slug: string;
  title: string;
  family: LeaderboardCategoryFamily;
  scoreUnit: ScoreUnit;
  higherIsBetter: boolean;
  teamAllowed: boolean;
  verificationType: VerificationType;
  proofRules: string;
  placeKinds?: PlaceKind[];
  gameFamily?: string;
  sportKey?: SpotSportKey;
};

export const EXPLORE_SPOT_SPORTS: { key: SpotSportKey | "all"; label: string }[] = [
  { key: "all", label: "All sports" },
  { key: "basketball", label: "Basketball" },
  { key: "pickleball", label: "Pickleball" },
  { key: "tennis", label: "Tennis" },
  { key: "soccer", label: "Soccer" },
  { key: "volleyball", label: "Volleyball" },
  { key: "golf", label: "Golf" },
  { key: "running", label: "Running" },
  { key: "fitness", label: "Fitness" },
  { key: "frisbee", label: "Frisbee" },
];

function spotsCategory(
  slug: string,
  title: string,
  scoreUnit: ScoreUnit,
  higherIsBetter: boolean,
  placeKinds: PlaceKind[],
  teamAllowed = false,
  proofRules = "Upload clear proof clip/photo.",
  verificationType: VerificationType = "gps_upload",
  sportKey?: SpotSportKey
): LeaderboardCategory {
  return {
    slug,
    title,
    family: "spots",
    scoreUnit,
    higherIsBetter,
    placeKinds,
    teamAllowed,
    proofRules,
    verificationType,
    sportKey,
  };
}

function egameCategory(
  slug: string,
  title: string,
  gameFamily: string,
  scoreUnit: ScoreUnit,
  higherIsBetter: boolean,
  teamAllowed = true
): LeaderboardCategory {
  return {
    slug,
    title,
    family: "egames",
    gameFamily,
    scoreUnit,
    higherIsBetter,
    teamAllowed,
    verificationType: "match_result",
    proofRules: "Winner reports; proof optional unless money/crown involved. Opponent has 12h to dispute.",
  };
}

// Spots taxonomy — driven by inPersonGameSpecs (retired slugs excluded).
export const SPOTS_CATEGORIES: LeaderboardCategory[] = listActiveInPersonGameSpecs().map((s) =>
  spotsCategory(
    s.slug,
    s.title,
    s.scoreUnit,
    s.higherIsBetter,
    s.placeKinds,
    s.teamAllowed,
    s.proofHint,
    s.verificationType,
    s.sportKey
  )
);

// E-games curated taxonomy (target: 30 categories).
export const EGAME_CATEGORIES: LeaderboardCategory[] = [
  egameCategory("eg_chess_elo", "Chess ELO leaderboard", "Chess", "points", true),
  egameCategory("eg_checkers_win_streak", "Checkers longest streak", "Checkers", "count", true),
  egameCategory("eg_checkers_win_rate", "Checkers win rate", "Checkers", "ratio", true),
  egameCategory("eg_rocket_league_duos", "Rocket League Duos rank", "Rocket League", "points", true),
  egameCategory("eg_rocket_league_threes", "Rocket League 3s rank", "Rocket League", "points", true),
  egameCategory("eg_valorant_team_rating", "Valorant team rating", "Valorant", "points", true),
  egameCategory("eg_valorant_acs", "Valorant ACS", "Valorant", "points", true, false),
  egameCategory("eg_fifa_record", "FIFA team record", "FIFA", "points", true),
  egameCategory("eg_fifa_goal_diff", "FIFA goal differential", "FIFA", "points", true),
  egameCategory("eg_cod_team_elo", "COD team ELO", "Call of Duty", "points", true),
  egameCategory("eg_cod_kd", "COD K/D ranking", "Call of Duty", "ratio", true, false),
  egameCategory("eg_apex_squad_wins", "Apex squad wins", "Apex", "count", true),
  egameCategory("eg_apex_squad_kills", "Apex squad kills", "Apex", "count", true),
  egameCategory("eg_fortnite_duo_wins", "Fortnite duo wins", "Fortnite", "count", true),
  egameCategory("eg_fortnite_squad_wins", "Fortnite squad wins", "Fortnite", "count", true),
  egameCategory("eg_2k_proam_win_pct", "NBA 2K Pro-Am win %", "NBA 2K", "ratio", true),
  egameCategory("eg_2k_proam_points_diff", "NBA 2K Pro-Am point diff", "NBA 2K", "points", true),
  egameCategory("eg_2k_trios_record", "NBA 2K trios record", "NBA 2K", "points", true),
  egameCategory("eg_madden_h2h", "Madden head-to-head rank", "Madden", "points", true),
  egameCategory("eg_nhl_club_record", "NHL club record", "NHL", "points", true),
  egameCategory("eg_mlb_ranked_rating", "MLB ranked rating", "MLB The Show", "points", true),
  egameCategory("eg_smash_team_rating", "Smash team rating", "Smash", "points", true),
  egameCategory("eg_overwatch_team_sr", "Overwatch team SR", "Overwatch", "points", true),
  egameCategory("eg_r6_team_rating", "R6 team rating", "Rainbow Six", "points", true),
  egameCategory("eg_cs2_team_rating", "CS2 team rating", "CS2", "points", true),
  egameCategory("eg_dota_stack_mmr", "Dota stack MMR", "Dota", "points", true),
  egameCategory("eg_lol_flex_rank", "LoL flex team rank", "League of Legends", "points", true),
  egameCategory("eg_pubg_squad_wins", "PUBG squad wins", "PUBG", "count", true),
  egameCategory("eg_warzone_squad_wins", "Warzone squad wins", "Warzone", "count", true),
  egameCategory("eg_custom_egame_team_rating", "Custom e-game team rating", "Custom", "points", true),
];

export const ALL_LEADERBOARD_CATEGORIES: LeaderboardCategory[] = [
  ...SPOTS_CATEGORIES,
  ...EGAME_CATEGORIES,
];

export const GAME_CATEGORIES: string[] = [
  "Checkers",
  "Chess",
  "Math Race",
  "Math 24",
  "Sudoku Race",
  "Anagrams",
  "Unscramble Word",
  "Match Cards",
  "Word Hunt",
  "Number Pattern",
  "2048",
];

export function getLeaderboardCategory(slug: string): LeaderboardCategory | null {
  return ALL_LEADERBOARD_CATEGORIES.find((c) => c.slug === slug) ?? null;
}

export function listCategoriesByFamily(family: LeaderboardCategoryFamily): LeaderboardCategory[] {
  return ALL_LEADERBOARD_CATEGORIES.filter((c) => c.family === family);
}

export function listSpotCategoriesForPlace(placeKind: PlaceKind | string): LeaderboardCategory[] {
  const pk = String(placeKind) as PlaceKind;
  return SPOTS_CATEGORIES.filter((c) => (c.placeKinds ?? []).includes(pk));
}

/** Default sports when an arena has no explicit sport_keys (conservative — gyms = fitness only). */
export const DEFAULT_SPORT_KEYS_BY_PLACE_KIND: Record<PlaceKind, SpotSportKey[]> = {
  park: ["basketball", "soccer", "tennis", "pickleball", "volleyball", "frisbee", "running"],
  gym: ["fitness"],
  campus: ["basketball", "soccer", "running", "frisbee", "tennis"],
  range: ["golf"],
  other: ["fitness", "running"],
};

export const SPOT_SPORT_OPTIONS: { key: SpotSportKey; label: string }[] = EXPLORE_SPOT_SPORTS.filter(
  (s): s is { key: SpotSportKey; label: string } => s.key !== "all"
);

const OSM_SPORT_ALIASES: Record<string, SpotSportKey> = {
  basketball: "basketball",
  soccer: "soccer",
  football: "soccer",
  tennis: "tennis",
  golf: "golf",
  pickleball: "pickleball",
  volleyball: "volleyball",
  running: "running",
  athletics: "running",
  fitness: "fitness",
  weight_training: "fitness",
  multi: "basketball",
};

export function parseSportKeysFromText(text: string | null | undefined): SpotSportKey[] {
  const raw = String(text ?? "").toLowerCase();
  if (!raw) return [];
  const keys = new Set<SpotSportKey>();
  for (const [alias, key] of Object.entries(OSM_SPORT_ALIASES)) {
    if (raw.includes(alias)) keys.add(key);
  }
  return [...keys];
}

export function parseSportKeysFromDescription(description: string | null | undefined): SpotSportKey[] {
  const d = String(description ?? "");
  const m = /sport:\s*([^·]+)/i.exec(d);
  if (!m) return [];
  return parseSportKeysFromText(m[1]);
}

export type CourtSportContext = {
  place_kind: string;
  sport_keys?: string[] | null;
  game_category_slug?: string | null;
  description?: string | null;
};

/** Resolve which sports are actually available at an arena. */
export function resolveCourtSportKeys(court: CourtSportContext): SpotSportKey[] {
  const explicit = (court.sport_keys ?? []).filter(Boolean) as SpotSportKey[];
  if (explicit.length > 0) {
    return [...new Set(explicit.filter((k) => SPOT_SPORT_OPTIONS.some((s) => s.key === k)))];
  }

  const fromDesc = parseSportKeysFromDescription(court.description);
  if (fromDesc.length > 0) return fromDesc;

  if (court.game_category_slug) {
    const sk = spotSportForRecordSlug(court.game_category_slug);
    if (sk) return [sk];
  }

  const pk = String(court.place_kind) as PlaceKind;
  return DEFAULT_SPORT_KEYS_BY_PLACE_KIND[pk] ?? DEFAULT_SPORT_KEYS_BY_PLACE_KIND.other;
}

export function listSpotCategoriesForCourt(court: CourtSportContext): LeaderboardCategory[] {
  const sportKeys = new Set(resolveCourtSportKeys(court));
  return listSpotCategoriesForPlace(court.place_kind).filter(
    (c) => !c.sportKey || sportKeys.has(c.sportKey)
  );
}

export function courtSupportsSport(court: CourtSportContext, sportKey: SpotSportKey): boolean {
  return resolveCourtSportKeys(court).includes(sportKey);
}

/** First curated record for a sport — used for Explore map crown previews when a sport is selected. */
export function defaultRecordSlugForSpotSport(sportKey: SpotSportKey): string | null {
  return SPOTS_CATEGORIES.find((c) => c.sportKey === sportKey)?.slug ?? null;
}

export function courtSupportsRecordSlug(court: CourtSportContext, recordSlug: string): boolean {
  return listSpotCategoriesForCourt(court).some((c) => c.slug === recordSlug);
}

function inferSpotSportFromSlug(slug: string): SpotSportKey | null {
  if (slug.startsWith("pickleball")) return "pickleball";
  if (slug.startsWith("tennis")) return "tennis";
  if (slug.startsWith("soccer")) return "soccer";
  if (slug.startsWith("volleyball")) return "volleyball";
  if (slug.startsWith("frisbee")) return "frisbee";
  if (
    slug.includes("putt") ||
    slug.includes("wedge") ||
    slug.includes("fairway") ||
    slug.includes("drive") ||
    slug.includes("carry_distance") ||
    slug.includes("chip_in") ||
    slug.includes("swing")
  ) {
    return "golf";
  }
  if (
    slug.includes("_run") ||
    slug.includes("dash") ||
    slug.includes("sprint") ||
    slug.includes("shuttle") ||
    slug === "beep_test_level"
  ) {
    return "running";
  }
  if (
    slug.includes("bench") ||
    slug.includes("squat") ||
    slug.includes("deadlift") ||
    slug.includes("pullup") ||
    slug.includes("burpees") ||
    slug.includes("pushups") ||
    slug.includes("plank") ||
    slug.includes("rope_skips") ||
    slug.includes("kettlebell") ||
    slug.includes("wall_balls") ||
    slug.includes("box_jump") ||
    slug.includes("row_500") ||
    slug.includes("assault_bike")
  ) {
    return "fitness";
  }
  if (
    slug.includes("pointer") ||
    slug.includes("free_throw") ||
    slug.includes("midrange") ||
    slug.includes("layup") ||
    slug.includes("dribble") ||
    slug.includes("one_v_one") ||
    slug.includes("twenty_one") ||
    slug.includes("three_v_three") ||
    slug.includes("five_v_five") ||
    slug.includes("horse") ||
    slug.includes("knockout") ||
    slug.includes("around_the_world") ||
    slug.includes("halfcourt") ||
    slug.includes("dunk")
  ) {
    return "basketball";
  }
  return null;
}

export function spotSportForRecordSlug(slug: string): SpotSportKey | null {
  return getLeaderboardCategory(slug)?.sportKey ?? inferSpotSportFromSlug(slug);
}

export function filterRecordTypesBySpotSport<T extends { slug: string }>(
  recordTypes: T[],
  sportKey: SpotSportKey | "all"
): T[] {
  if (sportKey === "all") return recordTypes;
  return recordTypes.filter((rt) => spotSportForRecordSlug(rt.slug) === sportKey);
}

export type ChallengePerspective = "individual" | "crew";

export function isCrewEligibleRecordType(record: { slug: string; team_allowed?: boolean }): boolean {
  if (typeof record.team_allowed === "boolean") return record.team_allowed;
  return getLeaderboardCategory(record.slug)?.teamAllowed ?? false;
}

/** Solo challenges vs crew/squad formats (uses team_allowed on record types). */
export function filterRecordTypesByPerspective<T extends { slug: string; team_allowed?: boolean }>(
  recordTypes: T[],
  perspective: ChallengePerspective
): T[] {
  return recordTypes.filter((rt) =>
    perspective === "crew" ? isCrewEligibleRecordType(rt) : !isCrewEligibleRecordType(rt)
  );
}

export function spotSportLabel(sportKey: SpotSportKey | "all"): string {
  return EXPLORE_SPOT_SPORTS.find((s) => s.key === sportKey)?.label ?? "Sport";
}

export function validateCategoryScore(slug: string, raw: string): number | null {
  const cat = getLeaderboardCategory(slug);
  if (!cat) return null;
  const t = String(raw ?? "").trim();
  if (!t) return null;

  if (cat.scoreUnit === "seconds" && t.includes(":")) {
    const m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(t);
    if (!m) return null;
    const mins = Number(m[1]);
    const secs = Number(m[2]);
    const total = mins * 60 + secs;
    return Number.isFinite(total) && total >= 0 ? total : null;
  }

  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}
