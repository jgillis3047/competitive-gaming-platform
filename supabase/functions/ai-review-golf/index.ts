import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    sessionId?: string;
    proofStoragePaths?: string[];
    reportedScores?: Record<string, number>;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const paths = (body.proofStoragePaths ?? []).filter(Boolean);
  const reportedScores = body.reportedScores ?? {};
  const imageUrls = paths.map((p) => `${supabaseUrl}/storage/v1/object/public/media/${p}`);

  let summary = "Golf round submitted for review.";
  let confidence = 0.5;
  const flags: string[] = [];
  let detected_scores: Record<string, number> | null = { ...reportedScores };
  let verdict: "approved" | "needs_review" | "rejected" = "needs_review";

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (apiKey && imageUrls.length > 0) {
    try {
      const content: Array<Record<string, unknown>> = [
        {
          type: "text",
          text: `Analyze this golf proof (scorecard photo or swing video).
Reported scores: ${JSON.stringify(reportedScores)}
Return JSON: { "summary": "...", "confidence": 0.0-1.0, "flags": [], "detected_scores": {}, "verdict": "approved|needs_review|rejected" }`,
        },
      ];
      for (const url of imageUrls.slice(0, 3)) {
        content.push({ type: "image_url", image_url: { url, detail: "low" } });
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o-mini",
          messages: [{ role: "user", content }],
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
        summary = String(parsed.summary ?? summary);
        confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
        if (Array.isArray(parsed.flags)) flags.push(...parsed.flags);
        if (parsed.detected_scores && typeof parsed.detected_scores === "object") {
          detected_scores = parsed.detected_scores;
        }
        if (["approved", "needs_review", "rejected"].includes(parsed.verdict)) {
          verdict = parsed.verdict;
        }
      }
    } catch {
      flags.push("ai_error");
    }
  } else {
    if (paths.length === 0) flags.push("no_scorecard");
    summary = paths.length > 0
      ? "Scorecard uploaded. Configure OPENAI_API_KEY for automatic score reading."
      : "No scorecard uploaded — manual confirmation required.";
  }

  if (confidence >= 0.85 && flags.length === 0 && verdict === "needs_review") {
    verdict = "approved";
  }

  return new Response(
    JSON.stringify({ verdict, confidence, summary, detected_scores, flags }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
