/**
 * Validates paths from notifications / push payloads before router.push.
 * Allows only relative in-app routes (no schemes, no path traversal).
 */
export function isSafeInAppPath(link: string | null | undefined): link is string {
  const t = String(link ?? "").trim();
  if (!t.startsWith("/")) return false;
  if (t.length > 512) return false;
  if (t.includes("..")) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("//") || lower.includes("://")) return false;
  return true;
}

/**
 * Full path from a deep link (may include `?query`). Validates pathname only, then returns
 * the trimmed string if safe (blocks open-redirect style `?next=http://...` when path is fine).
 */
export function safeRouterPathFromDeepLink(fullPath: string | null | undefined): string | null {
  const raw = String(fullPath ?? "").trim();
  if (!raw || raw.length > 2048) return null;
  const pathOnly = raw.split("?")[0] ?? "";
  if (!isSafeInAppPath(pathOnly)) return null;
  if (raw.includes("://")) return null;
  return raw;
}
