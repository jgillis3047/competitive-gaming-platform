// lib/backend/account.ts - account-level actions (delete, etc.)
import { supabase } from "./supabaseClient";

export async function deleteAccount(): Promise<void> {
  const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !sessionRes?.session?.access_token) {
    throw new Error("You must be signed in to delete your account.");
  }

  const token = sessionRes.session.access_token;
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("Supabase URL not configured.");
  }

  const res = await fetch(`${base}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    let msg = "Could not delete account.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}

