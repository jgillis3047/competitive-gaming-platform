import Constants from "expo-constants";

/**
 * Single source of truth for product name and deep-link scheme.
 * Change APP_DISPLAY_NAME here to rebrand across Stripe, shares, and UI.
 */
export const APP_DISPLAY_NAME = "Arena";

/** Support inbox for Report screen and mailto links. Set `EXPO_PUBLIC_SUPPORT_EMAIL` in `.env` / EAS secrets. */
export const SUPPORT_EMAIL = (() => {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_SUPPORT_EMAIL === "string" ? process.env.EXPO_PUBLIC_SUPPORT_EMAIL.trim() : "";
  const fromExtra = String(Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  return fromEnv || fromExtra || "support@yourapp.com";
})();

/** Short line for auth / marketing (optional). */
export const APP_TAGLINE = "Real-world ranked territory. Defend your crown.";

/**
 * URL scheme for deep links (Stripe return, password reset, etc.).
 * Must match `scheme` in app.json — do not change lightly once users have links.
 */
export const APP_SCHEME = "gamingapp54";

/** Shown on Stripe payment sheet / wallet. */
export const MERCHANT_DISPLAY_NAME = APP_DISPLAY_NAME;
