// lib/hooks/usePushRegistration.ts
import { isRunningInExpoGo } from "expo";
import { useEffect } from "react";
import { useAuthStore } from "../data/authStore";
import { devWarn } from "../utils/devLog";

/**
 * Registers push token when user is logged in.
 * Skips in Expo Go (push removed in SDK 53); use a development build for push.
 */
export function usePushRegistration() {
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;
    if (isRunningInExpoGo()) return;
    import("../backend/pushService").then(({ registerPushToken }) =>
      registerPushToken(userId).catch((e) => devWarn("[usePushRegistration] failed:", e))
    );
  }, [userId]);
}
