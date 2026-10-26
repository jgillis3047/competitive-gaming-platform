// lib/backend/data/walletStore.ts
import { create } from "zustand";
import {
  WalletSnapshot,
  WalletTransactionRow,
  ensureWalletAccountForUser,
  fetchWalletSnapshot,
  redeemFunds,
} from "../backend/walletService"; // ✅ because walletService is in lib/backend/

import { useAuthStore } from "../data/authStore"; // ✅ because authStore is in lib/data/
import { devError, devWarn } from "../utils/devLog";


type WalletState = {
  wallet: WalletSnapshot | null;
  transactions: WalletTransactionRow[];
  loading: boolean;
  error: string | null;

  balance: number;
  totalWon: number;
  totalEntryFees: number;
  totalRefunds: number;
  totalRedeemed: number;
  totalBonus: number;

  clearError: () => void;
  loadFromBackend: () => Promise<void>;
  refresh: () => Promise<void>;
  redeemItem: (costCents: number, sourceRef?: string | null) => Promise<void>;
};

function computeTotals(txs: WalletTransactionRow[]) {
  let totalWon = 0;
  let totalEntryFees = 0;
  let totalRefunds = 0;
  let totalRedeemed = 0;
  let totalBonus = 0;

  for (const t of txs) {
    const amt = Number((t as any).amount_cents ?? 0);
    const src = String(t.source ?? "");

    if (src === "reward") totalWon += Math.max(0, amt);

    if (src === "entry_fee_creator" || src === "entry_fee_opponent") {
      totalEntryFees += Math.max(0, -amt);
    }

    if (src === "refund") totalRefunds += Math.max(0, amt);
    if (src === "redeem") totalRedeemed += Math.max(0, -amt);

    if (src === "bonus" || src === "purchase") totalBonus += Math.max(0, amt);
  }

  return { totalWon, totalEntryFees, totalRefunds, totalRedeemed, totalBonus };
}

function isSingleRowCoerceError(e: any) {
  const msg = String(e?.message ?? e ?? "");
  return (
    msg.includes("Cannot coerce the result to a single JSON object") ||
    msg.includes("JSON object requested, multiple (or no) rows returned") ||
    msg.includes("multiple rows returned") ||
    msg.includes("PGRST")
  );
}

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  transactions: [],
  loading: false,
  error: null,

  balance: 0,
  totalWon: 0,
  totalEntryFees: 0,
  totalRefunds: 0,
  totalRedeemed: 0,
  totalBonus: 0,

  clearError: () => set({ error: null }),

  loadFromBackend: async () => {
    const user = useAuthStore.getState().user;

    if (!user?.id) {
      set({
        wallet: null,
        transactions: [],
        loading: false,
        error: "User not authenticated",
        balance: 0,
        totalWon: 0,
        totalEntryFees: 0,
        totalRefunds: 0,
        totalRedeemed: 0,
        totalBonus: 0,
      });
      return;
    }

    set({ loading: true, error: null });

    const hardReset = (message: string) => {
      set({
        wallet: null,
        transactions: [],
        loading: false,
        error: message,
        balance: 0,
        totalWon: 0,
        totalEntryFees: 0,
        totalRefunds: 0,
        totalRedeemed: 0,
        totalBonus: 0,
      });
    };

    try {
      // ✅ Ensure wallet exists (idempotent)
      await ensureWalletAccountForUser(user.id);

      // ✅ Snapshot loader takes NO ARGS
      const snap = await fetchWalletSnapshot();
      const txs = snap.transactions ?? [];
      const totals = computeTotals(txs);

      set({
        wallet: snap,
        transactions: txs,
        loading: false,
        error: null,
        balance: Number((snap as any).balanceCents ?? 0),
        ...totals,
      });
    } catch (e: any) {
      if (isSingleRowCoerceError(e)) {
        try {
          console.warn("[walletStore] snapshot single-row error; retrying after ensureWalletAccountForUser");
          await ensureWalletAccountForUser(user.id);

          const snap2 = await fetchWalletSnapshot();
          const txs2 = snap2.transactions ?? [];
          const totals2 = computeTotals(txs2);

          set({
            wallet: snap2,
            transactions: txs2,
            loading: false,
            error: null,
            balance: Number((snap2 as any).balanceCents ?? 0),
            ...totals2,
          });
          return;
        } catch (e2: any) {
          devError("[walletStore] loadFromBackend retry error:", e2);
          hardReset(e2?.message ?? "Failed to load wallet");
          return;
        }
      }

      devError("[walletStore] loadFromBackend error:", e);
      hardReset(e?.message ?? "Failed to load wallet");
    }
  },

  refresh: async () => {
    await get().loadFromBackend();
  },

  redeemItem: async (costCents: number, sourceRef?: string | null) => {
    const user = useAuthStore.getState().user;
    if (!user?.id) throw new Error("Not authenticated");

    if (!Number.isFinite(costCents) || costCents <= 0) {
      throw new Error("Invalid redemption cost.");
    }

    await redeemFunds(costCents, sourceRef ?? null);
    await get().refresh();
  },
}));
