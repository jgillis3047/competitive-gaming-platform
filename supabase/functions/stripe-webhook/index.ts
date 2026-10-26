// Supabase Edge Function: Stripe webhook — credit wallet on checkout.session.completed
// Configure in Stripe Dashboard: Webhook endpoint → this function URL, event checkout.session.completed
import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";
import Stripe from "stripe";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeSecret || !webhookSecret) {
    console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Server config error", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(stripeSecret);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid signature";
    console.error("Webhook signature verification failed:", msg);
    return new Response(msg, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id;
  const amountCentsStr = session.metadata?.amount_cents;
  if (!userId || !amountCentsStr) {
    console.error("Missing user_id or amount_cents in session metadata");
    return new Response("Bad metadata", { status: 400 });
  }

  const amountCents = parseInt(amountCentsStr, 10);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return new Response("Invalid amount_cents", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: wallet, error: walletErr } = await supabase
    .from("wallet_accounts")
    .select("id, balance_cents")
    .eq("user_id", userId)
    .single();

  if (walletErr || !wallet) {
    console.error("Wallet not found for user:", userId, walletErr);
    return new Response("Wallet not found", { status: 500 });
  }

  const walletId = wallet.id;

  // Idempotency: Stripe may retry webhooks; avoid double credit
  const { data: existing } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("wallet_id", walletId)
    .eq("source", "purchase")
    .eq("source_ref", session.id)
    .limit(1);

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ received: true, already_credited: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const currentBalance = Number((wallet as any).balance_cents ?? 0);
  const newBalance = currentBalance + amountCents;

  const { error: updateErr } = await supabase
    .from("wallet_accounts")
    .update({ balance_cents: newBalance })
    .eq("id", walletId);

  if (updateErr) {
    console.error("Failed to update wallet balance:", updateErr);
    return new Response("Update failed", { status: 500 });
  }

  const { error: txErr } = await supabase.from("wallet_transactions").insert({
    wallet_id: walletId,
    type: "bonus",
    description: `Wallet top-up ($${(amountCents / 100).toFixed(2)})`,
    amount_cents: amountCents,
    source: "purchase",
    source_ref: session.id ?? null,
    status: "posted",
  });

  if (txErr) {
    console.error("Failed to insert wallet_transaction:", txErr);
    return new Response("Transaction insert failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true, credited: amountCents }), {
    headers: { "Content-Type": "application/json" },
  });
});
