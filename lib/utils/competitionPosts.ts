import type { PostWithExtras } from "../backend/posts";

/** Posts that belong in Arena — always tied to competition, territory, or crowns. */
export function isCompetitionPost(p: PostWithExtras): boolean {
  if (p.challenge_id) return true;
  if (p.kind === "post_game") return true;

  const payload = p.payload && typeof p.payload === "object" ? p.payload : {};
  const automation = String((payload as any).automation ?? "").trim();
  if (automation === "court_podium" || automation === "badge_unlock") return true;

  if ((payload as any).court_id || (payload as any).record_slug) return true;
  if ((payload as any).badge_key || (payload as any).challenge_id) return true;
  if ((payload as any).scope_key?.toString?.().includes("|")) return true;

  const body = `${p.body ?? ""} ${p.caption ?? ""}`.toLowerCase();
  if (
    body.includes("king") ||
    body.includes("crown") ||
    body.includes("dethron") ||
    body.includes("🏅") ||
    body.includes("👑") ||
    body.includes("medal") ||
    body.includes("podium")
  ) {
    return true;
  }

  return false;
}

/** Crown moments for Pulse — dethronings, kings, badges, arena podium (not generic highlights). */
export function isCrownMomentPost(p: PostWithExtras): boolean {
  if (!isCompetitionPost(p)) return false;

  const payload = p.payload && typeof p.payload === "object" ? p.payload : {};
  const automation = String((payload as any).automation ?? "").trim();
  if (automation === "court_podium" || automation === "badge_unlock") return true;
  if ((payload as any).court_id || (payload as any).record_slug) return true;
  if ((payload as any).scope_key?.toString?.().includes("|")) return true;

  const body = `${p.body ?? ""} ${p.caption ?? ""}`.toLowerCase();
  return (
    body.includes("king") ||
    body.includes("crown") ||
    body.includes("dethron") ||
    body.includes("👑") ||
    body.includes("podium") ||
    body.includes("medal")
  );
}
