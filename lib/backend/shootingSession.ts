// lib/backend/shootingSession.ts — Basketball shot tracking sessions

import { invokeAnalyzeShootingSession } from "./aiVision";
import { supabase } from "./supabaseClient";
import type { ShootingSessionRow, ShootingSessionType, TrackedShotRow } from "../models/visionTypes";

export async function createShootingSession(params: {
  userId: string;
  sessionType: ShootingSessionType;
  challengeId?: string | null;
  videoPath?: string | null;
  timeLimitSec?: number | null;
  videoDurationSec?: number | null;
}): Promise<ShootingSessionRow> {
  const { data, error } = await supabase
    .from("shooting_sessions")
    .insert({
      user_id: params.userId,
      challenge_id: params.challengeId ?? null,
      video_path: params.videoPath ?? null,
      session_type: params.sessionType,
      status: params.videoPath ? "processing" : "uploading",
      time_limit_sec: params.timeLimitSec ?? null,
      video_duration_sec: params.videoDurationSec ?? null,
      rule_flags: [],
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return normalizeShootingSession(data as Record<string, unknown>);
}

export async function updateShootingSessionVideo(
  sessionId: string,
  videoPath: string
): Promise<void> {
  const { error } = await supabase
    .from("shooting_sessions")
    .update({ video_path: videoPath, status: "processing" })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function triggerShootingAnalysis(params: {
  sessionId: string;
  videoPath: string;
  sessionType: ShootingSessionType;
  timeLimitSec?: number | null;
  recordSlug?: string | null;
}): Promise<void> {
  await invokeAnalyzeShootingSession({
    sessionId: params.sessionId,
    videoPath: params.videoPath,
    sessionType: params.sessionType,
    timeLimitSec: params.timeLimitSec ?? null,
    recordSlug: params.recordSlug ?? null,
  });
}

function normalizeShootingSession(row: Record<string, unknown>): ShootingSessionRow {
  const flags = row.rule_flags;
  return {
    ...(row as ShootingSessionRow),
    rule_flags: Array.isArray(flags) ? flags.map(String) : [],
  };
}

export async function fetchShootingSession(sessionId: string): Promise<ShootingSessionRow | null> {
  const { data, error } = await supabase
    .from("shooting_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeShootingSession(data as Record<string, unknown>);
}

export async function fetchUserShootingSessions(
  userId: string,
  limit = 20
): Promise<ShootingSessionRow[]> {
  const { data, error } = await supabase
    .from("shooting_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeShootingSession(row as Record<string, unknown>));
}

export async function fetchTrackedShots(sessionId: string): Promise<TrackedShotRow[]> {
  const { data, error } = await supabase
    .from("tracked_shots")
    .select("*")
    .eq("session_id", sessionId)
    .order("shot_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrackedShotRow[];
}

export async function attachSessionToChallenge(
  sessionId: string,
  challengeId: string
): Promise<void> {
  const { error } = await supabase
    .from("shooting_sessions")
    .update({ challenge_id: challengeId })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export function formatFgPercent(makes: number | null, total: number | null): string {
  if (makes == null || total == null || total === 0) return "—";
  return `${((makes / total) * 100).toFixed(1)}%`;
}

export function sessionTypeLabel(t: ShootingSessionType): string {
  switch (t) {
    case "free_throw":
      return "Free Throws";
    case "three_point":
      return "3-Pointers";
    case "midrange":
      return "Midrange";
    default:
      return "Mixed Shooting";
  }
}
