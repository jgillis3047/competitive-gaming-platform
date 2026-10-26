// Persist newly earned achievement badges and announce them on the public feed.
import { getBadgeDefinition } from "../data/badgeDefinitions";
import { logActivity } from "./activityFeed";
import { fetchChallengesForUserWithStats } from "./challenges";
import { createGlobalPost } from "./posts";
import { supabase } from "./supabaseClient";

/**
 * Inserts any missing `user_badges` rows for computed achievements and creates one
 * public feed post per **new** badge (idempotent per badge key).
 */
export async function syncEarnedBadgesToFeed(userId: string): Promise<{ posted: number }> {
  const { computedBadges } = await fetchChallengesForUserWithStats(userId);
  if (!computedBadges.length) return { posted: 0 };

  const newlyInserted: { key: string; label: string }[] = [];
  for (const { key, label } of computedBadges) {
    const { error } = await supabase.from("user_badges").insert({ user_id: userId, badge_key: key });

    if (error) {
      const code = String((error as any).code ?? "");
      if (code === "23505") continue;
      console.warn("[badgeFeedSync] insert user_badges:", error.message);
      continue;
    }
    newlyInserted.push({ key, label });
  }

  if (newlyInserted.length === 0) return { posted: 0 };

  let posted = 0;

  const announceOne = async (key: string, label: string) => {
    const def = getBadgeDefinition(key);
    const title = def?.label ?? label ?? key;
    const body = `🏅 Unlocked "${title}"${def?.description ? ` — ${def.description}` : ""}`;
    await createGlobalPost({
      user_id: userId,
      body,
      kind: "highlight",
      visibility: "public",
      payload: {
        automation: "badge_unlock",
        badge_key: key,
        badge_label: title,
      },
    });
    posted += 1;
    await logActivity(userId, "badge_earned", { badge_key: key, badge_label: title }).catch(() => {});
  };

  try {
    if (newlyInserted.length > 6) {
      const labels = newlyInserted.map(({ key, label }) => getBadgeDefinition(key)?.label ?? label);
      await createGlobalPost({
        user_id: userId,
        body: `🏅 Unlocked ${newlyInserted.length} new badges: ${labels.slice(0, 8).join(", ")}${labels.length > 8 ? "…" : ""}`,
        kind: "highlight",
        visibility: "public",
        payload: {
          automation: "badge_unlock",
          badge_key: newlyInserted[0].key,
          badge_label: "multiple",
          badge_keys: newlyInserted.map((x) => x.key),
        },
      });
      posted = 1;
    } else {
      for (const { key, label } of newlyInserted) {
        try {
          await announceOne(key, label);
        } catch (e: any) {
          console.warn("[badgeFeedSync] createGlobalPost:", e?.message ?? e);
        }
      }
    }
  } catch (e: any) {
    console.warn("[badgeFeedSync] batch post:", e?.message ?? e);
  }

  return { posted };
}
