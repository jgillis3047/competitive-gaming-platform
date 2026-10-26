/**
 * Core palette — use these instead of one-off hex strings where practical.
 *
 * Blue hierarchy (avoid muddy competition):
 * - accent / accentCTA → solid primary buttons
 * - accentTab → tab bar active (gold — crown identity)
 * - accentChip → selected filters/chips (subtle fill)
 * - accentBorderSubtle → decorative card borders
 *
 * Heat (use sparingly): live matches, trending, hot streaks
 */
export const colors = {
  bg: "#070b14",
  /** Main app canvas */
  bgFeed: "#070b14",
  /** Slightly lifted header zone (pair with ScreenCanvas glow) */
  bgFeedTop: "#0a1020",
  bgDeep: "#040813",
  surface: "#101624",
  surfaceElevated: "#131b2b",
  /** Cards, composer, mode switcher */
  surfaceMuted: "#0f1628",
  /** Hairline border on dark panels */
  line: "#24304f",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#ffffff",
  textSecondary: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.52)",
  /** Labels, meta, secondary lines */
  textTertiary: "#a6afd1",

  /** Legacy alias — primary brand blue */
  accent: "#4f6df5",
  accentMuted: "#8aa0ff",
  /** Solid CTA buttons (Open Match Feed, Create, etc.) */
  accentCTA: "#3478f6",
  /** Tab bar active — gold crown identity, not competing with CTAs */
  accentTab: "#facc15",
  /** Selected chips / filter pills — subtle, not button-solid */
  accentChip: "rgba(79,109,245,0.14)",
  accentChipBorder: "rgba(99,120,255,0.38)",
  /** Decorative borders on cards — lowest blue emphasis */
  accentBorderSubtle: "rgba(79,109,245,0.22)",
  /** @deprecated use accentChip */
  accentSurface: "rgba(79,109,245,0.14)",
  /** @deprecated use accentChipBorder for chips; accentCTA for buttons */
  accentBorder: "#4f6df5",
  /** Secondary CTA (e.g. Post) */
  actionBlue: "#3478f6",

  /** Heat — energetic orange (live, trending, battles). Use sparingly. */
  heat: "#fb923c",
  heatBright: "#f97316",
  heatSurface: "rgba(251,146,60,0.12)",
  heatBorder: "rgba(251,146,60,0.42)",
  heatGlow: "rgba(249,115,22,0.28)",

  /** Hot streak / trending — purple */
  hotPurple: "#c084fc",
  hotSurface: "rgba(192,132,252,0.12)",
  hotBorder: "rgba(192,132,252,0.38)",
  hotGlow: "rgba(168,85,247,0.22)",

  /** Friend activity */
  friendGreen: "#34d399",
  friendSurface: "rgba(52,211,153,0.1)",
  friendBorder: "rgba(52,211,153,0.35)",
  friendGlow: "rgba(16,185,129,0.18)",

  /** Verified arena */
  verifiedCyan: "#22d3ee",
  verifiedSurface: "rgba(34,211,238,0.1)",
  verifiedBorder: "rgba(34,211,238,0.35)",
  verifiedGlow: "rgba(34,211,238,0.2)",

  /** ScreenCanvas atmospheric glows */
  canvasGlowTop: "rgba(79,109,245,0.09)",
  canvasGlowGold: "rgba(250,204,21,0.07)",
  canvasGlowHeat: "rgba(249,115,22,0.06)",

  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  gold: "#facc15",
  /** Gold-tinted panels (King CTAs, apply banners) */
  goldSurface: "rgba(250,204,21,0.08)",
  goldSurfaceMuted: "rgba(250,204,21,0.07)",
  /** Subtle strip (e.g. team King section) */
  goldSurfaceFaint: "rgba(250,204,21,0.06)",
  /** Icon wells, stronger highlights */
  goldSurfaceStrong: "rgba(250,204,21,0.14)",
  goldBorder: "rgba(250,204,21,0.28)",
  goldBorderSoft: "rgba(250,204,21,0.2)",
  /** Emphasis border (profile King chip) */
  goldBorderStrong: "rgba(250,204,21,0.38)",
  /** Crown glow / embossed halo */
  goldGlow: "rgba(250,204,21,0.32)",
  /** Primary text on solid gold buttons */
  textOnGold: "#0f172a",
  /** Amber-400 — trivia bulbs, podium accents, rank highlights */
  amberBright: "#fbbf24",
  /** Games tab trivia card (amber, distinct from King gold) */
  amberSurface: "rgba(251,191,36,0.1)",
  amberSurfaceMedium: "rgba(251,191,36,0.15)",
  amberBorder: "rgba(251,191,36,0.25)",
  /** Amber panels (ties, warnings) */
  warningSurface: "rgba(245,158,11,0.1)",
  warningSurfaceMedium: "rgba(245,158,11,0.15)",
  warningSurfaceStrong: "rgba(245,158,11,0.16)",
  warningBorder: "rgba(245,158,11,0.25)",
  warningBorderStrong: "rgba(245,158,11,0.30)",
  /** Podium rows (league, leaderboards, city/court boards) */
  podiumSilver: "#cbd5e1",
  podiumSilverSurface: "rgba(203,213,225,0.06)",
  /** Compact rank pill for 2nd place (slightly muted vs row accent) */
  podiumSecondBadge: "#9ca3af",
  podiumBronze: "#d97706",
  podiumBronzeSurface: "rgba(217,119,6,0.08)",
  /** Wallet / ledger lines */
  txPositive: "#4ade80",
  txNegative: "#f97373",

  /** Empty state panel — intentional, not dead dark */
  emptyPanel: "rgba(19,27,43,0.92)",
  emptyPanelBorder: "rgba(99,120,255,0.18)",
  emptyPanelGlow: "rgba(79,109,245,0.12)",
} as const;
