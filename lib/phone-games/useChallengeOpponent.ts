import { useEffect, useState } from "react";

import { supabase } from "../backend/supabaseClient";
import { useAuthStore } from "../data/authStore";

/** Loads locked opponent for rematch CTA after a challenge game */
export function useChallengeOpponent(challengeId: string | null) {
  const user = useAuthStore((s) => s.user);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!challengeId) {
      setOpponentUserId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: players } = await supabase
        .from("challenge_players")
        .select("user_id")
        .eq("challenge_id", challengeId);

      if (cancelled) return;

      const myId = user?.id ? String(user.id) : null;
      const fromPlayers = (players ?? []).map((p) => String((p as any).user_id));
      const oppFromPlayers = myId ? fromPlayers.find((id) => id !== myId) ?? null : null;

      if (oppFromPlayers) {
        setOpponentUserId(oppFromPlayers);
        return;
      }

      const { data } = await supabase
        .from("challenges")
        .select("opponent_user_id, created_by")
        .eq("id", challengeId)
        .maybeSingle();
      if (cancelled || !data) return;
      const createdBy = data.created_by ? String(data.created_by) : null;
      const opp =
        data.opponent_user_id != null
          ? String(data.opponent_user_id)
          : myId && createdBy && myId === createdBy
            ? null
            : createdBy;
      setOpponentUserId(opp);
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId, user?.id]);

  return opponentUserId;
}
