// lib/data/gameConfig.ts

export type GameMode = "phone" | "manual";

export type GameConfig = {
  key: string; // should match challenges.game_type exactly
  title: string;
  subtitle?: string;

  /** If set, winning this challenge can prompt the user to rep the result on spot/King leaderboards (court_record_types slugs). */
  leaderboardRecordSlugs?: string[];

  mode: GameMode;

  /**
   * For phone games, where to send users to play.
   * Example: "/phone-games/checkers"
   */
  phoneRoute?: string;

  /**
   * Turn-based games: use challenge_turns + "Your turn" gating
   */
  turnBased?: boolean;

  /**
   * One-attempt games: both players submit once, opponent score hidden until both submit
   */
  oneAttempt?: boolean;

  /** Shown on the challenge screen (not in the in-game UI). */
  rules?: string[];
};

export const GAME_CONFIG: Record<string, GameConfig> = {
  // ===== Phone games =====
  Checkers: {
    key: "Checkers",
    title: "Checkers",
    subtitle: "Capture all pieces or block all moves",
    mode: "phone",
    phoneRoute: "/phone-games/checkers",
    turnBased: true,
    oneAttempt: false,
    rules: [
      "Move diagonally; jump to capture opponent pieces.",
      "Kings move and capture in both diagonal directions.",
      "Lose when you have no legal moves or no pieces left.",
    ],
  },

  "Math Race": {
    key: "Math Race",
    title: "Math Race",
    subtitle: "10 quick problems - highest score, then fastest time",
    mode: "phone",
    phoneRoute: "/phone-games/math-race",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Answer all 10 questions.",
      "Higher score wins.",
      "If tied, faster time wins.",
    ],
  },

  "Math 24": {
    key: "Math 24",
    title: "Math 24",
    subtitle: "Combine 4 numbers into 24 — fastest total time wins",
    mode: "phone",
    phoneRoute: "/phone-games/math-24",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Combine all 4 numbers using + − × ÷.",
      "Creator picks 1, 3, 5, or 10 sets per match.",
      "Both players get the same puzzles — lowest total time wins.",
    ],
  },

  "Sudoku Race": {
    key: "Sudoku Race",
    title: "Sudoku Race",
    subtitle: "Solve the same puzzle faster than your opponent",
    mode: "phone",
    phoneRoute: "/phone-games/sudoku-race",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Fill every row, column, and 3x3 box with 1-9.",
      "No repeats allowed.",
      "Same puzzle for both players; fastest valid solve wins.",
    ],
  },

  // ✅ NEW GAME
  Anagrams: {
    key: "Anagrams",
    title: "Anagrams",
    subtitle: "Build real words in 60s - longer streaks score more",
    mode: "phone",
    phoneRoute: "/phone-games/anagrams",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Build real English words from the 7 tiles.",
      "3–7 letters only; duplicates do not count.",
      "Score as many points as possible in 60 seconds.",
    ],
  },

  "Unscramble Word": {
    key: "Unscramble Word",
    title: "Unscramble Words",
    subtitle: "Solve 5 scrambled words - fastest clean run wins",
    mode: "phone",
    phoneRoute: "/phone-games/unscramble",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Solve all 5 scrambled words.",
      "Only exact spellings count.",
      "Fastest complete run wins.",
    ],
  },

  "Match Cards": {
    key: "Match Cards",
    title: "Match Cards",
    subtitle: "Match all pairs in the fewest moves",
    mode: "phone",
    phoneRoute: "/phone-games/match-cards",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Flip two cards at a time.",
      "Matching pairs stay face up.",
      "Clear all pairs in the fewest moves.",
    ],
  },

  "Word Hunt": {
    key: "Word Hunt",
    title: "Word Hunt",
    subtitle: "Find words in grid — most points wins",
    mode: "phone",
    phoneRoute: "/phone-games/word-hunt",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Find words by connecting adjacent letters on the grid.",
      "Longer words score more points.",
      "Most points when time runs out wins.",
    ],
  },

  "Number Pattern": {
    key: "Number Pattern",
    title: "Numbers Pattern",
    subtitle: "Find the next number in 5 sequences - fastest wins",
    mode: "phone",
    phoneRoute: "/phone-games/number-pattern",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Solve 5 sequence questions.",
      "Only correct answers advance.",
      "Fastest perfect run wins.",
    ],
  },

  "2048": {
    key: "2048",
    title: "2048",
    subtitle: "Merge tiles until stuck - highest score wins",
    mode: "phone",
    phoneRoute: "/phone-games/twenty48",
    turnBased: false,
    oneAttempt: true,
    rules: [
      "Swipe on the board to slide tiles in that direction.",
      "Matching tiles merge; every move spawns a new tile.",
      "When no moves remain, highest score wins.",
    ],
  },

  Chess: {
    key: "Chess",
    title: "Chess",
    subtitle: "Checkmate wins - classic turn-based duel",
    mode: "phone",
    phoneRoute: "/phone-games/chess",
    turnBased: true,
    oneAttempt: false,
    rules: [
      "Standard chess movement and check rules apply.",
      "You must move out of check.",
      "Checkmate wins; stalemate is a draw.",
    ],
  },

  // ===== Manual / IRL games (examples) =====
  // You can keep supporting your old "irl:" prefix too (see helper below),
  // but this config is the clean way going forward.
  "IRL: 1v1 Basketball": {
    key: "IRL: 1v1 Basketball",
    title: "IRL: 1v1 Basketball",
    subtitle: "Manual result entry",
    mode: "manual",
    leaderboardRecordSlugs: ["one_v_one_to_11_unlimited_dribbles", "twenty_one_1v1"],
  },

  "IRL: 3v3 Basketball": {
    key: "IRL: 3v3 Basketball",
    title: "IRL: 3v3 Basketball",
    subtitle: "Manual result — first team to 21",
    mode: "manual",
    leaderboardRecordSlugs: ["three_v_three_to_21"],
  },

  "IRL: 5v5 Basketball": {
    key: "IRL: 5v5 Basketball",
    title: "IRL: 5v5 Basketball",
    subtitle: "Manual result — full-court pickup",
    mode: "manual",
    leaderboardRecordSlugs: ["five_v_five_full_court"],
  },

  "IRL: HORSE": {
    key: "IRL: HORSE",
    title: "IRL: HORSE",
    subtitle: "Manual result — trick shot game",
    mode: "manual",
    leaderboardRecordSlugs: ["horse_rounds_survived"],
  },

  "IRL: Knockout": {
    key: "IRL: Knockout",
    title: "IRL: Knockout",
    subtitle: "Manual result — last shooter standing",
    mode: "manual",
    leaderboardRecordSlugs: ["knockout_survivor_rounds"],
  },

  "IRL: Around the World": {
    key: "IRL: Around the World",
    title: "IRL: Around the World",
    subtitle: "Manual result — clear every spot",
    mode: "manual",
    leaderboardRecordSlugs: ["around_the_world_spots"],
  },

  "IRL: Pickleball 2v2": {
    key: "IRL: Pickleball 2v2",
    title: "IRL: Pickleball 2v2",
    subtitle: "Manual result — first team to 11",
    mode: "manual",
    leaderboardRecordSlugs: ["pickleball_two_v_two_to_11"],
  },

  "IRL: Soccer Penalties": {
    key: "IRL: Soccer Penalties",
    title: "IRL: Soccer Penalties",
    subtitle: "Manual result — penalty shootout",
    mode: "manual",
    leaderboardRecordSlugs: ["soccer_penalty_streak"],
  },

  "IRL: Golf / longest carry": {
    key: "IRL: Golf / longest carry",
    title: "IRL: Golf / longest carry",
    subtitle: "Manual result — driving range",
    mode: "manual",
    leaderboardRecordSlugs: ["carry_distance_yards"],
  },

  "IRL: Mile / run": {
    key: "IRL: Mile / run",
    title: "IRL: Mile / run",
    subtitle: "Manual result — track or path",
    mode: "manual",
    leaderboardRecordSlugs: ["mile_run"],
  },

  // ===== E-games (play elsewhere, report winner — no check-in) =====
  "Rocket League": {
    key: "Rocket League",
    title: "Rocket League",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  Valorant: {
    key: "Valorant",
    title: "Valorant",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  FIFA: {
    key: "FIFA",
    title: "FIFA",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  Fortnite: {
    key: "Fortnite",
    title: "Fortnite",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  "Call of Duty": {
    key: "Call of Duty",
    title: "Call of Duty",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  Apex: {
    key: "Apex",
    title: "Apex Legends",
    subtitle: "Report winner — proof optional, 12h to dispute",
    mode: "manual",
  },
  "Custom E-game": {
    key: "Custom E-game",
    title: "Custom E-game",
    subtitle: "Enter your game name",
    mode: "manual",
  },
};

// ---------- Helpers (use everywhere) ----------

export function getGameConfig(gameType: string | null | undefined): GameConfig | null {
  if (!gameType) return null;

  const normalized = String(gameType).trim();
  const lower = normalized.toLowerCase();

  // 1) Exact match (preferred)
  if (GAME_CONFIG[normalized]) return GAME_CONFIG[normalized];

  // 1b) Common aliases / pluralization variants
  if (lower === "numbers pattern") return GAME_CONFIG["Number Pattern"];
  if (lower === "unscramble words") return GAME_CONFIG["Unscramble Word"];
  if (lower === "sudoku") return GAME_CONFIG["Sudoku Race"];

  // 2) Back-compat: your old prefix style "irl:..."
  const gt = normalized;
  if (gt.toLowerCase().startsWith("irl:")) {
    return {
      key: gt,
      title: gt,
      mode: "manual",
      subtitle: "Manual result entry",
    };
  }

  return null;
}

export function isManualGameType(gameType: string | null | undefined) {
  const cfg = getGameConfig(gameType);
  if (cfg) return cfg.mode === "manual";
  // fallback
  return String(gameType ?? "").toLowerCase().startsWith("irl:");
}

export function isEgameKind(kind: string | null | undefined) {
  return String(kind ?? "").toLowerCase() === "egame";
}

export function isTurnBasedGameType(gameType: string | null | undefined) {
  const cfg = getGameConfig(gameType);
  if (cfg && typeof cfg.turnBased === "boolean") return cfg.turnBased;

  // fallback to your legacy logic
  const gt = String(gameType ?? "").toLowerCase();
  return gt.includes("checkers") || gt.includes("chess");
}

export function isOneAttemptGameType(gameType: string | null | undefined) {
  const cfg = getGameConfig(gameType);
  if (cfg && typeof cfg.oneAttempt === "boolean") return cfg.oneAttempt;

  // fallback to your legacy logic
  const gt = String(gameType ?? "").toLowerCase();
  if (gt.includes("math")) return true;
  if (gt.includes("sudoku")) return true;
  if (gt.includes("anagram")) return true;
  if (gt.includes("unscramble")) return true;
  if (gt.includes("match card")) return true;
  if (gt.includes("word hunt")) return true;
  if (gt.includes("number pattern")) return true;
  return false;
}

export function routeForGame(gameType: string | null | undefined) {
  const cfg = getGameConfig(gameType);

  // Manual challenges don't have a play route (they use submit/report flow)
  if (cfg?.mode === "manual") return null;

  // Phone games should have a phoneRoute
  if (cfg?.mode === "phone" && cfg.phoneRoute) return cfg.phoneRoute;

  // fallback to your old routing
  const gt = String(gameType ?? "").toLowerCase();
  if (gt.includes("checkers")) return "/phone-games/checkers";
  if (gt.includes("chess")) return "/phone-games/chess";
  if (gt.includes("unscramble")) return "/phone-games/unscramble";
  if (gt.includes("match card")) return "/phone-games/match-cards";
  if (gt.includes("word hunt")) return "/phone-games/word-hunt";
  if (gt.includes("number pattern") || gt.includes("numbers pattern")) return "/phone-games/number-pattern";
  if (gt.includes("math-24") || gt.includes("math 24")) return "/phone-games/math-24";
  if (gt.includes("math")) return "/phone-games/math-race";
  if (gt.includes("sudoku")) return "/phone-games/sudoku-race";
  if (gt.includes("anagram")) return "/phone-games/anagrams";
  return "/phone-games";
}
