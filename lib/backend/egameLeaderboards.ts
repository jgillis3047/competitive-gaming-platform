import { supabase } from "./supabaseClient";
import { getLeaderboardCategory } from "../data/leaderboardTaxonomy";

export async function submitEgameLeaderboardResult(params: {
  categorySlug: string;
  subjectType: "user" | "team";
  userId?: string | null;
  teamId?: string | null;
  scoreValue: number;
  challengeId?: string | null;
  proofMediaPath?: string | null;
}): Promise<void> {
  const { categorySlug, subjectType, userId, teamId, scoreValue, challengeId, proofMediaPath } = params;
  const category = getLeaderboardCategory(categorySlug);
  if (!category || category.family !== "egames") throw new Error("Unknown e-game leaderboard category.");
  if (!Number.isFinite(scoreValue)) throw new Error("Score is required.");
  if (subjectType === "user" && !userId) throw new Error("Missing user for player submission.");
  if (subjectType === "team" && !teamId) throw new Error("Missing team for team submission.");

  const scopeKey = `egame|${categorySlug}`;
  const entryType = subjectType;

  if (subjectType === "team") {
    const { data: existing } = await supabase
      .from("king_leaderboard_entries")
      .select("id,score_value")
      .eq("scope_key", scopeKey)
      .eq("entry_type", "team")
      .eq("team_id", teamId)
      .maybeSingle();

    if (existing?.id) {
      const current = Number((existing as any).score_value ?? 0);
      const next = category.higherIsBetter ? Math.max(current, scoreValue) : Math.min(current || scoreValue, scoreValue);
      await supabase.from("king_leaderboard_entries").update({ score_value: next, updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
    } else {
      await supabase.from("king_leaderboard_entries").insert({
        scope_key: scopeKey,
        entry_type: entryType,
        team_id: teamId,
        user_id: null,
        score_value: scoreValue,
        higher_is_better: category.higherIsBetter,
      });
    }
  } else {
    const { data: existing } = await supabase
      .from("king_leaderboard_entries")
      .select("id,score_value")
      .eq("scope_key", scopeKey)
      .eq("entry_type", "user")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.id) {
      const current = Number((existing as any).score_value ?? 0);
      const next = category.higherIsBetter ? Math.max(current, scoreValue) : Math.min(current || scoreValue, scoreValue);
      await supabase.from("king_leaderboard_entries").update({ score_value: next, updated_at: new Date().toISOString() }).eq("id", (existing as any).id);
    } else {
      await supabase.from("king_leaderboard_entries").insert({
        scope_key: scopeKey,
        entry_type: entryType,
        user_id: userId,
        team_id: null,
        score_value: scoreValue,
        higher_is_better: category.higherIsBetter,
      });
    }
  }

  // Keep a submission trail for moderation/audits.
  await supabase.from("egame_results").insert({
    category_slug: categorySlug,
    match_id: challengeId ?? null,
    submitted_by: userId ?? null,
    subject_type: subjectType,
    user_id: subjectType === "user" ? userId ?? null : null,
    team_id: subjectType === "team" ? teamId ?? null : null,
    score_value: scoreValue,
    proof_media_path: proofMediaPath ?? null,
  });

  await supabase.rpc("refresh_king_badge_slot", { p_scope_key: scopeKey });
}
