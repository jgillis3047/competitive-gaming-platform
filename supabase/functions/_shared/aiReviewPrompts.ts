// Shared AI proof prompts for edge functions (keep in sync with lib/data/aiReviewPrompts.ts)

export type SportKey =
  | "basketball"
  | "golf"
  | "running"
  | "fitness"
  | "pickleball"
  | "tennis"
  | "soccer"
  | "volleyball"
  | "frisbee"
  | "other";

export type VisionMode =
  | "match_proof"
  | "timed_shooting"
  | "golf_round"
  | "golf_shot"
  | "activity_proof";

const SHOOTING_SESSION_SLUGS = new Set([
  "three_pointers_60s",
  "three_point_streak",
  "free_throws_100",
  "free_throw_streak",
  "halfcourt_makes_10",
  "around_the_world_spots",
]);

const GOLF_SLUGS = new Set([
  "carry_distance_yards",
  "long_drive_yards",
  "closest_to_pin_feet",
  "putt_20ft_makes_20",
  "putt_ladder_points",
  "fairway_target_hits_20",
]);

const WEARABLE_RUN_SLUGS = new Set([
  "mile_run",
  "five_k_run",
  "four_hundred_m_run",
  "one_hundred_m_dash",
  "stair_sprint_10_flights",
  "shuttle_run_5_10_5",
  "beep_test_level",
]);

const FITNESS_SLUGS = new Set([
  "burpees_2m",
  "pushups_2m",
  "plank_hold_seconds",
  "bench_reps_135",
  "squat_reps_185",
  "deadlift_reps_225",
  "pullups_strict",
  "rope_skips_2m",
  "kettlebell_swings_2m",
  "wall_balls_2m",
  "box_jump_height_inches",
  "row_500m_seconds",
  "assault_bike_calories_2m",
]);

export function buildAiReviewPrompt(params: {
  sportKey: SportKey;
  gameType?: string | null;
  recordSlug?: string | null;
  mode?: VisionMode | null;
  activityTitle?: string | null;
}): string {
  const title = params.activityTitle?.trim() || params.gameType?.trim() || params.recordSlug || "In-person activity";
  const slug = params.recordSlug ?? "";
  const reported = "Reported score is provided separately — compare when visible.";

  if (params.mode === "timed_shooting" || SHOOTING_SESSION_SLUGS.has(slug)) {
    const arcCheck =
      slug === "three_pointers_60s" || slug === "halfcourt_makes_10"
        ? `
- Verify shots are 3-pointers from BEHIND the arc (not layups or inside-arc).
- Sideline/baseline angle with arc visible; shooter full body at release.
- Set activity_verified=false if layups/inside-arc shots are used for a 3pt challenge.`
        : "";
    return `Analyze this basketball shooting proof for "${title}".
- Is footage from a real hoop/court with a fixed sideline/baseline camera angle?
- Count visible MADE baskets vs misses if possible.
- Note if a timer window applies (e.g. 60 seconds) and flag if exceeded.${arcCheck}
- Flag obvious cuts, replays, or non-basketball footage.
${reported}
Return JSON only.`;
  }

  if (params.mode === "golf_shot" || params.mode === "golf_round" || GOLF_SLUGS.has(slug) || params.sportKey === "golf") {
    return `Analyze this golf proof for "${title}".
- Scorecard: read player names, hole scores, totals if visible.
- Swing video: verify real golf swing, ball flight, range/course setting.
- Closest-to-pin / carry: check distance markers or range display if shown.
- Flag edits, wrong sport, or unreadable scorecard.
${reported}
Return JSON only.`;
  }

  if (WEARABLE_RUN_SLUGS.has(slug)) {
    return `Running activity "${title}" uses wearable sync (Apple Watch, Garmin, Fitbit) — not video AI.
If proof was submitted anyway, set activity_verified=false and recommendation=needs_review.
${reported}
Return JSON only.`;
  }

  if (FITNESS_SLUGS.has(slug) || params.sportKey === "fitness") {
    return `Analyze this fitness/gym proof for "${title}".
- Verify exercise matches activity (reps, holds, cardio machine readout).
- Count reps or read timer/hold duration if clearly visible.
- Gym equipment and form should match the challenge type.
- Flag stock footage, wrong exercise, or unreadable displays.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "pickleball" || slug.startsWith("pickleball")) {
    return `Analyze this pickleball proof for "${title}".
- Court, net, paddles, and pickleball should be visible.
- For rallies/serves: verify continuous authentic play.
- For match scores: read final score if shown.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "tennis" || slug.startsWith("tennis")) {
    return `Analyze this tennis proof for "${title}".
- Court, racket, and ball visible; authentic tennis setting.
- Serve speed screens or rally footage should match activity.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "soccer" || slug.startsWith("soccer")) {
    return `Analyze this soccer proof for "${title}".
- Ball, goal, field, or juggle sequence visible.
- Penalty kicks: verify shooter, goal, and make/miss sequence.
- Juggle/crossbar: count contacts or successful hits if clear.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "volleyball" || slug.startsWith("volleyball")) {
    return `Analyze this volleyball proof for "${title}".
- Net, court, and volleyball visible.
- Serve target drills: verify serves landing in intended zones if marked.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "frisbee" || slug.startsWith("frisbee")) {
    return `Analyze this frisbee/disc proof for "${title}".
- Thrower, disc flight, and target/basket visible.
- Count successful target hits if targets are shown.
${reported}
Return JSON only.`;
  }

  if (params.mode === "match_proof") {
    return `Analyze this head-to-head match proof for "${title}".
- Both competitors or teams should be identifiable.
- Final score or winning moment should be visible or stated.
- Flag if only one player shown without result context.
${reported}
Return JSON only.`;
  }

  if (slug === "horse_rounds_survived" || String(params.gameType ?? "").toLowerCase().includes("horse")) {
    return `Analyze this HORSE basketball proof.
- Trick shot attempt and letter progression if shown.
- Verify authentic basketball setting.
${reported}
Return JSON only.`;
  }

  if (slug === "knockout_survivor_rounds" || String(params.gameType ?? "").toLowerCase().includes("knockout")) {
    return `Analyze this Knockout basketball proof.
- Multiple shooters queue; last player standing wins.
- Verify knockout format and final winner moment.
${reported}
Return JSON only.`;
  }

  if (params.sportKey === "basketball") {
    return `Analyze this basketball proof for "${title}".
- Court, hoop, players visible; authentic game or drill footage.
- Final score or stat (points, makes, streak) if displayed.
${reported}
Return JSON only.`;
  }

  return `Analyze this sports proof for "${title}".
- Verify authentic footage/photo for the claimed activity.
- Read any visible score, time, count, or distance.
- Flag obvious edits, wrong sport, or missing result evidence.
${reported}
Return JSON only.`;
}

export type ValidatorKind =
  | "shot_tracker"
  | "golf_vision"
  | "vision_count"
  | "vision_time"
  | "vision_distance"
  | "vision_match"
  | "vision_streak"
  | "vision_level";

export function jsonSchemaForValidator(kind: ValidatorKind | null | undefined): string {
  const base = `{
  "activity_verified": boolean,
  "summary": "1-2 sentences",
  "confidence": 0.0-1.0,
  "flags": ["string"],
  "recommendation": "approved|needs_review|rejected",
  "score_matches_reported": boolean`;
  switch (kind) {
    case "golf_vision":
      return `${base},
  "detected_distance": number or null,
  "detected_count": integer or null,
  "detected_score": "string or null"
}`;
    case "vision_time":
      return `${base},
  "detected_time_sec": number or null,
  "detected_score": "string or null"
}`;
    case "vision_distance":
      return `${base},
  "detected_distance": number or null,
  "detected_score": "string or null"
}`;
    case "vision_match":
      return `${base},
  "both_players_visible": boolean,
  "detected_score": "string or null"
}`;
    case "vision_streak":
      return `${base},
  "detected_streak": integer or null,
  "detected_count": integer or null,
  "detected_score": "string or null"
}`;
    case "vision_level":
      return `${base},
  "detected_level": integer or null,
  "detected_score": "string or null"
}`;
    default:
      return `${base},
  "detected_count": integer or null,
  "detected_score": "string or null"
}`;
  }
}
