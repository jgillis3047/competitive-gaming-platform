import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";
import { openAiShootingVisionFallback } from "../_shared/shootingVisionFallback.ts";
import { runShootingRuleReview } from "../_shared/shootingRuleReview.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ShotResult = {
  shot_number: number;
  result: "make" | "miss";
  confidence: number;
  timestamp_start: number;
  timestamp_end: number;
  behind_arc?: boolean | null;
  behind_arc_confidence?: number;
};

type AnalysisPayload = {
  total_shots: number;
  makes: number;
  misses: number;
  fg_percent: number;
  best_streak: number;
  confidence: number;
  shots: ShotResult[];
  analysis_source?: string;
  qualified_makes?: number;
  video_duration_sec?: number;
  rule_flags?: string[];
};

async function callShotTrackerService(
  videoUrl: string,
  sessionType: string,
  recordSlug?: string | null
): Promise<AnalysisPayload> {
  const trackerUrl = Deno.env.get("SHOT_TRACKER_URL");
  if (!trackerUrl) throw new Error("SHOT_TRACKER_URL not configured");

  const res = await fetch(`${trackerUrl.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_url: videoUrl,
      session_type: sessionType,
      record_slug: recordSlug ?? null,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shot tracker error: ${err.slice(0, 300)}`);
  }

  const json = await res.json();
  return { ...json, analysis_source: json.analysis_source ?? "shot_tracker" };
}

function isWeakTrackerResult(analysis: AnalysisPayload): boolean {
  return (
    analysis.total_shots === 0 ||
    (analysis.confidence < 0.45 && analysis.makes === 0)
  );
}

function mergeRuleFlags(analysis: AnalysisPayload, extra: string[]): string[] {
  const base = Array.isArray(analysis.rule_flags) ? analysis.rule_flags.map(String) : [];
  return [...new Set([...base, ...extra])];
}

function buildArcSummary(shots: ShotResult[]): string | null {
  const arcShots = shots.filter((s) => s.behind_arc != null);
  if (!arcShots.length) return null;
  const behind = arcShots.filter((s) => s.behind_arc === true).length;
  const inside = arcShots.filter((s) => s.behind_arc === false).length;
  const unknown = shots.length - arcShots.length;
  return `${behind} behind arc, ${inside} inside arc, ${unknown} unverified`;
}

async function persistAnalysis(
  admin: ReturnType<typeof createClient>,
  sessionId: string,
  analysis: AnalysisPayload,
  opts?: {
    errorMessage?: string | null;
    timeLimitSec?: number | null;
    ruleFlags?: string[];
  }
) {
  const ruleFlags = mergeRuleFlags(analysis, opts?.ruleFlags ?? []);
  const qualifiedMakes = analysis.qualified_makes ?? analysis.makes;

  const { error: upErr } = await admin
    .from("shooting_sessions")
    .update({
      status: "complete",
      total_shots: analysis.total_shots,
      makes: analysis.makes,
      misses: analysis.misses,
      fg_percent: analysis.fg_percent,
      best_streak: analysis.best_streak,
      confidence: analysis.confidence,
      qualified_makes: qualifiedMakes,
      video_duration_sec: analysis.video_duration_sec ?? null,
      time_limit_sec: opts?.timeLimitSec ?? null,
      rule_flags: ruleFlags,
      error_message: opts?.errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (upErr) throw new Error(upErr.message);

  if (analysis.shots.length > 0) {
    await admin.from("tracked_shots").delete().eq("session_id", sessionId);
    await admin.from("tracked_shots").insert(
      analysis.shots.map((s) => ({
        session_id: sessionId,
        shot_number: s.shot_number,
        result: s.result,
        confidence: s.confidence,
        timestamp_start: s.timestamp_start,
        timestamp_end: s.timestamp_end,
        behind_arc: s.behind_arc ?? null,
        behind_arc_confidence: s.behind_arc_confidence ?? null,
      }))
    );
  }
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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    sessionId?: string;
    videoPath?: string;
    sessionType?: string;
    timeLimitSec?: number | null;
    recordSlug?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionId = body.sessionId;
  const videoPath = body.videoPath;
  const sessionType = body.sessionType ?? "free_throw";
  const recordSlug = body.recordSlug ?? null;
  const timeLimitSec = body.timeLimitSec ?? null;

  if (!sessionId || !videoPath) {
    return new Response(JSON.stringify({ error: "Missing sessionId or videoPath" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: session } = await admin
    .from("shooting_sessions")
    .select("id, user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const videoUrl = `${supabaseUrl}/storage/v1/object/public/media/${videoPath}`;

  let analysis: AnalysisPayload | null = null;
  let trackerError: string | null = null;

  try {
    analysis = await callShotTrackerService(videoUrl, sessionType, recordSlug);
    if (isWeakTrackerResult(analysis)) {
      trackerError = "Shot tracker returned low-confidence or zero shots";
    }
  } catch (e) {
    trackerError = (e as Error).message;
  }

  let usedOpenAi = analysis?.analysis_source === "openai_vision";
  if (!analysis || isWeakTrackerResult(analysis)) {
    const openAi = await openAiShootingVisionFallback(videoUrl, sessionType);
    if (openAi && openAi.makes + openAi.total_shots > 0) {
      analysis = {
        total_shots: openAi.total_shots,
        makes: openAi.makes,
        misses: openAi.misses,
        fg_percent: openAi.fg_percent,
        best_streak: openAi.best_streak,
        confidence: openAi.confidence,
        shots: openAi.shots,
        analysis_source: "openai_vision",
        qualified_makes: openAi.makes,
        video_duration_sec: openAi.video_duration_sec,
        rule_flags: openAi.rule_flags ?? [],
      };
      usedOpenAi = true;
    }
  }

  if (!analysis || (analysis.total_shots === 0 && analysis.makes === 0)) {
    await admin
      .from("shooting_sessions")
      .update({
        status: "failed",
        error_message:
          trackerError ??
          "Could not analyze video — deploy SHOT_TRACKER_URL or set OPENAI_API_KEY for vision fallback.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    return new Response(
      JSON.stringify({
        ok: false,
        sessionId,
        error: trackerError ?? "Analysis failed",
        openai_attempted: Boolean(Deno.env.get("OPENAI_API_KEY")),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const extraFlags: string[] = [...(analysis.rule_flags ?? [])];
  const enforceRules =
    sessionType === "three_point" ||
    sessionType === "free_throw" ||
    recordSlug === "halfcourt_makes_10";

  if (timeLimitSec && analysis.video_duration_sec != null && analysis.video_duration_sec > timeLimitSec + 2) {
    extraFlags.push(`video_over_time_limit:${Math.round(analysis.video_duration_sec)}s`);
  }

  let ruleReviewNote: string | null = null;
  if (enforceRules && Deno.env.get("OPENAI_API_KEY")) {
    const ruleReview = await runShootingRuleReview({
      videoUrl,
      sessionType,
      activityTitle: recordSlug?.replace(/_/g, " ") ?? sessionType.replace(/_/g, " "),
      timeLimitSec,
      trackerMakes: analysis.makes,
      trackerTotalShots: analysis.total_shots,
      videoDurationSec: analysis.video_duration_sec ?? null,
      arcSummary: buildArcSummary(analysis.shots),
    });

    if (ruleReview) {
      extraFlags.push(...ruleReview.flags);
      ruleReviewNote = ruleReview.summary;
      if (!ruleReview.activity_verified) {
        extraFlags.push("activity_not_verified");
        if (ruleReview.recommendation === "rejected") {
          extraFlags.push("rule_review_rejected");
        }
      }
    }
  }

  const note = usedOpenAi
    ? trackerError
      ? `OpenAI vision fallback (tracker unavailable: ${trackerError.slice(0, 120)})`
      : analysis?.analysis_source === "openai_vision"
        ? "OpenAI vision fallback (Python frame sampling)"
        : "OpenAI vision fallback (tracker low confidence)"
    : null;

  const errorMessage = [
    note,
    ruleReviewNote,
    extraFlags.includes("activity_not_verified") ? "Rule review: activity could not be verified." : null,
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || null;

  try {
    await persistAnalysis(admin, sessionId, analysis, {
      errorMessage,
      timeLimitSec,
      ruleFlags: extraFlags,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      sessionId,
      analysis,
      source: analysis.analysis_source ?? "shot_tracker",
      fallback_used: usedOpenAi,
      rule_flags: extraFlags,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
