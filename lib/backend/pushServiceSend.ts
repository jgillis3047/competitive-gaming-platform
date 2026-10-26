// lib/backend/pushServiceSend.ts - Send push via Edge Function (no expo-notifications)
// Split out so notifications.ts can import without loading expo-notifications (Expo Go).
import { supabase } from "./supabaseClient";

/**
 * Call Edge Function to send push to a user.
 * Pass `link` (e.g. /post/123, /user/abc) to enable tap-to-navigate.
 */
export async function sendPushToUser(params: {
  targetUserId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  const base =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    (await import("expo-constants")).default.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return;
  const url = `${base}/functions/v1/send-push`;
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.warn("[push] sendPushToUser failed:", e);
  }
}
