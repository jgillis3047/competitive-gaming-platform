import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

const DEFAULT_DSN =
  "https://96311207da2aa2c9e2afa4611275c86a@o4511063210721280.ingest.us.sentry.io/4511063226187776";

function getDsn(): string {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_SENTRY_DSN === "string" ? process.env.EXPO_PUBLIC_SENTRY_DSN.trim() : "";
  const fromExtra = String(Constants.expoConfig?.extra?.EXPO_PUBLIC_SENTRY_DSN ?? "").trim();
  return fromEnv || fromExtra || DEFAULT_DSN;
}

function scrubEvent(event: Sentry.Event): void {
  if (event.user) {
    const id = event.user.id;
    event.user = id ? { id: String(id) } : undefined;
  }
  if (event.request?.headers) {
    const h = { ...event.request.headers } as Record<string, string>;
    delete h.Authorization;
    delete h.authorization;
    delete h.Cookie;
    delete h.cookie;
    event.request.headers = h;
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      const d = b.data;
      if (d && typeof d === "object" && "url" in d && typeof (d as { url: unknown }).url === "string") {
        const u = (d as { url: string }).url;
        if (u.includes("token=") || u.includes("access_token=")) {
          (d as { url: string }).url = "[redacted]";
        }
      }
    }
  }
}

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn: getDsn(),
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: __DEV__ ? 1.0 : 0.12,
    enableAutoSessionTracking: true,
    ignoreErrors: [
      "Network request failed",
      "Aborted",
      "AbortError",
      "The network connection was lost.",
      "The request timed out.",
    ],
    beforeSend(event) {
      scrubEvent(event);
      return event;
    },
  });
}
