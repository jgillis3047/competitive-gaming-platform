/** User-facing copy for the territory / crown system. Internal table names stay `courts`. */

export const ARENA_CLAIM_CTA = "Claim New Arena";
export const ARENA_CLAIM_SUB = "Add a real-world spot where people compete for the crown.";
export const ARENA_ALREADY_ON_MAP_TITLE = "Already on the map";
export const ARENA_ALREADY_ON_MAP_BODY =
  "This spot matches an arena that's already on Explore. Open it to compete for the crown — one place, one king.";
export const ARENA_OPEN_EXISTING = "Open this arena";
export const ARENA_PENDING_LABEL = "Pending verification";
export const ARENA_REFERENCE_PHOTOS_LABEL = "What it looks like";
export const ARENA_NO_REFERENCE_PHOTO =
  "No reference photo yet. Newly claimed arenas include live photos from the spot.";
export const ARENA_DEFEND_CROWN = "Defend crown";
export const ARENA_CHALLENGE_KING = "Challenge king";
export const CHALLENGE_KINGS_TITLE = "Challenge kings";
export const CHALLENGE_KINGS_SUBTITLE =
  "Who holds each crown — pick a competition and find kings near you or by area";
export const CHALLENGE_KINGS_EMPTY =
  "No crowns in this area yet. Try Browse, another sport, or claim a spot.";
export const ARENA_DETHRONED = "Dethroned";
export const ARENA_CROWN_OPEN = "Crown open";
export const ARENA_HISTORY = "Arena history";

/** Tab: geographic discovery — WHERE to compete */
export const EXPLORE_TITLE = "Explore";
export const EXPLORE_ARENAS_SUBTITLE = "Find territory — kings, challengers, and open competition nearby";
export const EXPLORE_SUBTITLE = EXPLORE_ARENAS_SUBTITLE;

/** Intentional lookup — not a social browse feed. */
export const SEARCH_PLACEHOLDER = "Search players, crews, arenas…";
export const SEARCH_SECTION_COMPETITORS = "Competitors";
export const SEARCH_SECTION_OPEN_MATCHES = "Open matches";
export const SEARCH_EMPTY_HINT = "Search players by handle — Jordan, Mike, VegasGolfer…";
export const SEARCH_SECTION_CREWS = "Crews";

/** Arena page — competition-first people visibility (not “nearby users”). */
export const ARENA_PEOPLE_ACTIVE_HERE = "People active here";
export const ARENA_DISCOVERY_SUB =
  "Competitors who log results at this spot — tap a profile to view their record.";
export const ARENA_CLIPS_LINK = "Recent clips";
export const ARENA_OPEN_MATCHES_LINK = "Start a challenge here";
export const ARENA_VIEW_LEADERBOARD = "Full leaderboard";

export const DISCOVERY_LOOP_HINT =
  "Explore → arena → competitors → Pulse rivalries. Discovery through competition, not browsing profiles.";

/** Legends tab within Explore — WHO dominates */
export const LEGENDS_HOME_SUBTITLE = "Crowns, streaks, and ladders — not the map";

/** Tab: live activity feed — WHAT'S HAPPENING (not a physical location) */
export const PULSE_TAB_TITLE = "Pulse";
export const PULSE_SUBTITLE = "Social pulse — highlights, people, crews & crowns";
export const PULSE_SECTION_NEARBY = "📍 Near you";
export const PULSE_SECTION_NEW_PLAYERS = "✨ New players";
export const PULSE_SECTION_SIMILAR_SKILL = "🎯 Similar skill level";
export const PULSE_SECTION_CROWN_HOLDERS = "🏆 Crown holders";
export const PULSE_SECTION_TRENDING_CREWS = "🔥 Trending crews";
export const PULSE_SECTION_TOP_CREW_CROWNS = "👑 Most crew crowns";
export const PULSE_SECTION_NEW_CREWS = "✨ New crews";
export const PULSE_HAPPENING_TITLE = "Live activity";
export const PULSE_HAPPENING_EMPTY =
  "No active competitions nearby — dethronings and match updates show here.";
export const PULSE_SECTION_LIVE_NOW = "🔥 Live now";
export const PULSE_SECTION_TRENDING_COMPETITORS = "🔥 Trending competitors";
export const PULSE_SECTION_CROWN_CHANGES = "👑 Crown changes";
export const PULSE_SECTION_OPEN_CHALLENGES = "⚔️ Open challenges";
export const PULSE_SECTION_RECENT = "📍 Recent activity";
export const PULSE_EMPTY_HINT =
  "Quiet pulse — find territory on Explore or start a match from Create.";
export const PULSE_EXPLORE_LINK = "See activity on Pulse";
export const PULSE_CTA_OPEN_MATCH_FEED = "Open match feed";
export const PULSE_CTA_VIEW_MATCH = "View match";
export const PULSE_CTA_VIEW_RESULTS = "View results";
export const PULSE_CTA_JOIN = "Join now";
export const PULSE_CTA_CONTINUE = "Continue";
export const PULSE_CTA_FIND_MATCH = "Find match";
export const PULSE_STATUS_ACTIVE = "ACTIVE";
export const PULSE_STATUS_READY = "READY";
export const PULSE_STATUS_CHECKED_IN = "CHECKED IN";

/** Explore filter panel toggle */
export const EXPLORE_FILTERS_LABEL = "Filters";
export const EXPLORE_FILTER_SPORT = "Sport";
export const EXPLORE_FILTER_RECORD = "Record";
export const ARENA_FILTER_COMPETITION = "Competition";
export const ARENA_FILTER_FORMAT = "Format";
export const ARENA_FORMAT_INDIVIDUAL_HINT = "Solo challenges — shooting drills, timed runs, skill tests.";
export const ARENA_FORMAT_CREW_HINT = "Crew challenges — 1v1, 3v3, 5v5, and squad formats.";
export const EXPLORE_FILTER_SPORT_HINT =
  "Narrow arenas by sport and place type. Open any pin for full records, crew vs solo, and rankings.";

/** Primary Explore perspective — always visible on the tab */
export const EXPLORE_PERSPECTIVE_INDIVIDUAL = "Individual";
export const EXPLORE_PERSPECTIVE_CREW = "Crews";

/** Secondary stats section (was "Rankings") */
export const LEGENDS_SECTION_LABEL = "Legends";

/** Legends category picker hero */
export const LEGENDS_PICK_COPY = "Pick a competition — court crowns, digital games, or cross-app prestige.";

export const LEGENDS_TERRITORY_TITLE = "Court crowns";
export const LEGENDS_TERRITORY_COPY =
  "Who holds each arena near you. Tap a row for kings, all-time grinders, and history.";
export const LEGENDS_TERRITORY_LIST_HINT =
  "Same arenas as the map — tap any row for that spot’s crown. Use the map when you want geography.";

/** How to reach a specific place + game leaderboard */
export const LEADERBOARD_PATH_HINT =
  "Find an arena on the map, open it for kings and challengers, then use Search when you want a specific competitor.";
export const LEGENDS_VIEW_ON_MAP = "View on map";

/** Mirrors Explore perspective labels */
export const LEGENDS_PERSPECTIVE_INDIVIDUAL = EXPLORE_PERSPECTIVE_INDIVIDUAL;
export const LEGENDS_PERSPECTIVE_CREW = EXPLORE_PERSPECTIVE_CREW;

export type LegendsGameKey = "territory" | "in_app" | "esports" | "all_matches";

export const LEGENDS_GAMES: {
  key: LegendsGameKey;
  label: string;
  sublabel: string;
  icon: string;
}[] = [
  {
    key: "territory",
    label: "Basketball & courts",
    sublabel: "Crowns near you — ranked list, not the map",
    icon: "basketball-outline",
  },
  {
    key: "in_app",
    label: "In-app games",
    sublabel: "Chess, checkers, puzzles…",
    icon: "game-controller-outline",
  },
  {
    key: "esports",
    label: "E-sports",
    sublabel: "Digital ranked games — solo or with your crew",
    icon: "people-outline",
  },
  {
    key: "all_matches",
    label: "Hall of Fame",
    sublabel: "Cross-game wins, streaks, and prestige",
    icon: "trophy-outline",
  },
];

export const GLOBAL_RANKINGS_TITLE = "Hall of Fame";
export const GLOBAL_RANKINGS_SUBTITLE =
  "App-wide wins, digital games, and crew ladders — court crowns live on each arena.";
export const EXPLORE_GLOBAL_RANKINGS_LINK = "Hall of Fame & game rankings";

/** In-app / e-sports / Hall of Fame — not per-arena territory (see Explore + arena pages). */
export const GLOBAL_LEGENDS_GAMES = LEGENDS_GAMES.filter((g) => g.key !== "territory");

/** People-first Explore discovery line — never emphasize empty crowns. */
export function formatExploreActivityLine(
  arenaCount: number,
  kingCount: number,
  topKingName?: string | null,
  perspective: "individual" | "crew" = "individual"
): string {
  const isCrew = perspective === "crew";
  if (arenaCount <= 0) {
    return isCrew
      ? "No arenas in range — try Browse or move closer to find crew crowns."
      : "No arenas in range — try Browse or move closer to competition.";
  }
  if (kingCount > 0) {
    const holders = isCrew
      ? `${kingCount} active crew${kingCount === 1 ? "" : "s"} nearby`
      : `${kingCount} active king${kingCount === 1 ? "" : "s"} nearby`;
    if (topKingName) {
      return isCrew
        ? `${holders} · ${topKingName} holding court`
        : `${holders} · ${topKingName} holding court`;
    }
    return `${holders} · ${arenaCount} arena${arenaCount === 1 ? "" : "s"}`;
  }
  return isCrew
    ? `${arenaCount} arena${arenaCount === 1 ? "" : "s"} nearby · Crew crowns available`
    : `${arenaCount} arena${arenaCount === 1 ? "" : "s"} nearby · Crowns available — be the first king`;
}

/** @deprecated use formatExploreActivityLine */
export function formatNearbyArenasLine(arenaCount: number, kingCount: number): string {
  return formatExploreActivityLine(arenaCount, kingCount);
}

export const CROWN_VS_ALLTIME_HINT =
  "The crown is whoever holds it now. All-time wins are separate — you can dethrone the king without having the most wins.";

export const ARENA_TAB_OVERVIEW_LEAD =
  "Who competes here — kings, challengers, clips, and open challenges at this spot.";
export const ARENA_TAB_LEGENDS_LEAD = "Choose format, sport, and record to view rankings.";
export const ARENA_HISTORY_SOON =
  "Crown timeline (past kings, reigns) is coming soon. Until then, check Pulse for dethronings.";

export type ArenaTier = "bronze" | "silver" | "gold" | "legendary";

export const ARENA_TIER_LABELS: Record<ArenaTier, string> = {
  bronze: "Bronze Arena",
  silver: "Silver Arena",
  gold: "Gold Arena",
  legendary: "Legendary Arena",
};

export type MatchVerificationLevel = "basic" | "verified" | "featured" | "legendary";

export const MATCH_VERIFICATION_LABELS: Record<MatchVerificationLevel, string> = {
  basic: "Basic match",
  verified: "Verified match",
  featured: "Featured match",
  legendary: "Legendary match",
};

const SOCIAL_PROOF_HOSTS = [
  "tiktok.com",
  "vm.tiktok.com",
  "youtube.com",
  "youtu.be",
  "instagram.com",
];

/** Accept TikTok, YouTube, or Instagram Reel links for match proof. */
export function isValidSocialProofUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!SOCIAL_PROOF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
    if (host.includes("instagram") && !u.pathname.includes("/reel")) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeSocialProofUrl(raw: string): string {
  const t = raw.trim();
  return t.startsWith("http") ? t : `https://${t}`;
}

/** Derive arena tier from activity stats. */
export function computeArenaTier(stats: {
  verificationStatus: string;
  totalAttempts: number;
  uniqueCompetitors: number;
  attemptsLast7d: number;
}): ArenaTier {
  if (stats.verificationStatus !== "approved") return "bronze";
  const { totalAttempts, uniqueCompetitors, attemptsLast7d } = stats;
  if (
    totalAttempts >= 100 &&
    uniqueCompetitors >= 20 &&
    attemptsLast7d >= 5
  ) {
    return "legendary";
  }
  if (uniqueCompetitors >= 10 && attemptsLast7d >= 3) return "gold";
  if (totalAttempts >= 25) return "silver";
  return "bronze";
}
