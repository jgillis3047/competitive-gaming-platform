import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";
import {
  buildAiReviewPrompt,
  jsonSchemaForValidator,
  type SportKey,
  type VisionMode,
  type ValidatorKind,
} from "../_shared/aiReviewPrompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AiReviewResult = {
  detected_sport: SportKey;
  summary: string;
  detected_score: string | null;
  confidence: number;
  flags: string[];
  recommendation: "approved" | "needs_review" | "rejected";
  activity_verified?: boolean;
  score_matches_reported?: boolean;
  both_players_visible?: boolean;
  detected_count?: number | null;
  detected_streak?: number | null;
  detected_time_sec?: number | null;
  detected_distance?: number | null;
  detected_level?: number | null;
};

function parseReportedNumber(reported: string | null): number | null {
  if (!reported?.trim()) return null;
  const time = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(reported.trim());
  if (time) {
    const total = Number(time[1]) * 60 + Number(time[2]);
    return Number.isFinite(total) ? total : null;
  }
  const m = reported.match(/[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function pickDetected(r: Record<string, unknown>): number | null {
  const fields = ["detected_count", "detected_streak", "detected_time_sec", "detected_distance", "detected_level"];
  for (const f of fields) {
    const v = r[f];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  if (typeof r.detected_score === "string") {
    const n = parseReportedNumber(r.detected_score);
    if (n != null) return n;
  }
  return null;
}

function scoresClose(reported: number, detected: number, tolerancePct = 12): boolean {
  const diff = Math.abs(reported - detected);
  const base = Math.max(reported, detected, 1);
  return (diff / base) * 100 <= tolerancePct;
}

async function callOpenAiVision(params: {
  imageUrls: string[];
  sportKey: SportKey;
  gameType?: string | null;
  recordSlug?: string | null;
  mode?: VisionMode | null;
  validatorKind?: ValidatorKind | null;
  validationRules?: string | null;
  activityTitle?: string | null;
  reportedScore: string | null;
}): Promise<AiReviewResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const rules = params.validationRules?.trim()
    ? params.validationRules
    : buildAiReviewPrompt({
        sportKey: params.sportKey,
        gameType: params.gameType,
        recordSlug: params.recordSlug,
        mode: params.mode,
        activityTitle: params.activityTitle,
      });

  const schema = jsonSchemaForValidator(params.validatorKind ?? null);

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${rules}

Reported score: ${params.reportedScore ?? "not provided"}

Set score_matches_reported by comparing your detected numeric value to the reported score (within ~12% for counts, ~3% for times).

Respond with JSON matching:
${schema}`,
    },
  ];

  for (const url of params.imageUrls.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url, detail: "low" } });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: 700,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as Record<string, unknown>;

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
  const flags: string[] = Array.isArray(parsed.flags) ? parsed.flags.map(String) : [];
  let recommendation = parsed.recommendation as AiReviewResult["recommendation"];
  if (!["approved", "needs_review", "rejected"].includes(recommendation)) {
    recommendation = confidence >= 0.85 && flags.length === 0 ? "approved" : "needs_review";
  }

  const reportedNum = parseReportedNumber(params.reportedScore);
  const detectedNum = pickDetected(parsed);
  let scoreMatches = Boolean(parsed.score_matches_reported);
  if (reportedNum != null && detectedNum != null) {
    scoreMatches = scoresClose(reportedNum, detectedNum, params.validatorKind === "vision_time" ? 3 : 12);
    if (!scoreMatches && recommendation === "approved") recommendation = "needs_review";
    if (!scoreMatches) flags.push("score_mismatch");
  }

  const activityVerified = parsed.activity_verified !== false;

  return {
    detected_sport: (parsed.detected_sport as SportKey) ?? params.sportKey,
    summary: String(parsed.summary ?? "Proof analyzed."),
    detected_score: parsed.detected_score ? String(parsed.detected_score) : detectedNum != null ? String(detectedNum) : null,
    confidence,
    flags,
    recommendation: !activityVerified && recommendation === "approved" ? "needs_review" : recommendation,
    activity_verified: activityVerified,
    score_matches_reported: scoreMatches,
    both_players_visible: Boolean(parsed.both_players_visible),
    detected_count: typeof parsed.detected_count === "number" ? parsed.detected_count : null,
    detected_streak: typeof parsed.detected_streak === "number" ? parsed.detected_streak : null,
    detected_time_sec: typeof parsed.detected_time_sec === "number" ? parsed.detected_time_sec : null,
    detected_distance: typeof parsed.detected_distance === "number" ? parsed.detected_distance : null,
    detected_level: typeof parsed.detected_level === "number" ? parsed.detected_level : null,
  };
}

function heuristicReview(params: {
  sportKey: SportKey;
  reportedScore: string | null;
  proofCount: number;
  activityTitle?: string | null;
}): AiReviewResult {
  const flags: string[] = [];
  if (params.proofCount === 0) flags.push("no_proof");
  if (!params.reportedScore) flags.push("score_not_provided");

  const label = params.activityTitle ?? "activity";

  return {
    detected_sport: params.sportKey,
    summary: params.proofCount > 0
      ? `${params.proofCount} proof file(s) for ${label}. Configure OPENAI_API_KEY for full AI validation.`
      : "No proof files attached.",
    detected_score: params.reportedScore,
    confidence: params.proofCount > 0 ? 0.55 : 0.3,
    flags,
    recommendation: "needs_review",
    activity_verified: params.proofCount > 0,
    score_matches_reported: false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    challengeId?: string | null;
    sportKey?: SportKey;
    gameType?: string | null;
    recordSlug?: string | null;
    activityTitle?: string | null;
    mode?: VisionMode | null;
    validatorKind?: ValidatorKind | null;
    validationRules?: string | null;
    reportedScore?: string | null;
    proofStoragePaths?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sportKey = body.sportKey ?? "other";
  const paths = (body.proofStoragePaths ?? []).filter(Boolean);
  const reportedScore = body.reportedScore ?? null;
  const activityTitle = body.activityTitle ?? body.gameType ?? body.recordSlug ?? null;

  const imageUrls = paths.map(
    (p) => `${supabaseUrl}/storage/v1/object/public/media/${p}`
  );

  let result: AiReviewResult;
  try {
    if (Deno.env.get("OPENAI_API_KEY") && imageUrls.length > 0) {
      result = await callOpenAiVision({
        imageUrls,
        sportKey,
        gameType: body.gameType,
        recordSlug: body.recordSlug,
        mode: body.mode,
        validatorKind: body.validatorKind,
        validationRules: body.validationRules,
        activityTitle,
        reportedScore,
      });
    } else {
      result = heuristicReview({ sportKey, reportedScore, proofCount: paths.length, activityTitle });
    }
  } catch (e) {
    result = heuristicReview({ sportKey, reportedScore, proofCount: paths.length, activityTitle });
    result.flags.push("ai_error");
    result.summary = `AI unavailable: ${(e as Error).message}. Manual review required.`;
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
