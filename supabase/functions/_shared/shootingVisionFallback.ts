// OpenAI vision fallback for basketball shooting when YOLO/OpenCV tracker unavailable

export type ShootingAnalysis = {
  total_shots: number;
  makes: number;
  misses: number;
  fg_percent: number;
  best_streak: number;
  confidence: number;
  shots: {
    shot_number: number;
    result: "make" | "miss";
    confidence: number;
    timestamp_start: number;
    timestamp_end: number;
    behind_arc?: boolean | null;
    behind_arc_confidence?: number;
  }[];
  source: "openai_vision";
  qualified_makes?: number;
  video_duration_sec?: number;
  rule_flags?: string[];
};

function sessionPrompt(sessionType: string): string {
  const typeLabel =
    sessionType === "three_point"
      ? "3-pointers"
      : sessionType === "free_throw"
        ? "free throws"
        : sessionType === "midrange"
          ? "midrange shots"
          : "basketball shots";

  const arcRules =
    sessionType === "three_point"
      ? `
- ONLY count makes from behind the 3-point arc — layups and inside-arc shots do NOT count.
- Camera should be sideline/baseline with the arc visible; flag if only layups or close-range shots.
- Shooter full body must be visible at release.`
      : "";

  return `You are analyzing basketball shooting footage (${typeLabel}).
Watch the entire video and count:
- total_shot_attempts (release motions toward the hoop)
- makes (ball clearly goes through the hoop / net snap)
- misses
- longest consecutive make streak

Rules:
- Only count real shot attempts toward a visible hoop.
- If hoop is not visible or footage is unusable, set confidence below 0.35.
- Be conservative — uncertain makes count as misses.${arcRules}

Return JSON only:
{
  "total_shots": integer,
  "makes": integer,
  "misses": integer,
  "best_streak": integer,
  "confidence": 0.0-1.0,
  "summary": "short explanation",
  "video_duration_sec": number or null
}`;
}

function computeFg(makes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((makes / total) * 1000) / 10;
}

function buildShots(makes: number, misses: number): ShootingAnalysis["shots"] {
  const shots: ShootingAnalysis["shots"] = [];
  let m = makes;
  let x = misses;
  let n = 1;
  while (m > 0 || x > 0) {
    if (m >= x) {
      shots.push({
        shot_number: n++,
        result: "make",
        confidence: 0.65,
        timestamp_start: 0,
        timestamp_end: 0,
      });
      m--;
    } else {
      shots.push({
        shot_number: n++,
        result: "miss",
        confidence: 0.6,
        timestamp_start: 0,
        timestamp_end: 0,
      });
      x--;
    }
  }
  return shots;
}

/** Try OpenAI vision on video via file upload (gpt-4o family). */
export async function openAiShootingVisionFallback(
  videoUrl: string,
  sessionType: string
): Promise<ShootingAnalysis | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) return null;

  const videoBytes = await videoRes.arrayBuffer();
  const maxBytes = 20 * 1024 * 1024;
  if (videoBytes.byteLength > maxBytes) {
    console.warn("shootingVisionFallback: video exceeds 20MB cap");
    return null;
  }

  const contentType = videoRes.headers.get("content-type") ?? "video/mp4";
  const form = new FormData();
  form.append("purpose", "vision");
  form.append("file", new Blob([videoBytes], { type: contentType }), "shooting-session.mp4");

  const fileRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const fileJson = await fileRes.json().catch(() => ({}));
  const fileId = fileJson?.id as string | undefined;
  if (!fileId) {
    console.warn("shootingVisionFallback: file upload failed", fileJson);
    return await openAiShootingVisionUrlFallback(videoUrl, sessionType, apiKey);
  }

  const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o-mini";

  const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
            { type: "text", text: sessionPrompt(sessionType) },
            { type: "file", file: { file_id: fileId } },
          ],
        },
      ],
      max_tokens: 700,
      response_format: { type: "json_object" },
    }),
  });

  // Cleanup file (best effort)
  fetch(`https://api.openai.com/v1/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => {});

  if (!chatRes.ok) {
    console.warn("shootingVisionFallback: chat failed", await chatRes.text());
    return await openAiShootingVisionUrlFallback(videoUrl, sessionType, apiKey);
  }

  return parseShootingVisionResponse(await chatRes.json(), sessionType);
}

/** Secondary attempt: some deployments accept direct video URL on vision models. */
async function openAiShootingVisionUrlFallback(
  videoUrl: string,
  sessionType: string,
  apiKey: string
): Promise<ShootingAnalysis | null> {
  const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o-mini";
  const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
            { type: "text", text: `${sessionPrompt(sessionType)}\nVideo URL: ${videoUrl}` },
            { type: "image_url", image_url: { url: videoUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 700,
      response_format: { type: "json_object" },
    }),
  });

  if (!chatRes.ok) return null;
  return parseShootingVisionResponse(await chatRes.json(), sessionType);
}

function parseShootingVisionResponse(
  chatJson: Record<string, unknown>,
  _sessionType: string
): ShootingAnalysis | null {
  const text = (chatJson as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message
    ?.content;
  if (!text) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const makes = Math.max(0, Math.round(Number(parsed.makes ?? 0)));
  const misses = Math.max(0, Math.round(Number(parsed.misses ?? 0)));
  let total = Math.max(0, Math.round(Number(parsed.total_shots ?? makes + misses)));
  if (total === 0 && makes + misses > 0) total = makes + misses;
  const bestStreak = Math.max(0, Math.round(Number(parsed.best_streak ?? 0)));
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.55)));

  if (total === 0 && makes === 0) return null;

  const videoDurationSec =
    typeof parsed.video_duration_sec === "number" && Number.isFinite(parsed.video_duration_sec)
      ? parsed.video_duration_sec
      : undefined;

  return {
    total_shots: total,
    makes,
    misses: misses || Math.max(0, total - makes),
    fg_percent: computeFg(makes, total),
    best_streak: bestStreak || makes,
    confidence,
    shots: buildShots(makes, misses || Math.max(0, total - makes)),
    source: "openai_vision",
    qualified_makes: makes,
    video_duration_sec: videoDurationSec,
    rule_flags: [],
  };
}
