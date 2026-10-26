// lib/backend/pushService.ts
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabaseClient";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permissions and return Expo push token.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== "granted") return null;

  const projectId =
    (await import("expo-constants")).default.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    // Push tokens require an Expo project ID. Run `eas init` or add EXPO_PUBLIC_PROJECT_ID to .env
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data ?? null;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync failed:", e);
    return null;
  }
}

/**
 * Register push token for the current user.
 */
export async function registerPushToken(userId: string): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;

  const platform = Platform.OS;
  await supabase.from("push_tokens").upsert(
    { user_id: userId, token, platform },
    { onConflict: "user_id,token" }
  );
}

export { sendPushToUser } from "./pushServiceSend";
