// lib/backend/walletService.ts
import { supabase } from "./supabaseClient";

/**
 * DB TRUTH (your schema):
 * wallet_accounts: id, user_id, balance_cents, created_at, updated_at
 * wallet_transactions: id, wallet_id, type, description, created_at, amount_cents, source, source_ref, status
 *
 * IMPORTANT:
 * - DO NOT reference memo (doesn't exist)
 * - DO NOT reference user_id on wallet_transactions (doesn't exist)
 * - ALWAYS write wallet_transactions.type (NOT NULL)
 */

export type WalletTxType =
  // IMPORTANT: must match DB constraint wallet_transactions_type_check
  // CHECK (type = ANY (ARRAY['win'::text, 'entry_fee'::text, 'bonus'::text, 'redeem'::text]))
  | "win"
  | "entry_fee"
  | "bonus"
  | "redeem";

export type WalletTxStatus = "posted" | "pending" | "failed";

export type WalletAccountRow = {
  id: string;
  user_id: string;
  balance_cents: number;
};

export type WalletTransactionRow = {
  id: string;
  wallet_id: string;
  type: WalletTxType; // NOT NULL
  description: string | null;
  amount_cents: number;
  source: string | null; // semantic: entry_fee_creator | entry_fee_opponent | reward | refund | redeem | bonus | etc
  source_ref: string | null; // challengeId, redemptionId, etc
  status: WalletTxStatus | null;
  created_at: string;
};

export type WalletSnapshot = {
  walletId: string;
  balanceCents: number;
  transactions: WalletTransactionRow[];
};

// ---------------------------
// helpers
// ---------------------------

function toNum(n: any, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function requireNonEmptyString(value: unknown, label: string) {
  if (!value || typeof value !== "string") throw new Error(`Invalid ${label}.`);
}

function requireFiniteNumber(value: unknown, label: string) {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}.`);
}

async function requireAuthedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const userId = data?.user?.id;
  if (!userId) throw new Error("Not authenticated (missing user).");
  return userId;
}

// ---------------------------
// wallet core
// ---------------------------

/**
 * Returns wallet_accounts.id (walletId).
 *
 * OPTION A (trigger-based wallets):
 * - Do NOT insert wallet_accounts from the client. RLS will block it.
 * - Wallet rows are created server-side on auth.users insert via trigger.
 *
 * If a user exists without a wallet row (accounts created before the trigger was added),
 * this function throws a clear error instead of attempting an INSERT that will violate RLS.
 */
export async function ensureWalletForUser(userId: string): Promise<string> {
  requireNonEmptyString(userId, "userId");

  const { data: existing, error: findErr } = await supabase
    .from("wallet_accounts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return String(existing.id);

  // No client INSERT here (Option A). If this happens, the wallet trigger hasn't created a row.
  // Fix by backfilling wallets server-side (admin SQL) or re-creating the user.
  throw new Error(
    "Wallet not initialized for this account. If you enabled trigger-based wallets (Option A), backfill wallet_accounts for existing users or sign out/in after migration."
  );
}

export const ensureWalletAccountForUser = ensureWalletForUser;

export async function ensureWalletForCurrentUser(): Promise<string> {
  const userId = await requireAuthedUserId();
  return ensureWalletForUser(userId);
}

export async function getWalletForUser(userId: string): Promise<{ id: string; balance_cents: number }> {
  requireNonEmptyString(userId, "userId");

  const { data, error } = await supabase
    .from("wallet_accounts")
    .select("id, balance_cents")
    .eq("user_id", userId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Wallet not found.");
  return {
    id: String(data.id),
    balance_cents: toNum((data as any).balance_cents, 0),
  };
}

export async function fetchTransactions(walletId: string, limit = 50): Promise<WalletTransactionRow[]> {
  requireNonEmptyString(walletId, "walletId");

  // NOTE: select ONLY existing columns
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, wallet_id, type, description, amount_cents, source, source_ref, status, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    wallet_id: String(r.wallet_id),
    type: String(r.type) as WalletTxType,
    description: r.description ?? null,
    amount_cents: toNum(r.amount_cents, 0),
    source: r.source ?? null,
    source_ref: r.source_ref ?? null,
    status: (r.status ?? null) as WalletTxStatus | null,
    created_at: String(r.created_at),
  })) as WalletTransactionRow[];
}

/**
 * Snapshot for CURRENT USER (NO ARGS)
 */
export async function fetchWalletSnapshot(): Promise<WalletSnapshot> {
  const userId = await requireAuthedUserId();
  const walletId = await ensureWalletForUser(userId);
  const acct = await getWalletForUser(userId);
  const txs = await fetchTransactions(walletId, 100);

  return { walletId, balanceCents: acct.balance_cents, transactions: txs };
}

export async function loadWalletFromBackend(): Promise<WalletSnapshot> {
  return fetchWalletSnapshot();
}

// ---------------------------
// idempotency guard
// ---------------------------

export async function hasWalletTx(params: {
  walletId: string;
  source: string;
  sourceRef: string;
}): Promise<boolean> {
  const { walletId, source, sourceRef } = params;
  requireNonEmptyString(walletId, "walletId");
  requireNonEmptyString(source, "source");
  requireNonEmptyString(sourceRef, "sourceRef");

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("wallet_id", walletId)
    .eq("source", source)
    .eq("source_ref", sourceRef)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

// ---------------------------
// mutation primitives
// ---------------------------

export async function applyWalletDelta(params: {
  amountCents: number; // +credit, -debit
  type: WalletTxType; // REQUIRED (NOT NULL)
  source: string; // semantic
  sourceRef?: string | null;
  description?: string | null;
  status?: WalletTxStatus | null;
}): Promise<void> {
  const { amountCents, type, source, sourceRef, description, status } = params;
  requireFiniteNumber(amountCents, "amountCents");
  if (amountCents === 0) throw new Error("amountCents must be non-zero.");
  requireNonEmptyString(type, "type");
  requireNonEmptyString(source, "source");

  const userId = await requireAuthedUserId();
  return applyWalletDeltaForUser({
    userId,
    amountCents,
    type,
    source,
    sourceRef: sourceRef ?? null,
    description: description ?? null,
    status: status ?? "posted",
  });
}

export async function applyWalletDeltaForUser(params: {
  userId: string;
  amountCents: number;
  type: WalletTxType; // REQUIRED
  source: string; // semantic
  sourceRef?: string | null;
  description?: string | null;
  status?: WalletTxStatus | null;
}): Promise<void> {
  const { userId, amountCents, type, source, sourceRef, description, status } = params;

  requireNonEmptyString(userId, "userId");
  requireFiniteNumber(amountCents, "amountCents");
  if (amountCents === 0) throw new Error("amountCents must be non-zero.");
  requireNonEmptyString(type, "type");
  requireNonEmptyString(source, "source");

  const walletId = await ensureWalletForUser(userId);

  // read current
  const { data: acct, error: acctErr } = await supabase
    .from("wallet_accounts")
    .select("balance_cents")
    .eq("id", walletId)
    .single();

  if (acctErr || !acct) throw new Error(acctErr?.message ?? "Could not load wallet.");

  const current = toNum((acct as any).balance_cents, 0);
  const next = current + toNum(amountCents, 0);
  if (next < 0) throw new Error("Insufficient wallet balance.");

  // update balance
  const { error: upErr } = await supabase
    .from("wallet_accounts")
    .update({ balance_cents: next })
    .eq("id", walletId);

  if (upErr) throw new Error(upErr.message);

  // insert tx (MUST include type)
  const { error: txErr } = await supabase.from("wallet_transactions").insert([
    {
      wallet_id: walletId,
      type, // ✅ NOT NULL
      description: description ?? null,
      amount_cents: toNum(amountCents, 0),
      source,
      source_ref: sourceRef ?? null,
      status: status ?? "posted",
    },
  ]);

  if (txErr) throw new Error(txErr.message);
}

// ---------------------------
// convenience (current user)
// ---------------------------

export async function addBonusCents(bonusCents: number, sourceRef?: string | null) {
  requireFiniteNumber(bonusCents, "bonusCents");
  if (bonusCents <= 0) return;
  return applyWalletDelta({
    amountCents: Math.abs(bonusCents),
    type: "bonus",
    source: "bonus",
    sourceRef: sourceRef ?? null,
    description: sourceRef ? `Bonus (${sourceRef})` : "Bonus",
    status: "posted",
  });
}

/**
 * DEV / pre-Stripe purchase:
 * Credits funds immediately and records a wallet_transactions row with source="purchase".
 * When Stripe is wired, you can keep this function but call it only after webhook confirmation.
 */
export async function addPurchasedCents(params: {
  amountCents: number;
  usdAmount: number;
  sourceRef?: string | null;
}) {
  const { amountCents, usdAmount, sourceRef } = params;

  requireFiniteNumber(amountCents, "amountCents");
  requireFiniteNumber(usdAmount, "usdAmount");

  if (amountCents <= 0) return;

  const ref = sourceRef ?? `usd_${Number(usdAmount).toFixed(2)}`;

  return applyWalletDelta({
    amountCents: Math.abs(amountCents),
    type: "bonus",
    source: "purchase",
    sourceRef: ref,
    description: `Wallet top-up (${Number(usdAmount).toFixed(2)} USD)`,
    status: "posted",
  });
}

export async function redeemFunds(costCents: number, sourceRef?: string | null) {
  requireFiniteNumber(costCents, "costCents");
  if (costCents <= 0) throw new Error("costCents must be > 0");
  return applyWalletDelta({
    amountCents: -Math.abs(costCents),
    type: "redeem",
    source: "redeem",
    sourceRef: sourceRef ?? null,
    description: sourceRef ? `Redeem (${sourceRef})` : "Redeem",
    status: "posted",
  });
}

// ---------------------------
// settlement helpers (explicit userId)
// ---------------------------

export async function chargeEntryFeeCreator(userId: string, entryFeeCents: number, challengeId: string) {
  if (entryFeeCents <= 0) return;
  const walletId = await ensureWalletForUser(userId);
  const already = await hasWalletTx({ walletId, source: "entry_fee_creator", sourceRef: challengeId });
  if (already) return;

  return applyWalletDeltaForUser({
    userId,
    amountCents: -Math.abs(entryFeeCents),
    type: "entry_fee",
    source: "entry_fee_creator",
    sourceRef: challengeId,
    description: `Entry fee (creator) for ${challengeId}`,
    status: "posted",
  });
}

export async function chargeEntryFeeOpponent(userId: string, entryFeeCents: number, challengeId: string) {
  if (entryFeeCents <= 0) return;
  const walletId = await ensureWalletForUser(userId);
  const already = await hasWalletTx({ walletId, source: "entry_fee_opponent", sourceRef: challengeId });
  if (already) return;

  return applyWalletDeltaForUser({
    userId,
    amountCents: -Math.abs(entryFeeCents),
    type: "entry_fee",
    source: "entry_fee_opponent",
    sourceRef: challengeId,
    description: `Entry fee (opponent) for ${challengeId}`,
    status: "posted",
  });
}

export async function awardChallengeWin(userId: string, rewardCents: number, challengeId: string) {
  if (rewardCents <= 0) return;
  const walletId = await ensureWalletForUser(userId);
  const already = await hasWalletTx({ walletId, source: "reward", sourceRef: challengeId });
  if (already) return;

  return applyWalletDeltaForUser({
    userId,
    amountCents: Math.abs(rewardCents),
    type: "win",
    source: "reward",
    sourceRef: challengeId,
    description: `Reward for ${challengeId}`,
    status: "posted",
  });
}

export async function refundEntryFeeForChallenge(userId: string, entryFeeCents: number, challengeId: string) {
  if (entryFeeCents <= 0) return;
  const walletId = await ensureWalletForUser(userId);
  const already = await hasWalletTx({ walletId, source: "refund", sourceRef: challengeId });
  if (already) return;

  return applyWalletDeltaForUser({
    userId,
    amountCents: Math.abs(entryFeeCents),
    type: "entry_fee",
    source: "refund",
    sourceRef: challengeId,
    description: `Refund for ${challengeId}`,
    status: "posted",
  });
}

// ---------------------------
// compatibility export used elsewhere
// ---------------------------

export async function addBonusToWallet(userId: string, amount: number, sourceRef?: string | null) {
  requireNonEmptyString(userId, "userId");
  requireFiniteNumber(amount, "amount");
  if (amount <= 0) return;

  return applyWalletDeltaForUser({
    userId,
    amountCents: Math.abs(amount),
    type: "bonus",
    source: "bonus",
    sourceRef: sourceRef ?? null,
    description: sourceRef ? `Bonus (${sourceRef})` : "Bonus",
    status: "posted",
  });
}
