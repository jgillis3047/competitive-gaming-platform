import { createClient } from "@supabase/supabase-js";
import { serve } from "std/http/server.ts";

serve(async () => {
  // ✅ Create Supabase client using service role
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
      },
    }
  );

  console.log("[edge] expire-open-challenges started");

  // ✅ Call Postgres RPC
  const { data, error } = await supabase.rpc("expire_open_challenges");

  if (error) {
    console.error("[edge] RPC error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  console.log("[edge] expired challenges count:", data);

  return new Response(
    JSON.stringify({
      ok: true,
      expired: data ?? 0,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
});
