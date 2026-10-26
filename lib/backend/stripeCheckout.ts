// lib/backend/stripeCheckout.ts - In-app Payment Sheet (PaymentIntent) for real-money payments
import { supabase } from "./supabaseClient";

const MONEY_PACKS = [
  { amountCents: 499, usd: 4.99 },
  { amountCents: 999, usd: 9.99 },
  { amountCents: 1999, usd: 19.99 },
  { amountCents: 3999, usd: 39.99 },
] as const;

export type MoneyPack = (typeof MONEY_PACKS)[number];

export const MONEY_PACK_OPTIONS = MONEY_PACKS;

const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 500000;

/** Returns a PaymentIntent client secret for the in-app Payment Sheet. Throws if not signed in or Stripe not configured. */
export async function getPaymentIntentClientSecret(
  amountCents: number,
  options?: { purchaseType?: "wallet_topup" | "product_purchase"; sourceRef?: string }
): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in to pay.");
  }
  if (!Number.isInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS || amountCents > MAX_AMOUNT_CENTS) {
    throw new Error("Invalid payment amount.");
  }

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error("App config error: missing EXPO_PUBLIC_SUPABASE_URL.");
  }
  const url = `${baseUrl}/functions/v1/create-payment-intent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        amount_cents: amountCents,
        purchase_type: options?.purchaseType ?? "wallet_topup",
        source_ref: options?.sourceRef ?? null,
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error";
    throw new Error(`Payment request failed: ${msg}`);
  }

  const data = await res.json().catch(() => ({}));
  const errMsg = (data as { error?: string }).error;

  if (!res.ok) {
    if (errMsg) throw new Error(errMsg);
    throw new Error(`Could not start payment (${res.status}).`);
  }

  const clientSecret = (data as { clientSecret?: string }).clientSecret;
  if (!clientSecret) {
    throw new Error("No client secret returned.");
  }
  return clientSecret;
}
