// lib/data/practiceMode.ts — Solo practice catalog (no opponent, no stakes)

import { SPOTS_CATEGORIES, type SpotSportKey } from "./leaderboardTaxonomy";
import { GAME_CONFIG } from "./gameConfig";
import { resolveInPersonVisionProfileFromSlug } from "./inPersonVisionConfig";

export type PracticeCategory = "phone" | SpotSportKey;

export type PracticeActivity = {
  id: string;
  category: PracticeCategory;
  title: string;
  subtitle: string;
  emoji: string;
  route: string;
};

const SPORT_LABELS: Record<SpotSportKey, { title: string; hint: string }> = {
  basketball: {
    title: "Basketball",
    hint: "Arena Vision shooting sessions or court drills with GPS check-in.",
  },
  golf: {
    title: "Golf",
    hint: "Range rounds with proof or putting and wedge drills at an arena.",
  },
  running: {
    title: "Running & track",
    hint: "Mile, 5K, sprints — log times from Apple Watch, Garmin, or Fitbit.",
  },
  fitness: {
    title: "Fitness & gym",
    hint: "Reps, holds, and cardio — record proof and AI validates your score.",
  },
  pickleball: {
    title: "Pickleball",
    hint: "Serve accuracy and dink rallies — record proof and AI validates.",
  },
  tennis: {
    title: "Tennis",
    hint: "Serve speed and rally drills — record proof and AI validates.",
  },
  soccer: {
    title: "Soccer",
    hint: "Juggles, crossbar, penalties — record proof and AI validates.",
  },
  volleyball: {
    title: "Volleyball",
    hint: "Serve target drills — record proof and AI validates.",
  },
  frisbee: {
    title: "Frisbee",
    hint: "Target accuracy drills — record proof and AI validates.",
  },
};

export const PRACTICE_CATEGORY_LABELS: Record<PracticeCategory, { title: string; hint: string }> = {
  phone: {
    title: "Phone games",
    hint: "Solo runs — track personal bests and streaks.",
  },
  ...SPORT_LABELS,
};

/** Head-to-head formats that need a real opponent — not solo practice. */
const OPPONENT_MATCH_SLUGS = new Set([
  "one_v_one_to_11_four_dribbles",
  "one_v_one_to_11_unlimited_dribbles",
  "twenty_one_1v1",
  "three_v_three_to_21",
  "five_v_five_full_court",
  "horse_rounds_survived",
  "knockout_survivor_rounds",
  "pickleball_two_v_two_to_11",
]);

/** Turn-based phone games need a live opponent in a challenge. */
const OPPONENT_REQUIRED_PHONE_KEYS = new Set(["Chess", "Checkers"]);

const SPORT_EMOJI: Record<SpotSportKey, string> = {
  basketball: "🏀",
  golf: "⛳",
  running: "🏃",
  fitness: "💪",
  pickleball: "🏓",
  tennis: "🎾",
  soccer: "⚽",
  volleyball: "🏐",
  frisbee: "🥏",
};

function emojiForGameKey(key: string): string {
  switch (key) {
    case "Math Race":
      return "🧠";
    case "Math 24":
      return "⚡";
    case "Sudoku Race":
      return "🔢";
    case "Anagrams":
      return "🔤";
    case "Unscramble Word":
      return "🔀";
    case "Match Cards":
      return "🃏";
    case "Word Hunt":
      return "🔍";
    case "Number Pattern":
      return "📐";
    case "2048":
      return "🧩";
    default:
      return "🎮";
  }
}

export function practiceRouteForRecordSlug(slug: string): string {
  const profile = resolveInPersonVisionProfileFromSlug(slug);
  if (profile.visionRoute === "/vision/run-wearable") {
    return `/vision/run-wearable?recordSlug=${encodeURIComponent(slug)}`;
  }
  if (profile.visionRoute === "/vision/shooting-session") {
    const params = new URLSearchParams();
    if (profile.shootingSessionType) params.set("sessionType", profile.shootingSessionType);
    if (profile.timeLimitSec) params.set("timeLimitSec", String(profile.timeLimitSec));
    if (profile.recordSlug) params.set("recordSlug", profile.recordSlug);
    const qs = params.toString();
    return qs ? `/vision/shooting-session?${qs}` : "/vision/shooting-session";
  }
  if (profile.visionRoute === "/golf/start") return "/golf/start";
  if (profile.mode === "activity_proof") {
    return `/vision/activity-practice?recordSlug=${encodeURIComponent(slug)}`;
  }
  return `/courts?record=${encodeURIComponent(slug)}`;
}

function spotActivitySubtitle(slug: string): string {
  const profile = resolveInPersonVisionProfileFromSlug(slug);
  if (profile.usesWearableSync) {
    return "Log from Apple Watch, Garmin, or Fitbit — upload activity screenshot.";
  }
  if (profile.usesShotTracker || profile.usesGolfAi) {
    return "Arena Vision + AI — unlimited reps.";
  }
  if (profile.mode === "activity_proof") {
    return "Record proof — AI validates your score.";
  }
  return `${profile.proofHint} Check in at a nearby arena.`;
}

function listSpotPracticeForSport(sport: SpotSportKey): PracticeActivity[] {
  return SPOTS_CATEGORIES.filter(
    (c) => c.sportKey === sport && !OPPONENT_MATCH_SLUGS.has(c.slug)
  ).map((c) => ({
    id: `spot:${c.slug}`,
    category: sport,
    title: c.title,
    subtitle: spotActivitySubtitle(c.slug),
    emoji: SPORT_EMOJI[sport],
    route: practiceRouteForRecordSlug(c.slug),
  }));
}

export function listPhonePracticeActivities(): PracticeActivity[] {
  return Object.values(GAME_CONFIG)
    .filter((g) => g.mode === "phone" && g.phoneRoute && !OPPONENT_REQUIRED_PHONE_KEYS.has(g.key))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((g) => ({
      id: `phone:${g.key}`,
      category: "phone" as const,
      title: g.title,
      subtitle: g.subtitle ?? "Unlimited solo runs",
      emoji: emojiForGameKey(g.key),
      route: g.phoneRoute!,
    }));
}

export function listBasketballPracticeActivities(): PracticeActivity[] {
  const visionExtras: PracticeActivity[] = [
    {
      id: "bb:3pt-open",
      category: "basketball",
      title: "3-Point Shooting (open)",
      subtitle: "No timer — AI counts makes",
      emoji: "🏹",
      route: "/vision/shooting-session?sessionType=three_point",
    },
    {
      id: "bb:hub",
      category: "basketball",
      title: "Arena Vision Hub",
      subtitle: "Recent sessions and all shooting modes",
      emoji: "📹",
      route: "/vision",
    },
  ];

  const spot = listSpotPracticeForSport("basketball");
  const seen = new Set<string>();
  const merged = [...visionExtras, ...spot].filter((a) => {
    const key = a.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return merged;
}

export function listGolfPracticeActivities(): PracticeActivity[] {
  const visionExtras: PracticeActivity[] = [
    {
      id: "golf:round",
      category: "golf",
      title: "Golf Round",
      subtitle: "Stroke or match play with scorecard proof",
      emoji: "🏌️",
      route: "/golf/start",
    },
    {
      id: "golf:hub",
      category: "golf",
      title: "Golf Hub",
      subtitle: "Start sessions and view past rounds",
      emoji: "📋",
      route: "/golf",
    },
  ];

  const spot = listSpotPracticeForSport("golf");
  const seen = new Set<string>();
  return [...visionExtras, ...spot].filter((a) => {
    const key = a.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ARENA_SPORT_ORDER: SpotSportKey[] = [
  "running",
  "fitness",
  "pickleball",
  "tennis",
  "soccer",
  "volleyball",
  "frisbee",
];

export function listAllPracticeActivities(): PracticeActivity[] {
  return [
    ...listPhonePracticeActivities(),
    ...listBasketballPracticeActivities(),
    ...listGolfPracticeActivities(),
    ...ARENA_SPORT_ORDER.flatMap((s) => listSpotPracticeForSport(s)),
  ];
}

export type PracticeCategoryGroup = {
  category: PracticeCategory;
  title: string;
  hint: string;
  items: PracticeActivity[];
};

export function groupPracticeActivities(query?: string): PracticeCategoryGroup[] {
  const q = (query ?? "").trim().toLowerCase();
  const filter = (items: PracticeActivity[]) => {
    if (!q) return items;
    return items.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        PRACTICE_CATEGORY_LABELS[a.category].title.toLowerCase().includes(q)
    );
  };

  const groups: PracticeCategoryGroup[] = [
    {
      category: "phone",
      ...PRACTICE_CATEGORY_LABELS.phone,
      items: filter(listPhonePracticeActivities()),
    },
    {
      category: "basketball",
      ...PRACTICE_CATEGORY_LABELS.basketball,
      items: filter(listBasketballPracticeActivities()),
    },
    {
      category: "golf",
      ...PRACTICE_CATEGORY_LABELS.golf,
      items: filter(listGolfPracticeActivities()),
    },
    ...ARENA_SPORT_ORDER.map((sport) => ({
      category: sport,
      ...PRACTICE_CATEGORY_LABELS[sport],
      items: filter(listSpotPracticeForSport(sport)),
    })),
  ];

  return groups.filter((g) => g.items.length > 0);
}

/** Shown as footer context — activities that need a real opponent. */
export const PRACTICE_NOT_AVAILABLE = [
  "1v1 / team sports (basketball pickup, pickleball 2v2)",
  "HORSE, Knockout, and other head-to-head games",
  "Chess & Checkers (need a live opponent)",
  "E-games (Rocket League, Valorant, FIFA, etc.)",
] as const;
