// lib/data/practiceHistory.ts — Local practice attempt log + unified history loader

import AsyncStorage from "@react-native-async-storage/async-storage";

import { formatFgPercent, sessionTypeLabel } from "../backend/shootingSession";
import { fetchUserGolfSessions, golfFormatLabel } from "../backend/golfSession";
import { fetchUserShootingSessions } from "../backend/shootingSession";
import { formatCourtScore, formatSecondsAsMmSs } from "../backend/courts";
import { formatGameTime } from "./finishGameSession";
import { getLeaderboardCategory } from "./leaderboardTaxonomy";

export type PracticeHistoryKind = "phone" | "activity" | "shooting" | "golf";

export type PracticeHistoryEntry = {
  id: string;
  kind: PracticeHistoryKind;
  title: string;
  scoreLabel?: string | null;
  subtitle?: string | null;
  aiSummary?: string | null;
  aiVerdict?: string | null;
  isPersonalBest?: boolean;
  createdAt: string;
  route?: string | null;
};

const HISTORY_KEY = "arena:practice_history";
const MAX_LOCAL_ENTRIES = 200;

async function readLocalHistory(): Promise<PracticeHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PracticeHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendPracticeHistoryEntry(
  entry: Omit<PracticeHistoryEntry, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<PracticeHistoryEntry> {
  const row: PracticeHistoryEntry = {
    id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    kind: entry.kind,
    title: entry.title,
    scoreLabel: entry.scoreLabel ?? null,
    subtitle: entry.subtitle ?? null,
    aiSummary: entry.aiSummary ?? null,
    aiVerdict: entry.aiVerdict ?? null,
    isPersonalBest: entry.isPersonalBest ?? false,
    route: entry.route ?? null,
  };

  const list = await readLocalHistory();
  list.unshift(row);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_LOCAL_ENTRIES)));
  return row;
}

export async function fetchLocalPracticeHistory(): Promise<PracticeHistoryEntry[]> {
  return readLocalHistory();
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatPracticeHistoryMeta(entry: PracticeHistoryEntry): string {
  const parts: string[] = [formatRelativeTime(entry.createdAt)];
  if (entry.isPersonalBest) parts.push("Personal best");
  if (entry.aiVerdict === "approved") parts.push("AI verified");
  else if (entry.aiVerdict === "needs_review") parts.push("AI review");
  return parts.join(" · ");
}

export function kindEmoji(kind: PracticeHistoryKind): string {
  switch (kind) {
    case "phone":
      return "📱";
    case "activity":
      return "🏃";
    case "shooting":
      return "🏀";
    case "golf":
      return "⛳";
    default:
      return "🎯";
  }
}

async function shootingHistoryEntries(userId: string): Promise<PracticeHistoryEntry[]> {
  const rows = await fetchUserShootingSessions(userId, 40);
  return rows.map((s) => {
    const complete = s.status === "complete";
    const makes = s.makes ?? 0;
    const total = s.total_shots ?? 0;
    return {
      id: `shooting:${s.id}`,
      kind: "shooting" as const,
      title: sessionTypeLabel(s.session_type),
      scoreLabel: complete ? `${makes}/${total} makes` : String(s.status),
      subtitle: complete ? `FG ${formatFgPercent(makes, total)}` : null,
      aiSummary: s.error_message?.toLowerCase().includes("openai")
        ? "AI vision fallback"
        : complete
          ? "Shot tracker analysis"
          : null,
      aiVerdict: complete ? "approved" : s.status === "failed" ? "rejected" : null,
      isPersonalBest: false,
      createdAt: s.completed_at ?? s.created_at ?? new Date().toISOString(),
      route: `/vision/shooting-session/${s.id}`,
    };
  });
}

async function golfHistoryEntries(userId: string): Promise<PracticeHistoryEntry[]> {
  const rows = await fetchUserGolfSessions(userId, 40);
  return rows.map((s) => ({
    id: `golf:${s.id}`,
    kind: "golf" as const,
    title: s.course_name?.trim() || "Golf round",
    scoreLabel: golfFormatLabel(s.format),
    subtitle: s.status === "completed" || s.status === "reviewed" ? "Round submitted" : s.status,
    aiSummary: null,
    aiVerdict: s.status === "completed" || s.status === "reviewed" ? "approved" : null,
    isPersonalBest: false,
    createdAt: s.ended_at ?? s.started_at ?? s.created_at ?? new Date().toISOString(),
    route: s.status === "active" ? `/golf/${s.id}/score` : `/golf/${s.id}/submit`,
  }));
}

export async function loadUnifiedPracticeHistory(
  userId: string | null | undefined,
  limit = 60
): Promise<PracticeHistoryEntry[]> {
  const local = await fetchLocalPracticeHistory();
  let remote: PracticeHistoryEntry[] = [];

  if (userId) {
    try {
      const [shooting, golf] = await Promise.all([
        shootingHistoryEntries(userId),
        golfHistoryEntries(userId),
      ]);
      remote = [...shooting, ...golf];
    } catch {
      // Offline or auth — local only
    }
  }

  const remoteIds = new Set(remote.map((r) => r.id));
  const localOnly = local.filter((e) => !remoteIds.has(e.id));

  return [...localOnly, ...remote]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function formatPhoneHistoryScore(
  gameKey: string,
  score: number | null,
  timeSec: number | null
): string | null {
  if (timeSec != null) return formatGameTime(timeSec);
  if (score != null) return String(score);
  return null;
}

export function formatActivityHistoryScore(recordSlug: string, scoreValue: number): string {
  const cat = getLeaderboardCategory(recordSlug);
  if (
    cat &&
    !cat.higherIsBetter &&
    (cat.scoreUnit === "seconds" || cat.scoreUnit === "minutes")
  ) {
    if (cat.scoreUnit === "minutes") return `${scoreValue} min`;
    if (recordSlug === "mile_run") return formatSecondsAsMmSs(scoreValue);
    return formatSecondsAsMmSs(scoreValue);
  }
  return formatCourtScore(scoreValue, recordSlug);
}
