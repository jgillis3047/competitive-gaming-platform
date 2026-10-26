import "react-native-gesture-handler";
import * as Linking from "expo-linking";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { StripeProvider } from "@stripe/stripe-react-native";

import { useAuthStore } from "../lib/data/authStore";
import { initSentry } from "../lib/sentryInit";
import ErrorBoundary from "../lib/ui/ErrorBoundary";
import { APP_SCHEME } from "../lib/theme/brand";
import { safeRouterPathFromDeepLink } from "../lib/utils/inAppPath";

SplashScreen.preventAutoHideAsync().catch(() => {});

initSentry();

// Try process.env first, then app.config extra (baked in at build)
const stripePublishableKey =
  (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    Constants.expoConfig?.extra?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
    "") as string;

export default function RootLayout() {
  const router = useRouter();
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const initialized = useAuthStore((s) => s.initialized);
  const navigationRef = useRef(false);

  // Never leave the native splash up forever (shows as a black screen if JS bundle is slow).
  useEffect(() => {
    if (initialized) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4_000);
    return () => clearTimeout(t);
  }, [initialized]);

  // Restore auth from Supabase's persisted session on startup
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Push notification tap → navigate (skipped in Expo Go — Android remote push removed in SDK 53)
  useEffect(() => {
    if (isRunningInExpoGo()) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    import("expo-notifications").then((Notifications) => {
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { link?: string } | undefined;
        const link = data?.link;
        const safe = typeof link === "string" ? safeRouterPathFromDeepLink(link) : null;
        if (safe && !navigationRef.current) {
          navigationRef.current = true;
          router.push(safe as any);
          setTimeout(() => { navigationRef.current = false; }, 500);
        }
      });
    });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event?.url ?? "";
      if ((url.includes("shop") || url.includes("/shop")) && url.includes("vc_purchased=1")) {
        router.replace("/(tabs)/shop");
        return;
      }
      const match = url.match(new RegExp(`^${APP_SCHEME}://(\\/?.+)`));
      if (match) {
        const path = match[1].startsWith("/") ? match[1] : "/" + match[1];
        const safe = safeRouterPathFromDeepLink(path);
        if (safe) router.push(safe as any);
      }
    };
    const sub = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if ((url.includes("shop") || url.includes("/shop")) && url.includes("vc_purchased=1")) {
        router.replace("/(tabs)/shop");
        return;
      }
      const match = url.match(new RegExp(`^${APP_SCHEME}://(\\/?.+)`));
      if (match) {
        const path = match[1].startsWith("/") ? match[1] : "/" + match[1];
        const safe = safeRouterPathFromDeepLink(path);
        if (safe) router.push(safe as any);
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <ErrorBoundary>
      <StripeProvider publishableKey={stripePublishableKey} urlScheme={APP_SCHEME}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="teams" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="friends/[id]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings-change-username" />
        <Stack.Screen name="settings-change-password" />
        <Stack.Screen name="settings-delete-account" />
        <Stack.Screen name="search" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="orders" />
        <Stack.Screen name="settings-notifications" />
        <Stack.Screen name="settings-blocked" />
        <Stack.Screen name="settings-change-email" />
        <Stack.Screen name="help" />
        <Stack.Screen name="report" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="apply-seller" options={{ title: "Become a seller" }} />
        <Stack.Screen name="admin" />
        <Stack.Screen name="trivia" />
        <Stack.Screen name="courts" />
        <Stack.Screen name="vision" />
        <Stack.Screen name="golf" />
        <Stack.Screen name="practice" />
        {/* DO NOT add challenge/[id] screens here */}
      </Stack>
      </StripeProvider>
    </ErrorBoundary>
  );
}
