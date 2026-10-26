// Supabase Edge Function: create Stripe Checkout Session for wallet top-ups
// POST with body: { "amount_cents": 499 } (one of 499, 999, 1999, 3999)
// Requires Authorization: Bearer <user_jwt>
import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";
import Stripe from "stripe";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONEY_PACKS: Record<number, number> = {
  499: 499,
  999: 999,
  1999: 1999,
  3999: 3999,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecret) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { amount_cents?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const amountCents = Number(body.amount_cents);
  const priceCents = MONEY_PACKS[amountCents];
  if (!Number.isInteger(amountCents) || !priceCents) {
    return new Response(
      JSON.stringify({ error: "amount_cents must be one of: 499, 999, 1999, 3999" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const rawAppUrl = Deno.env.get("APP_URL") || "https://example.com";
  const base = rawAppUrl.replace(/\/$/, "");
  const successUrl = base.includes("://")
    ? `${base}/shop?wallet_topped_up=1`
    : `https://${base}/shop?wallet_topped_up=1`;
  const cancelUrl = base.includes("://") ? `${base}/shop` : `https://${base}/shop`;

  const stripe = new Stripe(stripeSecret);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Wallet top-up ($${(amountCents / 100).toFixed(2)})`,
              description: "Add funds to your in-app wallet",
            },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        amount_cents: String(amountCents),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Stripe error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
