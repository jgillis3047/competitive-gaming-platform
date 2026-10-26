// lib/backend/aiVision.ts — Client for AI Vision edge functions

import Constants from "expo-constants";
import { supabase } from "./supabaseClient";
import type { AiReviewResponse, SportKey } from "../models/visionTypes";
import type { AiValidatorKind } from "../data/inPersonAiValidation";
import type { InPersonVisionMode } from "../data/inPersonVisionConfig";

function getSupabaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (fromEnv) return fromEnv;
  return (Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL as string) ?? "";
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return token;
}

export async function invokeAiReviewMatch(params: {
  challengeId?: string | null;
  sportKey: SportKey;
  gameType?: string | null;
  recordSlug?: string | null;
  activityTitle?: string | null;
  mode?: InPersonVisionMode;
  validatorKind?: AiValidatorKind;
  validationRules?: string | null;
  reportedScore?: string | null;
  proofStoragePaths: string[];
}): Promise<AiReviewResponse> {
  const token = await getAccessToken();
  const url = `${getSupabaseUrl()}/functions/v1/ai-review-match`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challengeId: params.challengeId ?? null,
      sportKey: params.sportKey,
      gameType: params.gameType ?? null,
      recordSlug: params.recordSlug ?? null,
      activityTitle: params.activityTitle ?? null,
      mode: params.mode ?? null,
      validatorKind: params.validatorKind ?? null,
      validationRules: params.validationRules ?? null,
      reportedScore: params.reportedScore ?? null,
      proofStoragePaths: params.proofStoragePaths,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `AI review failed (${res.status})`);
  }
  return json as AiReviewResponse;
}

export async function invokeAnalyzeShootingSession(params: {
  sessionId: string;
  videoPath: string;
  sessionType: string;
  timeLimitSec?: number | null;
  recordSlug?: string | null;
}): Promise<{ ok: boolean; sessionId: string }> {
  const token = await getAccessToken();
  const url = `${getSupabaseUrl()}/functions/v1/analyze-shooting-session`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `Shot analysis failed (${res.status})`);
  }
  return json as { ok: boolean; sessionId: string };
}

export async function invokeAiReviewGolf(params: {
  sessionId: string;
  proofStoragePaths: string[];
  reportedScores?: Record<string, number>;
}): Promise<{
  verdict: string;
  confidence: number;
  summary: string;
  detected_scores: Record<string, number> | null;
  flags: string[];
}> {
  const token = await getAccessToken();
  const url = `${getSupabaseUrl()}/functions/v1/ai-review-golf`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `Golf AI review failed (${res.status})`);
  }
  return json;
}

/** Public URL for a storage path in the media bucket. */
export function mediaPublicUrl(storagePath: string): string {
  const base = getSupabaseUrl();
  return `${base}/storage/v1/object/public/media/${storagePath}`;
}
