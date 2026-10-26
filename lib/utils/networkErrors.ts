/**
 * Maps low-level React Native fetch failures to a short, actionable UI message.
 */
export function humanizeFetchError(err: unknown, fallback: string): string {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  if (/error code:\s*521/i.test(msg)) {
    return "Supabase is temporarily unreachable (HTTP 521). This is usually an upstream outage; wait a moment and pull to refresh.";
  }
  if (/network request failed/i.test(msg)) {
    return "Can't reach Supabase (no connection or DNS). In the emulator open Chrome → google.com. Turn off VPN. Confirm Project URL in Supabase Dashboard → Settings → API matches EXPO_PUBLIC_SUPABASE_URL, then restart Expo with a cleared cache: npx expo start -c";
  }
  if (/timed out/i.test(msg)) {
    return "Request timed out. Try again on Wi‑Fi, turn off VPN, or start Expo with tunnel mode: npm run start:tunnel";
  }
  const t = msg.trim();
  return t || fallback;
}
