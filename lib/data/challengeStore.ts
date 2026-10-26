// app/data/challengeStore.ts
import { create } from "zustand";

/**
 * Backed by the "status" column in Supabase.
 */
export type ChallengeStatus =
  | "open"
  | "accepted"
  | "in-progress"
  | "checked-in"
  | "completed"
  | "cancelled"
  | "disputed";

/**
 * Optional: your player role for *this user* (set when you build the feed rows).
 * This makes it easy to know which score field is "mine".
 */
export type ChallengeRole = "creator" | "opponent";

/**
 * This is your UI-facing model. It includes:
 * - DB fields (created_by, entry_fee_cents, win_reward_cents, winner_user_id, etc.)
 * - UI convenience fields (createdBy handle string, players string, entryFee label, etc.)
 *
 * IMPORTANT:
 * - We DO NOT store "winner = me/opponent" anymore.
 * - We store "winner_user_id" from Supabase and compute Win/Loss in the UI.
 */
export type Challenge = {
  // ---- Required ----
  id: string;
  title: string;
  gameType: string;
  status: ChallengeStatus;

  // ---- DB-ish fields (recommended to keep) ----
  kind?: "phone" | "in_person" | "admin_event" | null;
  created_by?: string | null;          // uuid in Supabase
  entry_fee_cents?: number | null;     // int4 in Supabase
  win_reward_cents?: number | null;    // int4 in Supabase
  winner_user_id?: string | null;      // uuid of actual winner (or null for tie)
  completed_at?: string | null;
  message?: string | null;
  in_person_rules?: any | null;
  checkin_deadline?: string | null;

  // If you’re keeping scores on challenges table:
  creator_score?: number | null;
  opponent_score?: number | null;

  // ---- UI convenience fields (your existing app uses these) ----
  createdBy?: string;                  // display string like "@you"
  players?: string;                    // e.g. "1 / 2 players"
  entryFee?: string;                   // e.g. "Free" or "$1.00"
  entryFeeCents?: number | null;       // alias used in UI in some places
  winRewardCents?: number | null;      // alias used in UI in some places

  // Optional “my perspective” fields for immediate UI display
  myRole?: ChallengeRole;              // "creator" | "opponent" for THIS user
  myScore?: number | null;             // local/UI only
  opponentScore?: number | null;       // local/UI only
    invite_only?: boolean | null;
  invited_user_id?: string | null;
  share_code?: string | null;

  // ✅ HIGH-VALUE improvement: locks join to one user (even if invite_only=false)
  opponent_user_id?: string | null;
  show_competitor_names_public?: boolean | null;

  // Sponsored challenge (marketplace)
  sponsored_by_seller_id?: string | null;
  sponsored_seller_name?: string | null;
};

/**
 * Helper outcome for UI (computed from winner_user_id + current userId).
 */
export type ChallengeOutcome = "win" | "loss" | "tie" | "pending";

export type ChallengeStore = {
  // state
  challenges: Challenge[];

  // list helpers
  setChallenges: (list: Challenge[]) => void;
  addChallenge: (challenge: Challenge) => void;
  upsertChallenge: (challenge: Challenge) => void;
  removeChallenge: (id: string) => void;

  // status helpers
  acceptChallenge: (id: string) => void;
  updateChallengeStatus: (id: string, status: ChallengeStatus) => void;

  // phone-game helper: set my local score (NO winner logic here)
  recordMyScore: (challengeId: string, score: number) => void;

  // when you fetch the newest challenge row from Supabase, call this
  applyServerChallengeUpdate: (challenge: Partial<Challenge> & { id: string }) => void;

  // UI helper: compute win/loss/tie/pending using DB winner_user_id
  getOutcomeForUser: (challengeId: string, userId: string) => ChallengeOutcome;
};

export const useChallengeStore = create<ChallengeStore>()((set, get) => ({
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  challenges: [],

  // ---------------------------------------------------------------------------
  // Core list helpers
  // ---------------------------------------------------------------------------
  setChallenges: (list: Challenge[]) => {
    set({ challenges: list });
  },

  addChallenge: (challenge: Challenge) => {
    set((state) => ({
      challenges: [challenge, ...state.challenges],
    }));
  },

  upsertChallenge: (challenge: Challenge) => {
    set((state) => {
      const idx = state.challenges.findIndex((c) => c.id === challenge.id);

      if (idx === -1) {
        return { challenges: [challenge, ...state.challenges] };
      }

      const updated = [...state.challenges];
      updated[idx] = { ...updated[idx], ...challenge };
      return { challenges: updated };
    });
  },

  removeChallenge: (id: string) => {
    set((state) => ({
      challenges: state.challenges.filter((c) => c.id !== id),
    }));
  },

  // ---------------------------------------------------------------------------
  // Status helpers (local view)
  // ---------------------------------------------------------------------------
  acceptChallenge: (id: string) => {
    set((state) => ({
      challenges: state.challenges.map((c) =>
        c.id === id ? { ...c, status: "accepted" } : c
      ),
    }));
  },

  updateChallengeStatus: (id: string, status: ChallengeStatus) => {
    set((state) => ({
      challenges: state.challenges.map((c) =>
        c.id === id ? { ...c, status } : c
      ),
    }));
  },

  // ---------------------------------------------------------------------------
  // Phone-game helper: only update MY score locally.
  // DO NOT decide winner here (that must come from Supabase).
  // ---------------------------------------------------------------------------
  recordMyScore: (challengeId: string, score: number) => {
    set((state) => ({
      challenges: state.challenges.map((c) => {
        if (c.id !== challengeId) return c;

        // store my score for UI
        const updated: Challenge = {
          ...c,
          myScore: score,
          // optional: also mark in-progress locally
          status: c.status === "accepted" ? "in-progress" : c.status,
        };

        // If you know myRole, mirror into creator_score/opponent_score for display
        if (updated.myRole === "creator") {
          updated.creator_score = score;
        } else if (updated.myRole === "opponent") {
          updated.opponent_score = score;
        }

        return updated;
      }),
    }));
  },

  // ---------------------------------------------------------------------------
  // Apply a server update (fresh row from Supabase) into the store.
  // This is what makes BOTH phones agree on winner/status immediately
  // once you fetch and upsert the latest row.
  // ---------------------------------------------------------------------------
  applyServerChallengeUpdate: (challenge) => {
    set((state) => {
      const idx = state.challenges.findIndex((c) => c.id === challenge.id);

      if (idx === -1) {
        return { challenges: [challenge as Challenge, ...state.challenges] };
      }

      const updated = [...state.challenges];
      updated[idx] = {
        ...updated[idx],
        ...challenge,

        // keep aliases consistent (these help your UI not break)
        entryFeeCents:
          (challenge.entryFeeCents as any) ??
          (challenge.entry_fee_cents as any) ??
          updated[idx].entryFeeCents ??
          updated[idx].entry_fee_cents ??
          null,

        winRewardCents:
          (challenge.winRewardCents as any) ??
          (challenge.win_reward_cents as any) ??
          updated[idx].winRewardCents ??
          updated[idx].win_reward_cents ??
          null,
                  // keep invite/lock fields consistent if any UI uses camelCase
        invite_only:
          (challenge as any).invite_only ?? (challenge as any).inviteOnly ?? updated[idx].invite_only ?? null,

        invited_user_id:
          (challenge as any).invited_user_id ?? (challenge as any).invitedUserId ?? updated[idx].invited_user_id ?? null,

        opponent_user_id:
          (challenge as any).opponent_user_id ?? (challenge as any).opponentUserId ?? updated[idx].opponent_user_id ?? null,

        share_code:
          (challenge as any).share_code ?? (challenge as any).shareCode ?? updated[idx].share_code ?? null,

      };

      // mirror DB scores into UI scores if present
      if (typeof updated[idx].creator_score === "number" && updated[idx].myRole === "creator") {
        updated[idx].myScore = updated[idx].creator_score;
      }
      if (typeof updated[idx].opponent_score === "number" && updated[idx].myRole === "opponent") {
        updated[idx].myScore = updated[idx].opponent_score;
      }

      return { challenges: updated };
    });
  },

  // ---------------------------------------------------------------------------
  // UI helper: winner_user_id -> win/loss/tie/pending
  // ---------------------------------------------------------------------------
  getOutcomeForUser: (challengeId: string, userId: string) => {
    const ch = get().challenges.find((c) => c.id === challengeId);
    if (!ch) return "pending";
    if (ch.status !== "completed") return "pending";

    // tie if no winner_user_id
    if (!ch.winner_user_id) return "tie";

    return ch.winner_user_id === userId ? "win" : "loss";
  },
}));
