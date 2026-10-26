// Edge Function: create in-app notification using service role (bypasses RLS).
// Caller must send JWT; we validate and then insert for targetUserId.
import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES = [
  "post_like",
  "post_comment",
  "challenge_accepted",
  "challenge_invite",
  "challenge_win",
  "new_friend",
  "new_follower",
  "badge_unlocked",
  "daily_reward",
  "seller_approved",
  "seller_rejected",
  "king_leaderboard_status",
  "leaderboard_qualification",
];

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { targetUserId?: string; type?: string; title?: string; body?: string | null; link?: string | null };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { targetUserId, type, title, body: bodyText, link } = body;
  if (!targetUserId || !type || !title) {
    return new Response(JSON.stringify({ error: "Missing targetUserId, type, or title" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const normalizedType = type === "new_follower" ? "new_friend" : type;

  if (!ALLOWED_TYPES.includes(normalizedType)) {
    return new Response(JSON.stringify({ error: "Notification type not allowed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (targetUserId === user.id) {
    return new Response(JSON.stringify({ error: "Cannot create notification for self via this endpoint" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("notifications")
    .insert({
      user_id: targetUserId,
      type: normalizedType,
      title,
      body: bodyText ?? null,
      link: link ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: data?.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
