// Second-pass vision review for shooting drill rule compliance (arc, timer, shot type)

export type ShootingRuleReviewResult = {
  activity_verified: boolean;
  recommendation: "approved" | "needs_review" | "rejected";
  confidence: number;
  summary: string;
  flags: string[];
};

function ruleReviewPrompt(params: {
  sessionType: string;
  activityTitle: string;
  timeLimitSec?: number | null;
  trackerMakes: number;
  trackerTotalShots: number;
  videoDurationSec?: number | null;
  arcSummary?: string | null;
}): string {
  const timeRule = params.timeLimitSec
    ? `Timed challenge: max ${params.timeLimitSec}s. Video duration reported: ${params.videoDurationSec ?? "unknown"}s.`
    : "";

  const typeLabel =
    params.sessionType === "three_point"
      ? "3-pointers in 60s"
      : params.sessionType === "free_throw"
        ? "free throws"
        : params.sessionType === "midrange"
          ? "midrange shots"
          : "basketball shooting";

  return `You are reviewing basketball proof for rule compliance: "${params.activityTitle}" (${typeLabel}).
Shot tracker counted ${params.trackerMakes} makes out of ${params.trackerTotalShots} attempts.
${timeRule}
${params.arcSummary ? `Arc check: ${params.arcSummary}` : ""}

Rules — set activity_verified=false and add flags if ANY apply:
- Shots are layups, dunks, or inside-the-arc attempts presented as 3-pointers
- Video clearly exceeds the timed window
- 3-point arc not visible (cannot verify distance)
- Shooter full body not visible at release
- Wrong camera angle (behind basket only, no sideline/baseline arc view)
- Obvious edits, replays, or non-basketball footage

Return JSON only:
{
  "activity_verified": boolean,
  "recommendation": "approved" | "needs_review" | "rejected",
  "confidence": 0.0-1.0,
  "summary": "1-2 sentences",
  "flags": ["string"]
}`;
}

export async function runShootingRuleReview(params: {
  videoUrl: string;
  sessionType: string;
  activityTitle: string;
  timeLimitSec?: number | null;
  trackerMakes: number;
  trackerTotalShots: number;
  videoDurationSec?: number | null;
  arcSummary?: string | null;
}): Promise<ShootingRuleReviewResult | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const videoRes = await fetch(params.videoUrl);
  if (!videoRes.ok) return null;

  const videoBytes = await videoRes.arrayBuffer();
  const maxBytes = 20 * 1024 * 1024;
  if (videoBytes.byteLength > maxBytes) {
    console.warn("shootingRuleReview: video exceeds 20MB cap");
    return null;
  }

  const contentType = videoRes.headers.get("content-type") ?? "video/mp4";
  const form = new FormData();
  form.append("purpose", "vision");
  form.append("file", new Blob([videoBytes], { type: contentType }), "shooting-rules.mp4");

  const fileRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const fileJson = await fileRes.json().catch(() => ({}));
  const fileId = fileJson?.id as string | undefined;

  const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o-mini";
  const prompt = ruleReviewPrompt(params);

  let chatRes: Response;
  if (fileId) {
    chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "file", file: { file_id: fileId } },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });
    fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  } else {
    chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `${prompt}\nVideo URL: ${params.videoUrl}` },
              { type: "image_url", image_url: { url: params.videoUrl, detail: "low" } },
            ],
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });
  }

  if (!chatRes.ok) {
    console.warn("shootingRuleReview: chat failed", await chatRes.text());
    return null;
  }

  const chatJson = await chatRes.json();
  const text = chatJson?.choices?.[0]?.message?.content;
  if (!text) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const activityVerified = parsed.activity_verified !== false;
  let recommendation = parsed.recommendation as ShootingRuleReviewResult["recommendation"];
  if (!["approved", "needs_review", "rejected"].includes(recommendation)) {
    recommendation = activityVerified ? "approved" : "needs_review";
  }
  if (!activityVerified && recommendation === "approved") {
    recommendation = "needs_review";
  }

  const flags: string[] = Array.isArray(parsed.flags) ? parsed.flags.map(String) : [];
  if (!activityVerified && !flags.length) flags.push("activity_not_verified");

  return {
    activity_verified: activityVerified,
    recommendation,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6))),
    summary: String(parsed.summary ?? "Rule review complete."),
    flags,
  };
}
