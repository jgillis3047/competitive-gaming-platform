import { getGameConfig } from "../data/gameConfig";

export function gameTitleForThread(
  gameType: string | null | undefined,
  payload?: { game_type?: string | null } | null
): string {
  const raw = gameType ?? payload?.game_type ?? null;
  const cfg = getGameConfig(raw);
  const fallback = raw ? String(raw).trim() : "";
  return cfg?.title ?? (fallback || "Game");
}

export function isMatchCompleteMessage(typeRaw?: string | null): boolean {
  const t = String(typeRaw ?? "").toLowerCase();
  return t === "challenge_completed" || t === "completed";
}

const GENERIC_EVENT_PREFIX =
  /^(challenge created|e-game challenge created|checked in|both players checked in|result submitted|score submitted|match completed|payout processed|challenge cancelled|disputed|opponent joined|your turn|rematch|submit the result|check in)/i;

export function mergeGameIntoTitle(gameTitle: string, title: string): string {
  const trimmed = String(title ?? "").trim();
  if (!trimmed || !gameTitle) return trimmed || gameTitle;

  const lower = trimmed.toLowerCase();
  const gameLower = gameTitle.toLowerCase();
  if (lower.startsWith(gameLower)) return trimmed;

  return `${gameTitle} — ${trimmed}`;
}

export function enrichThreadEventTitle(label: string, gameTitle: string): string {
  const trimmed = String(label ?? "").trim();
  if (!trimmed || !gameTitle) return trimmed || gameTitle;

  const lower = trimmed.toLowerCase();
  const gameLower = gameTitle.toLowerCase();
  if (lower.startsWith(gameLower)) return trimmed;

  if (GENERIC_EVENT_PREFIX.test(trimmed)) {
    return mergeGameIntoTitle(gameTitle, trimmed);
  }

  return trimmed;
}

export function formatThreadChallengeMeta(params: {
  gameType?: string | null;
  entryFeeCents?: number | null;
  prizeCents?: number | null;
}): string {
  const game = gameTitleForThread(params.gameType);
  const fee = `$${(Number(params.entryFeeCents ?? 0) / 100).toFixed(2)}`;
  const prize = `$${(Number(params.prizeCents ?? 0) / 100).toFixed(2)}`;
  return `${game} • Fee ${fee} • Prize ${prize}`;
}

export function threadEventIconName(msgType?: string | null): string {
  const t = String(msgType ?? "").toLowerCase();
  if (t === "challenge_completed" || t === "completed") return "trophy";
  if (t === "challenge_created") return "game-controller";
  if (t === "challenge_accepted") return "hand-left";
  if (t === "check_in" || t === "both_checked_in") return "location";
  if (t === "result_submitted" || t === "score_submitted") return "clipboard";
  if (t === "payout_processed") return "cash";
  if (t === "disputed") return "alert-circle";
  if (t === "cancelled") return "close-circle";
  if (t === "prompt_play_turn" || t === "turn_prompt") return "play";
  return "flash";
}
