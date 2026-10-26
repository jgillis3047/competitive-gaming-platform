// supabase/functions/send-push/index.ts
// Sends push notification to a user via Expo Push API
import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { targetUserId, title, body, link } = (await req.json()) as {
      targetUserId?: string;
      title?: string;
      body?: string;
      link?: string;
    };

    if (!targetUserId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing targetUserId, title, or body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Verify caller is authenticated
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: tokens, error: tokensErr } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", targetUserId);

    if (tokensErr || !tokens?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messages = tokens
      .map((r: { token: string }) => r.token)
      .filter((t: string) => t && t.startsWith("ExponentPushToken["))
      .map((t: string) => ({
        to: t,
        title,
        body,
        ...(link ? { data: { link } } : {}),
      }));

    if (messages.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    const pushData = await pushRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ ok: true, sent: messages.length, pushData }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e: unknown) {
    console.error("[send-push] error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
